package operation_setting

import (
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

type MonitorSetting struct {
	AutoTestChannelEnabled bool    `json:"auto_test_channel_enabled"`
	AutoTestChannelMinutes float64 `json:"auto_test_channel_minutes"`

	// 全局默认 429 冷静期（秒），0 = 禁用，作为所有渠道/模型的兜底默认值
	RateLimitCooldownSeconds int `json:"rate_limit_cooldown_seconds"`

	// 全局模型级冷静期，key = 模型名，value = 秒数，优先级高于 RateLimitCooldownSeconds
	RateLimitModelCooldowns map[string]int `json:"rate_limit_model_cooldowns"`

	// 全部渠道冷静时返回给客户端的报错消息模板，支持 Go template
	// 可用变量：{{.Model}}
	RateLimitAllCooldownMessage string `json:"rate_limit_all_cooldown_message"`

	// 全局默认 RPM 限制（每分钟请求数），0 = 不限制，作为所有渠道/模型的兜底默认值
	RpmLimit int `json:"rpm_limit"`

	// 全局模型级 RPM 限制，key = 模型名，value = 每分钟请求数，优先级高于 RpmLimit
	RpmModelLimits map[string]int `json:"rpm_model_limits"`

	// 全部渠道 RPM 超限时返回给客户端的报错消息模板，支持 Go template
	// 可用变量：{{.Model}}
	RpmAllLimitMessage string `json:"rpm_all_limit_message"`

	// 全局默认重试耗时阈值（秒），0 = 不限制；请求累计耗时达到阈值后跳过后续重试
	RetryElapsedThresholdSeconds int `json:"retry_elapsed_threshold_seconds"`

	// 全局模型级重试耗时阈值，key = 模型名，value = 秒数，优先级高于 RetryElapsedThresholdSeconds
	RetryElapsedModelThresholds map[string]int `json:"retry_elapsed_model_thresholds"`
}

// 默认配置
var monitorSetting = MonitorSetting{
	AutoTestChannelEnabled:       false,
	AutoTestChannelMinutes:       10,
	RateLimitCooldownSeconds:     60,
	RateLimitModelCooldowns:      map[string]int{},
	RateLimitAllCooldownMessage:  `All channels for model "{{.Model}}" are currently rate-limited, please retry after a moment.`,
	RpmLimit:                     0,
	RpmModelLimits:               map[string]int{},
	RpmAllLimitMessage:           `All channels for model "{{.Model}}" have exceeded their RPM limit, please retry after a moment.`,
	RetryElapsedThresholdSeconds: 0,
	RetryElapsedModelThresholds:  map[string]int{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("monitor_setting", &monitorSetting)
}

func GetMonitorSetting() *MonitorSetting {
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err == nil && frequency > 0 {
			monitorSetting.AutoTestChannelEnabled = true
			monitorSetting.AutoTestChannelMinutes = float64(frequency)
		}
	}
	return &monitorSetting
}
