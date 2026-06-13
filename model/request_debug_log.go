package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

type RequestDebugLog struct {
	Id                int64  `json:"id" gorm:"primaryKey;index:idx_request_debug_logs_created_id,priority:2"`
	RequestLogID      string `json:"request_log_id" gorm:"size:96;index"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index:idx_request_debug_logs_created_id,priority:1"`
	Method            string `json:"method" gorm:"size:16;default:''"`
	Path              string `json:"path" gorm:"size:512;index;default:''"`
	RequestID         string `json:"request_id" gorm:"size:64;index;default:''"`
	UpstreamRequestID string `json:"upstream_request_id" gorm:"size:128;index;default:''"`
	UserID            int    `json:"user_id" gorm:"index"`
	Username          string `json:"username" gorm:"size:128;index;default:''"`
	TokenID           int    `json:"token_id" gorm:"index"`
	TokenName         string `json:"token_name" gorm:"size:128;index;default:''"`
	ChannelID         int    `json:"channel_id" gorm:"index"`
	ChannelName       string `json:"channel_name" gorm:"size:128;default:''"`
	ChannelType       int    `json:"channel_type" gorm:"index"`
	ModelName         string `json:"model_name" gorm:"size:128;index;default:''"`
	UpstreamModelName string `json:"upstream_model_name" gorm:"size:128;index;default:''"`
	StatusCode        int    `json:"status_code" gorm:"index"`
	Error             string `json:"error"`
	DurationMs        int64  `json:"duration_ms" gorm:"index"`
	Failed            bool   `json:"failed" gorm:"index"`
	Stream            bool   `json:"stream"`
	Truncated         bool   `json:"truncated"`
	ApproxBytes       int64  `json:"approx_bytes"`
	RequestBodySize   int64  `json:"request_body_size"`
	ResponseBodySize  int64  `json:"response_body_size"`
	UpstreamBodySize  int64  `json:"upstream_body_size"`
	Payload           string `json:"payload"`
}

func (RequestDebugLog) TableName() string {
	return "request_debug_logs"
}

type RequestDebugLogQuery struct {
	Model         string
	ChannelID     int
	TokenID       int
	TokenName     string
	StatusCode    int
	RequestID     string
	ExcludeLogIDs []string
}

func requestDebugLogDB() (*gorm.DB, error) {
	if LOG_DB == nil {
		return nil, fmt.Errorf("log database is not initialized")
	}
	return LOG_DB, nil
}

func CreateRequestDebugLogs(logs []RequestDebugLog, batchSize int) error {
	if len(logs) == 0 {
		return nil
	}
	if batchSize <= 0 || batchSize > len(logs) {
		batchSize = len(logs)
	}
	db, err := requestDebugLogDB()
	if err != nil {
		return err
	}
	return db.CreateInBatches(logs, batchSize).Error
}

func CountRequestDebugLogs() (int64, error) {
	db, err := requestDebugLogDB()
	if err != nil {
		return 0, err
	}
	var count int64
	if err := db.Model(&RequestDebugLog{}).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func ListRequestDebugLogs(query RequestDebugLogQuery, offset int, limit int) ([]RequestDebugLog, int64, error) {
	if limit <= 0 {
		return []RequestDebugLog{}, 0, nil
	}
	db, err := requestDebugLogDB()
	if err != nil {
		return nil, 0, err
	}
	tx := applyRequestDebugLogQuery(db.Model(&RequestDebugLog{}), query)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []RequestDebugLog
	err = tx.Order("created_at DESC").Order("id DESC").Offset(offset).Limit(limit).Find(&logs).Error
	return logs, total, err
}

func GetRequestDebugLogByID(id int64) (RequestDebugLog, bool, error) {
	if id <= 0 {
		return RequestDebugLog{}, false, nil
	}
	db, err := requestDebugLogDB()
	if err != nil {
		return RequestDebugLog{}, false, err
	}
	var log RequestDebugLog
	err = db.First(&log, id).Error
	if err == nil {
		return log, true, nil
	}
	if err == gorm.ErrRecordNotFound {
		return RequestDebugLog{}, false, nil
	}
	return RequestDebugLog{}, false, err
}

func GetRequestDebugLogByRequestLogID(id string) (RequestDebugLog, bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return RequestDebugLog{}, false, nil
	}
	db, err := requestDebugLogDB()
	if err != nil {
		return RequestDebugLog{}, false, err
	}
	var log RequestDebugLog
	err = db.Where("request_log_id = ?", id).Order("id DESC").First(&log).Error
	if err == nil {
		return log, true, nil
	}
	if err == gorm.ErrRecordNotFound {
		return RequestDebugLog{}, false, nil
	}
	return RequestDebugLog{}, false, err
}

func DeleteAllRequestDebugLogs() (int64, error) {
	db, err := requestDebugLogDB()
	if err != nil {
		return 0, err
	}
	result := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&RequestDebugLog{})
	return result.RowsAffected, result.Error
}

func applyRequestDebugLogQuery(tx *gorm.DB, query RequestDebugLogQuery) *gorm.DB {
	if query.Model != "" {
		pattern := "%" + strings.ToLower(strings.TrimSpace(query.Model)) + "%"
		tx = tx.Where("LOWER(model_name) LIKE ? OR LOWER(upstream_model_name) LIKE ?", pattern, pattern)
	}
	if query.ChannelID > 0 {
		tx = tx.Where("channel_id = ?", query.ChannelID)
	}
	if query.TokenID > 0 {
		tx = tx.Where("token_id = ?", query.TokenID)
	}
	if query.TokenName != "" {
		tx = tx.Where("LOWER(token_name) LIKE ?", "%"+strings.ToLower(strings.TrimSpace(query.TokenName))+"%")
	}
	if query.StatusCode > 0 {
		tx = tx.Where("status_code = ?", query.StatusCode)
	}
	if query.RequestID != "" {
		pattern := "%" + strings.ToLower(strings.TrimSpace(query.RequestID)) + "%"
		tx = tx.Where("LOWER(request_id) LIKE ? OR LOWER(upstream_request_id) LIKE ?", pattern, pattern)
	}
	if len(query.ExcludeLogIDs) > 0 {
		tx = tx.Where("request_log_id NOT IN ?", query.ExcludeLogIDs)
	}
	return tx
}
