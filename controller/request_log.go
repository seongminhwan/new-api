package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetRequestLogSettings(c *gin.Context) {
	common.ApiSuccess(c, service.GetRequestLogSettingsPayload())
}

func GetRequestLogOptions(c *gin.Context) {
	payload, err := service.GetRequestLogOptions(parsePositiveQueryInt(c, "limit"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, payload)
}

func UpdateRequestLogSettings(c *gin.Context) {
	var settings service.RequestLogSettings
	if err := common.DecodeJson(c.Request.Body, &settings); err != nil {
		common.ApiError(c, err)
		return
	}
	payload, err := service.UpdateRequestLogSettings(settings)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, payload)
}

func GetRequestLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	query := service.RequestLogQuery{
		Offset:     pageInfo.GetStartIdx(),
		Limit:      pageInfo.GetPageSize(),
		Model:      strings.TrimSpace(c.Query("model")),
		TokenName:  strings.TrimSpace(c.Query("token_name")),
		RequestID:  strings.TrimSpace(c.Query("request_id")),
		ChannelID:  parsePositiveQueryInt(c, "channel_id"),
		TokenID:    parsePositiveQueryInt(c, "token_id"),
		StatusCode: parsePositiveQueryInt(c, "status_code"),
	}
	result := service.ListRequestLogs(query)
	pageInfo.SetTotal(result.Total)
	pageInfo.SetItems(result.Items)
	common.ApiSuccess(c, pageInfo)
}

func GetRequestLog(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	entry, ok := service.GetRequestLogEntry(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "request log not found",
		})
		return
	}
	common.ApiSuccess(c, entry)
}

type requestLogExportRequest struct {
	IDs []string `json:"ids"`
}

func ExportRequestLogs(c *gin.Context) {
	var req requestLogExportRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": service.GetRequestLogEntries(req.IDs),
	})
}

func DeleteRequestLogs(c *gin.Context) {
	common.ApiSuccess(c, service.ClearRequestLogs())
}

func DeletePersistedRequestLogs(c *gin.Context) {
	stats, err := service.ClearPersistedRequestLogs()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

func parsePositiveQueryInt(c *gin.Context, key string) int {
	value, err := strconv.Atoi(strings.TrimSpace(c.Query(key)))
	if err != nil || value < 0 {
		return 0
	}
	return value
}
