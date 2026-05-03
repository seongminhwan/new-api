package model

// CooldownFuncs 由 service 包在启动时注入，避免 model → service 的循环依赖
// 参考项目中 common.TranslateMessage 的注入模式（i18n/i18n.go:58）
var (
	// IsChannelModelInCooldownFunc 检查渠道+模型是否在冷静期
	IsChannelModelInCooldownFunc func(channelId int, modelName string) bool

	// RenderAllCooldownMessageFunc 渲染全部渠道冷静时的报错消息
	RenderAllCooldownMessageFunc func(modelName string) string
)

// CooldownError 表示所有渠道都在冷静期的错误，用于让上层区分是否返回 429
type CooldownError struct {
	Message string
}

func (e *CooldownError) Error() string {
	return e.Message
}

// IsCooldownError 判断 error 是否为冷静期错误
func IsCooldownError(err error) bool {
	_, ok := err.(*CooldownError)
	return ok
}
