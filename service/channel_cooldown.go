package service

import (
	"bytes"
	"fmt"
	"sync"
	"text/template"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const defaultAllCooldownMessage = `All channels for model "{{.Model}}" are currently rate-limited, please retry after a moment.`

// ── 内存冷静期存储（Redis 不可用时的 fallback） ──

// memoryCooldowns 存储 key → 过期时间戳
var memoryCooldowns sync.Map

// memoryGCOnce 确保后台清理协程只启动一次
var memoryGCOnce sync.Once

// startMemoryGC 启动后台协程，定期扫描并删除过期 key，防止内存泄漏
func startMemoryGC() {
	memoryGCOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(5 * time.Minute)
			for range ticker.C {
				now := time.Now()
				memoryCooldowns.Range(func(key, value any) bool {
					if expireAt, ok := value.(time.Time); ok && now.After(expireAt) {
						memoryCooldowns.Delete(key)
					}
					return true
				})
			}
		}()
	})
}

func memorySet(key string, duration time.Duration) {
	startMemoryGC()
	memoryCooldowns.Store(key, time.Now().Add(duration))
}

func memoryExists(key string) bool {
	v, ok := memoryCooldowns.Load(key)
	if !ok {
		return false
	}
	expireAt := v.(time.Time)
	if time.Now().After(expireAt) {
		memoryCooldowns.Delete(key)
		return false
	}
	return true
}

// cooldownRedisKey 生成 Redis key
// 格式：channel_cooldown:{channelId}:{modelName}
func cooldownRedisKey(channelId int, modelName string) string {
	return fmt.Sprintf("channel_cooldown:%d:%s", channelId, modelName)
}

// ResolveCooldownDuration 四层优先级查找冷静时长
//
// 查找顺序（高 → 低）：
//  1. 渠道模型级：channelSetting.RateLimitModelCooldowns[modelName]
//  2. 渠道级：    channelSetting.RateLimitCooldownSeconds
//  3. 全局模型级：global.RateLimitModelCooldowns[modelName]
//  4. 全局级：    global.RateLimitCooldownSeconds
//
// 任意一层命中（包括值为 0 的显式禁用）即停止查找。
// 返回 0 表示不启用冷静期。
func ResolveCooldownDuration(channelSetting dto.ChannelSettings, modelName string) time.Duration {
	global := operation_setting.GetMonitorSetting()

	// 1. 渠道模型级
	if channelSetting.RateLimitModelCooldowns != nil {
		if secs, ok := channelSetting.RateLimitModelCooldowns[modelName]; ok {
			return time.Duration(secs) * time.Second
		}
	}

	// 2. 渠道级
	if channelSetting.RateLimitCooldownSeconds != nil {
		return time.Duration(*channelSetting.RateLimitCooldownSeconds) * time.Second
	}

	// 3. 全局模型级
	if len(global.RateLimitModelCooldowns) > 0 {
		if secs, ok := global.RateLimitModelCooldowns[modelName]; ok {
			return time.Duration(secs) * time.Second
		}
	}

	// 4. 全局级（兜底）
	return time.Duration(global.RateLimitCooldownSeconds) * time.Second
}

// SetChannelModelCooldown 触发冷静期
// 优先写入 Redis，Redis 不可用时 fallback 到内存
// 冷静时长为 0 时直接跳过
func SetChannelModelCooldown(channelId int, modelName string, channelSetting dto.ChannelSettings) {
	duration := ResolveCooldownDuration(channelSetting, modelName)
	if duration <= 0 {
		return
	}
	key := cooldownRedisKey(channelId, modelName)
	if common.RedisEnabled {
		value := fmt.Sprintf("%d", time.Now().Unix())
		if err := common.RedisSet(key, value, duration); err != nil {
			common.SysLog(fmt.Sprintf("failed to set channel cooldown in redis, fallback to memory: channel_id=%d, model=%s, error=%v", channelId, modelName, err))
			memorySet(key, duration)
		}
	} else {
		memorySet(key, duration)
	}
}

// IsChannelModelInCooldown 检查渠道+模型组合是否在冷静期
// 优先查 Redis，Redis 不可用时或 Redis 写入失败 fallback 到内存
// 同时检查内存，因为 Redis 写入失败时会 fallback 写入内存
func IsChannelModelInCooldown(channelId int, modelName string) bool {
	key := cooldownRedisKey(channelId, modelName)
	if common.RedisEnabled {
		_, err := common.RedisGet(key)
		if err == nil {
			return true
		}
	}
	return memoryExists(key)
}

// RenderAllCooldownMessage 渲染全部渠道冷静时的报错消息
// 模板变量：{{.Model}}
// 模板解析或执行失败时降级返回默认消息
func RenderAllCooldownMessage(modelName string) string {
	tmplStr := operation_setting.GetMonitorSetting().RateLimitAllCooldownMessage
	if tmplStr == "" {
		tmplStr = defaultAllCooldownMessage
	}

	tmpl, err := template.New("cooldown_msg").Parse(tmplStr)
	if err != nil {
		return fmt.Sprintf("All channels for model %q are currently rate-limited, please retry after a moment.", modelName)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, map[string]string{"Model": modelName}); err != nil {
		return fmt.Sprintf("All channels for model %q are currently rate-limited, please retry after a moment.", modelName)
	}
	return buf.String()
}

// RegisterCooldownHooks 将冷静期函数注入 model 包，避免循环依赖
// 应在程序启动时调用（main 或 service 包 init）
func RegisterCooldownHooks() {
	model.IsChannelModelInCooldownFunc = IsChannelModelInCooldown
	model.RenderAllCooldownMessageFunc = RenderAllCooldownMessage
}
