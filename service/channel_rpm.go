package service

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"sync"
	"text/template"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const defaultAllRpmLimitMessage = `All channels for model "{{.Model}}" have exceeded their RPM limit, please retry after a moment.`

// ── 内存 RPM 计数器（Redis 不可用时的 fallback） ──

// rpmWindowPair 存储两个相邻分钟窗口的计数，用于近似滑动窗口算法
type rpmWindowPair struct {
	mu           sync.Mutex
	currentMin   int64 // 当前窗口的分钟时间戳（Unix秒 / 60）
	currentCount int64 // 当前窗口计数
	prevCount    int64 // 上一分钟窗口计数
}

// rotate 检查并轮转窗口，调用方必须持有 mu 锁
func (p *rpmWindowPair) rotate(nowMin int64) {
	if nowMin == p.currentMin {
		return
	}
	if nowMin == p.currentMin+1 {
		// 刚进入下一分钟，上一个窗口的计数保留
		p.prevCount = p.currentCount
		p.currentCount = 0
		p.currentMin = nowMin
	} else {
		// 跳过了多分钟，两个窗口都清零
		p.prevCount = 0
		p.currentCount = 0
		p.currentMin = nowMin
	}
}

// memoryRpmCounters 存储 "rpm:{channelId}:{modelName}" → *rpmWindowPair
var memoryRpmCounters sync.Map

// memoryRpmGCOnce 确保后台清理协程只启动一次
var memoryRpmGCOnce sync.Once

// startMemoryRpmGC 启动后台协程，定期清理过期的 RPM 计数器
func startMemoryRpmGC() {
	memoryRpmGCOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(2 * time.Minute)
			for range ticker.C {
				nowMin := time.Now().Unix() / 60
				memoryRpmCounters.Range(func(key, value any) bool {
					pair := value.(*rpmWindowPair)
					pair.mu.Lock()
					// 超过 3 分钟没有活动的条目可以清理
					if nowMin-pair.currentMin > 3 {
						pair.mu.Unlock()
						memoryRpmCounters.Delete(key)
					} else {
						pair.mu.Unlock()
					}
					return true
				})
			}
		}()
	})
}

// rpmMemoryKey 生成内存存储的 key（不含分钟时间戳）
func rpmMemoryKey(channelId int, modelName string) string {
	return fmt.Sprintf("rpm:%d:%s", channelId, modelName)
}

// rpmRedisKey 生成 Redis key（含分钟时间戳）
func rpmRedisKey(channelId int, modelName string, minuteTs int64) string {
	return fmt.Sprintf("rpm:%d:%s:%d", channelId, modelName, minuteTs)
}

// getOrCreatePair 获取或创建内存计数器
func getOrCreatePair(channelId int, modelName string) *rpmWindowPair {
	startMemoryRpmGC()
	key := rpmMemoryKey(channelId, modelName)
	if v, ok := memoryRpmCounters.Load(key); ok {
		return v.(*rpmWindowPair)
	}
	pair := &rpmWindowPair{currentMin: time.Now().Unix() / 60}
	actual, _ := memoryRpmCounters.LoadOrStore(key, pair)
	return actual.(*rpmWindowPair)
}

// ── RPM 限制解析（四层优先级） ──

// ResolveRpmLimit 四层优先级查找 RPM 限制值
//
// 查找顺序（高 → 低）：
//  1. 渠道模型级：channelSetting.RpmModelLimits[modelName]
//  2. 渠道级：    channelSetting.RpmLimit
//  3. 全局模型级：global.RpmModelLimits[modelName]
//  4. 全局级：    global.RpmLimit
//
// 任意一层命中（包括值为 0 的显式不限制）即停止查找。
// 返回 0 表示不限制 RPM。
func ResolveRpmLimit(channelSetting dto.ChannelSettings, modelName string) int {
	global := operation_setting.GetMonitorSetting()

	// 1. 渠道模型级
	if channelSetting.RpmModelLimits != nil {
		if limit, ok := channelSetting.RpmModelLimits[modelName]; ok {
			return limit
		}
	}

	// 2. 渠道级
	if channelSetting.RpmLimit != nil {
		return *channelSetting.RpmLimit
	}

	// 3. 全局模型级
	if len(global.RpmModelLimits) > 0 {
		if limit, ok := global.RpmModelLimits[modelName]; ok {
			return limit
		}
	}

	// 4. 全局级（兜底）
	return global.RpmLimit
}

// ── 近似滑动窗口：检查 + 递增 ──

// getRedisCount 从 Redis 获取指定 key 的计数值，不存在返回 0
func getRedisCount(key string) int64 {
	val, err := common.RedisGet(key)
	if err != nil {
		return 0
	}
	count, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 0
	}
	return count
}

// estimateRpm 使用近似滑动窗口算法估算当前 RPM
// prevCount: 上一分钟的计数, currCount: 当前分钟的计数
func estimateRpm(prevCount, currCount int64) float64 {
	now := time.Now()
	elapsed := float64(now.Unix()%60) / 60.0
	return float64(prevCount)*(1-elapsed) + float64(currCount)
}

// IsChannelModelRpmExceeded 检查渠道+模型组合是否已超过 RPM 限制
// 使用近似滑动窗口算法：estimated = prevCount * (1 - elapsed) + currCount
// 优先查 Redis，同时检查内存（因为 Redis 写入失败时会 fallback 到内存）
func IsChannelModelRpmExceeded(channelId int, modelName string) bool {
	// 获取渠道设置并解析 RPM 限制
	channel, err := model.CacheGetChannel(channelId)
	if err != nil {
		return false
	}
	channelSetting := channel.GetSetting()
	limit := ResolveRpmLimit(channelSetting, modelName)
	if limit <= 0 {
		return false
	}

	now := time.Now()
	currentMinute := now.Unix() / 60

	var prevCount, currCount int64

	// Redis 路径
	if common.RedisEnabled {
		prevKey := rpmRedisKey(channelId, modelName, currentMinute-1)
		currKey := rpmRedisKey(channelId, modelName, currentMinute)
		prevCount = getRedisCount(prevKey)
		currCount = getRedisCount(currKey)
	}

	// 内存路径（始终检查，因为 Redis 写入可能失败）
	pair := getOrCreatePair(channelId, modelName)
	pair.mu.Lock()
	pair.rotate(currentMinute)
	memPrev := pair.prevCount
	memCurr := pair.currentCount
	pair.mu.Unlock()

	// 合并 Redis 和内存计数（取较大值，避免漏计）
	if memPrev > prevCount {
		prevCount = memPrev
	}
	if memCurr > currCount {
		currCount = memCurr
	}

	estimated := estimateRpm(prevCount, currCount)
	return estimated >= float64(limit)
}

// IncrementChannelModelRpm 递增渠道+模型的 RPM 计数
// 在渠道被选中后调用（请求发出前）
// 优先写入 Redis，Redis 不可用时 fallback 到内存
func IncrementChannelModelRpm(channelId int, modelName string) {
	now := time.Now()
	currentMinute := now.Unix() / 60

	if common.RedisEnabled {
		key := rpmRedisKey(channelId, modelName, currentMinute)
		ctx := context.Background()
		pipe := common.RDB.TxPipeline()
		pipe.Incr(ctx, key)
		pipe.Expire(ctx, key, 120*time.Second) // TTL 120s，覆盖上一分钟的读取
		if _, err := pipe.Exec(ctx); err != nil {
			common.SysLog(fmt.Sprintf("failed to increment RPM in redis, fallback to memory: channel_id=%d, model=%s, error=%v", channelId, modelName, err))
			incrementMemoryRpm(channelId, modelName, currentMinute)
		}
	} else {
		incrementMemoryRpm(channelId, modelName, currentMinute)
	}
}

// incrementMemoryRpm 内存计数器递增
func incrementMemoryRpm(channelId int, modelName string, currentMinute int64) {
	pair := getOrCreatePair(channelId, modelName)
	pair.mu.Lock()
	pair.rotate(currentMinute)
	pair.currentCount++
	pair.mu.Unlock()
}

// ── 消息模板渲染 ──

// RenderAllRpmLimitMessage 渲染全部渠道 RPM 超限时的报错消息
// 模板变量：{{.Model}}
// 模板解析或执行失败时降级返回默认消息
func RenderAllRpmLimitMessage(modelName string) string {
	tmplStr := operation_setting.GetMonitorSetting().RpmAllLimitMessage
	if tmplStr == "" {
		tmplStr = defaultAllRpmLimitMessage
	}

	tmpl, err := template.New("rpm_msg").Parse(tmplStr)
	if err != nil {
		return fmt.Sprintf("All channels for model %q have exceeded their RPM limit, please retry after a moment.", modelName)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, map[string]string{"Model": modelName}); err != nil {
		return fmt.Sprintf("All channels for model %q have exceeded their RPM limit, please retry after a moment.", modelName)
	}
	return buf.String()
}

// ── Hook 注册 ──

// RegisterRpmHooks 将 RPM 限制函数注入 model 包，避免循环依赖
// 应在程序启动时调用（main.go）
func RegisterRpmHooks() {
	model.IsChannelModelRpmExceededFunc = IsChannelModelRpmExceeded
	model.IncrementChannelModelRpmFunc = IncrementChannelModelRpm
	model.RenderAllRpmLimitMessageFunc = RenderAllRpmLimitMessage
}
