package model

// RpmFuncs 由 service 包在启动时注入，避免 model → service 的循环依赖
var (
	// IsChannelModelRpmExceededFunc 检查渠道+模型是否已超过 RPM 限制
	IsChannelModelRpmExceededFunc func(channelId int, modelName string) bool

	// IncrementChannelModelRpmFunc 递增渠道+模型的 RPM 计数（选中渠道后调用）
	IncrementChannelModelRpmFunc func(channelId int, modelName string)

	// RenderAllRpmLimitMessageFunc 渲染全部渠道 RPM 超限时的报错消息
	RenderAllRpmLimitMessageFunc func(modelName string) string
)

// RpmExceededError 表示所有渠道都已达到 RPM 限制的错误，用于让上层区分是否返回 429
type RpmExceededError struct {
	Message     string
	LastChannel *Channel // 最后一个被 RPM 过滤掉的渠道，用于日志记录
}

func (e *RpmExceededError) Error() string {
	return e.Message
}

// IsRpmExceededError 判断 error 是否为 RPM 超限错误
func IsRpmExceededError(err error) bool {
	_, ok := err.(*RpmExceededError)
	return ok
}
