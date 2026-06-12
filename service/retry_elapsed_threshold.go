package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func ResolveRetryElapsedThreshold(modelName string) time.Duration {
	setting := operation_setting.GetMonitorSetting()
	if setting == nil {
		return 0
	}
	if setting.RetryElapsedModelThresholds != nil {
		if seconds, ok := setting.RetryElapsedModelThresholds[modelName]; ok {
			return time.Duration(seconds) * time.Second
		}
	}
	return time.Duration(setting.RetryElapsedThresholdSeconds) * time.Second
}

func ShouldSkipRetryByElapsedThreshold(c *gin.Context, modelName string) (bool, time.Duration, time.Duration) {
	threshold := ResolveRetryElapsedThreshold(modelName)
	if threshold <= 0 {
		return false, 0, 0
	}
	startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
	if startTime.IsZero() {
		return false, threshold, 0
	}
	elapsed := time.Since(startTime)
	return elapsed >= threshold, threshold, elapsed
}
