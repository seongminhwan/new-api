package service

import (
	"bytes"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const (
	requestLogOptionKey             = "request_log_setting"
	requestLogContextKey            = "_request_log_capture"
	requestLogOverflowReplaceOldest = "replace_oldest"
	requestLogOverflowStopSampling  = "stop_sampling"
	defaultRequestLogMaxEntries     = 200
	defaultRequestLogMaxEntryBytes  = int64(4 << 20)
	defaultRequestLogMaxTotalBytes  = int64(64 << 20)
	defaultRequestLogListPageSize   = 20
	maxRequestLogListPageSize       = 100
	defaultRequestLogOptionsLimit   = 1000
	maxRequestLogOptionsLimit       = 2000
	requestLogTimeFormat            = time.RFC3339Nano
)

type RequestLogSettings struct {
	Enabled          bool             `json:"enabled"`
	SampleRate       float64          `json:"sample_rate"`
	MaxEntries       int              `json:"max_entries"`
	OverflowStrategy string           `json:"overflow_strategy"`
	MaxEntryBytes    int64            `json:"max_entry_bytes"`
	MaxTotalBytes    int64            `json:"max_total_bytes"`
	Rules            []RequestLogRule `json:"rules"`
}

type RequestLogRule struct {
	Enabled    bool     `json:"enabled"`
	ChannelIDs []int    `json:"channel_ids,omitempty"`
	Models     []string `json:"models,omitempty"`
	TokenIDs   []int    `json:"token_ids,omitempty"`
	TokenNames []string `json:"token_names,omitempty"`
	TokenKeys  []string `json:"token_keys,omitempty"`
	SampleRate *float64 `json:"sample_rate,omitempty"`
}

type RequestLogStats struct {
	Total            int    `json:"total"`
	TotalBytes       int64  `json:"total_bytes"`
	Stopped          bool   `json:"stopped"`
	Dropped          int64  `json:"dropped"`
	Truncated        int64  `json:"truncated"`
	NextID           uint64 `json:"next_id"`
	MaxEntries       int    `json:"max_entries"`
	MaxEntryBytes    int64  `json:"max_entry_bytes"`
	MaxTotalBytes    int64  `json:"max_total_bytes"`
	OverflowStrategy string `json:"overflow_strategy"`
}

type RequestLogSettingsPayload struct {
	Settings RequestLogSettings `json:"settings"`
	Stats    RequestLogStats    `json:"stats"`
}

type RequestLogOptionsPayload struct {
	Channels []RequestLogChannelOption `json:"channels"`
	Models   []string                  `json:"models"`
	Tokens   []RequestLogTokenOption   `json:"tokens"`
}

type RequestLogChannelOption struct {
	ID     int      `json:"id"`
	Name   string   `json:"name"`
	Type   int      `json:"type"`
	Status int      `json:"status"`
	Models []string `json:"models"`
}

type RequestLogTokenOption struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Group       string `json:"group"`
	Status      int    `json:"status"`
}

type RequestLogQuery struct {
	Offset     int
	Limit      int
	Model      string
	ChannelID  int
	TokenID    int
	TokenName  string
	StatusCode int
	RequestID  string
}

type RequestLogListResult struct {
	Items []RequestLogSummary `json:"items"`
	Total int                 `json:"total"`
}

type RequestLogEntry struct {
	ID                string                `json:"id"`
	CreatedAt         int64                 `json:"created_at"`
	CreatedAtText     string                `json:"created_at_text"`
	DurationMs        int64                 `json:"duration_ms"`
	Method            string                `json:"method"`
	Path              string                `json:"path"`
	Query             string                `json:"query"`
	RequestID         string                `json:"request_id"`
	UpstreamRequestID string                `json:"upstream_request_id"`
	Stream            bool                  `json:"stream"`
	Model             string                `json:"model"`
	UpstreamModel     string                `json:"upstream_model"`
	UserID            int                   `json:"user_id"`
	Username          string                `json:"username"`
	Group             string                `json:"group"`
	TokenID           int                   `json:"token_id"`
	TokenName         string                `json:"token_name"`
	TokenKey          string                `json:"token_key"`
	ChannelID         int                   `json:"channel_id"`
	ChannelName       string                `json:"channel_name"`
	ChannelType       int                   `json:"channel_type"`
	RetryIndex        int                   `json:"retry_index"`
	UsedChannels      []string              `json:"used_channels"`
	StatusCode        int                   `json:"status_code"`
	Error             string                `json:"error,omitempty"`
	Truncated         bool                  `json:"truncated"`
	ApproxBytes       int64                 `json:"approx_bytes"`
	ClientRequest     RequestLogHTTPMessage `json:"client_request"`
	ClientResponse    RequestLogHTTPMessage `json:"client_response"`
	UpstreamAttempts  []RequestLogAttempt   `json:"upstream_attempts"`
}

type RequestLogSummary struct {
	ID                string   `json:"id"`
	CreatedAt         int64    `json:"created_at"`
	DurationMs        int64    `json:"duration_ms"`
	Method            string   `json:"method"`
	Path              string   `json:"path"`
	RequestID         string   `json:"request_id"`
	UpstreamRequestID string   `json:"upstream_request_id"`
	Stream            bool     `json:"stream"`
	Model             string   `json:"model"`
	UpstreamModel     string   `json:"upstream_model"`
	UserID            int      `json:"user_id"`
	Username          string   `json:"username"`
	TokenID           int      `json:"token_id"`
	TokenName         string   `json:"token_name"`
	ChannelID         int      `json:"channel_id"`
	ChannelName       string   `json:"channel_name"`
	ChannelType       int      `json:"channel_type"`
	StatusCode        int      `json:"status_code"`
	Error             string   `json:"error,omitempty"`
	RetryIndex        int      `json:"retry_index"`
	UsedChannels      []string `json:"used_channels"`
	Truncated         bool     `json:"truncated"`
	ApproxBytes       int64    `json:"approx_bytes"`
	RequestBodySize   int64    `json:"request_body_size"`
	ResponseBodySize  int64    `json:"response_body_size"`
	UpstreamBodySize  int64    `json:"upstream_body_size"`
}

type RequestLogAttempt struct {
	Index       int                   `json:"index"`
	StartedAt   int64                 `json:"started_at"`
	DurationMs  int64                 `json:"duration_ms"`
	ChannelID   int                   `json:"channel_id"`
	ChannelName string                `json:"channel_name"`
	ChannelType int                   `json:"channel_type"`
	Error       string                `json:"error,omitempty"`
	Request     RequestLogHTTPMessage `json:"request"`
	Response    RequestLogHTTPMessage `json:"response"`
}

type RequestLogHTTPMessage struct {
	Status        int                 `json:"status,omitempty"`
	Headers       map[string][]string `json:"headers,omitempty"`
	Body          string              `json:"body,omitempty"`
	BodySize      int64               `json:"body_size"`
	BodyTruncated bool                `json:"body_truncated"`
}

type requestLogStore struct {
	mu         sync.Mutex
	loaded     bool
	settings   RequestLogSettings
	entries    []RequestLogEntry
	totalBytes int64
	nextID     uint64
	stopped    bool
	dropped    int64
	truncated  int64
}

type requestLogCapture struct {
	mu             sync.Mutex
	id             string
	startedAt      time.Time
	createdAt      time.Time
	maxEntryBytes  int64
	capturedBytes  int64
	truncated      bool
	finished       bool
	info           *relaycommon.RelayInfo
	clientRequest  *requestLogHTTPCapture
	clientResponse *requestLogHTTPCapture
	attempts       []*requestLogAttemptCapture
}

type requestLogAttemptCapture struct {
	index       int
	startedAt   time.Time
	endedAt     time.Time
	capture     *requestLogCapture
	channelID   int
	channelName string
	channelType int
	errText     string
	request     *requestLogHTTPCapture
	response    *requestLogHTTPCapture
}

type requestLogHTTPCapture struct {
	status        int
	headers       map[string][]string
	body          bytes.Buffer
	bodySize      int64
	bodyTruncated bool
}

type requestLogResponseWriter struct {
	gin.ResponseWriter
	capture *requestLogCapture
}

type requestLogTeeReadCloser struct {
	io.ReadCloser
	capture *requestLogCapture
	target  *requestLogHTTPCapture
	onClose func()
	closed  atomic.Bool
}

var requestLogs = &requestLogStore{
	settings: defaultRequestLogSettings(),
	entries:  make([]RequestLogEntry, 0, defaultRequestLogMaxEntries),
}

func defaultRequestLogSettings() RequestLogSettings {
	return RequestLogSettings{
		Enabled:          false,
		SampleRate:       1,
		MaxEntries:       defaultRequestLogMaxEntries,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    defaultRequestLogMaxEntryBytes,
		MaxTotalBytes:    defaultRequestLogMaxTotalBytes,
		Rules:            []RequestLogRule{},
	}
}

func GetRequestLogSettingsPayload() RequestLogSettingsPayload {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.ensureLoadedLocked()
	return RequestLogSettingsPayload{
		Settings: cloneRequestLogSettings(requestLogs.settings),
		Stats:    requestLogs.statsLocked(),
	}
}

func UpdateRequestLogSettings(settings RequestLogSettings) (RequestLogSettingsPayload, error) {
	normalized, err := normalizeRequestLogSettings(settings)
	if err != nil {
		return RequestLogSettingsPayload{}, err
	}
	raw, err := common.Marshal(normalized)
	if err != nil {
		return RequestLogSettingsPayload{}, err
	}
	if err := model.UpdateOption(requestLogOptionKey, string(raw)); err != nil {
		return RequestLogSettingsPayload{}, err
	}

	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.loaded = true
	requestLogs.settings = normalized
	requestLogs.stopped = false
	requestLogs.trimToLimitsLocked()
	return RequestLogSettingsPayload{
		Settings: cloneRequestLogSettings(requestLogs.settings),
		Stats:    requestLogs.statsLocked(),
	}, nil
}

func GetRequestLogOptions(limit int) (RequestLogOptionsPayload, error) {
	if limit <= 0 {
		limit = defaultRequestLogOptionsLimit
	}
	if limit > maxRequestLogOptionsLimit {
		limit = maxRequestLogOptionsLimit
	}

	var channels []model.Channel
	if err := model.DB.Model(&model.Channel{}).
		Select("id", "name", "type", "status", "models").
		Order("id desc").
		Limit(limit).
		Find(&channels).Error; err != nil {
		return RequestLogOptionsPayload{}, err
	}

	modelSet := make(map[string]bool)
	channelOptions := make([]RequestLogChannelOption, 0, len(channels))
	for i := range channels {
		models := channels[i].GetModels()
		for _, modelName := range models {
			modelName = strings.TrimSpace(modelName)
			if modelName != "" {
				modelSet[modelName] = true
			}
		}
		channelOptions = append(channelOptions, RequestLogChannelOption{
			ID:     channels[i].Id,
			Name:   channels[i].Name,
			Type:   channels[i].Type,
			Status: channels[i].Status,
			Models: models,
		})
	}

	modelOptions := make([]string, 0, len(modelSet))
	for modelName := range modelSet {
		modelOptions = append(modelOptions, modelName)
	}
	sort.Strings(modelOptions)

	var tokens []model.Token
	if err := model.DB.Model(&model.Token{}).
		Select("id", "name", "user_id", "status", "group").
		Order("id desc").
		Limit(limit).
		Find(&tokens).Error; err != nil {
		return RequestLogOptionsPayload{}, err
	}

	userIDs := make([]int, 0, len(tokens))
	seenUsers := make(map[int]bool)
	for _, token := range tokens {
		if token.UserId <= 0 || seenUsers[token.UserId] {
			continue
		}
		seenUsers[token.UserId] = true
		userIDs = append(userIDs, token.UserId)
	}

	usersByID := make(map[int]model.User)
	if len(userIDs) > 0 {
		var users []model.User
		if err := model.DB.Model(&model.User{}).
			Select("id", "username", "display_name").
			Where("id IN ?", userIDs).
			Find(&users).Error; err != nil {
			return RequestLogOptionsPayload{}, err
		}
		for _, user := range users {
			usersByID[user.Id] = user
		}
	}

	tokenOptions := make([]RequestLogTokenOption, 0, len(tokens))
	for _, token := range tokens {
		user := usersByID[token.UserId]
		tokenOptions = append(tokenOptions, RequestLogTokenOption{
			ID:          token.Id,
			Name:        token.Name,
			UserID:      token.UserId,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			Group:       token.Group,
			Status:      token.Status,
		})
	}

	return RequestLogOptionsPayload{
		Channels: channelOptions,
		Models:   modelOptions,
		Tokens:   tokenOptions,
	}, nil
}

func ListRequestLogs(query RequestLogQuery) RequestLogListResult {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.ensureLoadedLocked()
	if query.Limit <= 0 {
		query.Limit = defaultRequestLogListPageSize
	}
	if query.Limit > maxRequestLogListPageSize {
		query.Limit = maxRequestLogListPageSize
	}
	filtered := make([]RequestLogEntry, 0, len(requestLogs.entries))
	for i := len(requestLogs.entries) - 1; i >= 0; i-- {
		entry := requestLogs.entries[i]
		if !requestLogEntryMatches(entry, query) {
			continue
		}
		filtered = append(filtered, entry)
	}
	total := len(filtered)
	start := query.Offset
	if start < 0 {
		start = 0
	}
	if start > total {
		start = total
	}
	end := start + query.Limit
	if end > total {
		end = total
	}
	items := make([]RequestLogSummary, 0, end-start)
	for _, entry := range filtered[start:end] {
		items = append(items, entry.Summary())
	}
	return RequestLogListResult{Items: items, Total: total}
}

func GetRequestLogEntry(id string) (RequestLogEntry, bool) {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.ensureLoadedLocked()
	for i := len(requestLogs.entries) - 1; i >= 0; i-- {
		if requestLogs.entries[i].ID == id {
			return requestLogs.entries[i], true
		}
	}
	return RequestLogEntry{}, false
}

func ClearRequestLogs() RequestLogStats {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.ensureLoadedLocked()
	requestLogs.entries = requestLogs.entries[:0]
	requestLogs.totalBytes = 0
	requestLogs.stopped = false
	requestLogs.dropped = 0
	requestLogs.truncated = 0
	return requestLogs.statsLocked()
}

func MaybeStartRequestLogCapture(c *gin.Context, info *relaycommon.RelayInfo) {
	if c == nil || info == nil || info.ClientWs != nil {
		return
	}
	if _, ok := getRequestLogCapture(c); ok {
		return
	}
	settings, ok := requestLogSamplingSettings(c, info)
	if !ok {
		return
	}
	capture := newRequestLogCapture(c, info, settings)
	if capture == nil {
		return
	}
	c.Writer = &requestLogResponseWriter{
		ResponseWriter: c.Writer,
		capture:        capture,
	}
	c.Set(requestLogContextKey, capture)
}

func FinishRequestLogCapture(c *gin.Context, apiErr *types.NewAPIError) {
	capture, ok := getRequestLogCapture(c)
	if !ok {
		return
	}
	entry := capture.finish(c, apiErr)
	if entry.ID == "" {
		return
	}
	requestLogs.add(entry)
}

func StartRequestLogUpstreamAttempt(c *gin.Context, req *http.Request) *requestLogAttemptCapture {
	capture, ok := getRequestLogCapture(c)
	if !ok || req == nil {
		return nil
	}
	return capture.startUpstreamAttempt(c, req)
}

func FinishRequestLogUpstreamAttempt(_ *gin.Context, attempt *requestLogAttemptCapture, resp *http.Response, err error) {
	if attempt == nil {
		return
	}
	attempt.finish(resp, err)
}

func (w *requestLogResponseWriter) Write(data []byte) (int, error) {
	if w.capture != nil {
		w.capture.appendBody(w.capture.clientResponse, data)
	}
	return w.ResponseWriter.Write(data)
}

func (w *requestLogResponseWriter) WriteString(data string) (int, error) {
	if w.capture != nil {
		w.capture.appendBody(w.capture.clientResponse, common.StringToByteSlice(data))
	}
	return w.ResponseWriter.WriteString(data)
}

func (w *requestLogResponseWriter) WriteHeader(statusCode int) {
	if w.capture != nil {
		w.capture.setClientResponseStatus(statusCode)
	}
	w.ResponseWriter.WriteHeader(statusCode)
}

func (r *requestLogTeeReadCloser) Read(p []byte) (int, error) {
	n, err := r.ReadCloser.Read(p)
	if n > 0 && r.capture != nil && r.target != nil {
		r.capture.appendBody(r.target, p[:n])
	}
	return n, err
}

func (r *requestLogTeeReadCloser) Close() error {
	if r.closed.CompareAndSwap(false, true) && r.onClose != nil {
		r.onClose()
	}
	return r.ReadCloser.Close()
}

func newRequestLogCapture(c *gin.Context, info *relaycommon.RelayInfo, settings RequestLogSettings) *requestLogCapture {
	id := strconv.FormatUint(atomic.AddUint64(&requestLogs.nextID, 1), 10)
	startedAt := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
	if startedAt.IsZero() {
		startedAt = time.Now()
	}
	capture := &requestLogCapture{
		id:             id,
		startedAt:      startedAt,
		createdAt:      time.Now(),
		maxEntryBytes:  settings.MaxEntryBytes,
		info:           info,
		clientRequest:  &requestLogHTTPCapture{headers: cloneHeaderMap(c.Request.Header)},
		clientResponse: &requestLogHTTPCapture{headers: map[string][]string{}},
		attempts:       make([]*requestLogAttemptCapture, 0, 2),
	}
	capture.captureClientRequestBody(c)
	return capture
}

func (capture *requestLogCapture) captureClientRequestBody(c *gin.Context) {
	if c == nil {
		return
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil || storage == nil {
		return
	}
	if _, err := storage.Seek(0, io.SeekStart); err != nil {
		return
	}
	limit, limited := capture.readableByteLimit()
	if limited && limit <= 0 {
		capture.clientRequest.bodySize = storage.Size()
		capture.clientRequest.bodyTruncated = storage.Size() > 0
		if storage.Size() > 0 {
			capture.markTruncated()
		}
		_, _ = storage.Seek(0, io.SeekStart)
		c.Request.Body = io.NopCloser(storage)
		return
	}
	reader := io.Reader(storage)
	if limited {
		reader = io.LimitReader(storage, limit+1)
	}
	data, err := io.ReadAll(reader)
	_, _ = storage.Seek(0, io.SeekStart)
	c.Request.Body = io.NopCloser(storage)
	if err != nil {
		return
	}
	bodySize := storage.Size()
	if limit > 0 && int64(len(data)) > limit {
		data = data[:limit]
		capture.clientRequest.bodyTruncated = true
		capture.markTruncated()
	}
	capture.clientRequest.bodySize = bodySize
	capture.appendBodyBytes(capture.clientRequest, data, true)
}

func (capture *requestLogCapture) startUpstreamAttempt(c *gin.Context, req *http.Request) *requestLogAttemptCapture {
	capture.mu.Lock()
	attempt := &requestLogAttemptCapture{
		index:       len(capture.attempts) + 1,
		startedAt:   time.Now(),
		capture:     capture,
		channelID:   common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		channelName: common.GetContextKeyString(c, constant.ContextKeyChannelName),
		channelType: common.GetContextKeyInt(c, constant.ContextKeyChannelType),
		request: &requestLogHTTPCapture{
			headers: cloneHeaderMap(req.Header),
		},
		response: &requestLogHTTPCapture{},
	}
	capture.attempts = append(capture.attempts, attempt)
	capture.mu.Unlock()

	if req.Body != nil {
		req.Body = &requestLogTeeReadCloser{
			ReadCloser: req.Body,
			capture:    capture,
			target:     attempt.request,
		}
	}
	return attempt
}

func (attempt *requestLogAttemptCapture) finish(resp *http.Response, err error) {
	if err != nil {
		attempt.errText = err.Error()
		attempt.endedAt = time.Now()
		return
	}
	if resp == nil {
		attempt.endedAt = time.Now()
		return
	}
	attempt.response.status = resp.StatusCode
	attempt.response.headers = cloneHeaderMap(resp.Header)
	if resp.Body != nil {
		original := resp.Body
		resp.Body = &requestLogTeeReadCloser{
			ReadCloser: original,
			capture:    attempt.capture,
			target:     attempt.response,
			onClose: func() {
				if attempt.capture != nil {
					attempt.capture.mu.Lock()
					defer attempt.capture.mu.Unlock()
				}
				attempt.endedAt = time.Now()
			},
		}
	}
}

func (capture *requestLogCapture) finish(c *gin.Context, apiErr *types.NewAPIError) RequestLogEntry {
	capture.mu.Lock()
	if capture.finished {
		capture.mu.Unlock()
		return RequestLogEntry{}
	}
	capture.finished = true
	now := time.Now()
	for _, attempt := range capture.attempts {
		if attempt.endedAt.IsZero() {
			attempt.endedAt = now
		}
	}
	capture.clientResponse.status = c.Writer.Status()
	if capture.clientResponse.status == 0 {
		capture.clientResponse.status = http.StatusOK
	}
	capture.clientResponse.headers = cloneHeaderMap(c.Writer.Header())
	if capture.clientResponse.bodySize == 0 {
		capture.clientResponse.bodySize = int64(c.Writer.Size())
	}
	capture.mu.Unlock()

	info := capture.info
	entry := RequestLogEntry{
		ID:             capture.id,
		CreatedAt:      capture.createdAt.Unix(),
		CreatedAtText:  capture.createdAt.Format(requestLogTimeFormat),
		DurationMs:     now.Sub(capture.startedAt).Milliseconds(),
		RequestID:      c.GetString(common.RequestIdKey),
		Stream:         common.GetContextKeyBool(c, constant.ContextKeyIsStream),
		Model:          common.GetContextKeyString(c, constant.ContextKeyOriginalModel),
		UserID:         common.GetContextKeyInt(c, constant.ContextKeyUserId),
		Username:       common.GetContextKeyString(c, constant.ContextKeyUserName),
		Group:          common.GetContextKeyString(c, constant.ContextKeyUsingGroup),
		TokenID:        common.GetContextKeyInt(c, constant.ContextKeyTokenId),
		TokenName:      c.GetString("token_name"),
		TokenKey:       common.GetContextKeyString(c, constant.ContextKeyTokenKey),
		ChannelID:      common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		ChannelName:    common.GetContextKeyString(c, constant.ContextKeyChannelName),
		ChannelType:    common.GetContextKeyInt(c, constant.ContextKeyChannelType),
		RetryIndex:     0,
		UsedChannels:   append([]string(nil), c.GetStringSlice("use_channel")...),
		StatusCode:     capture.clientResponse.status,
		Truncated:      capture.truncated,
		ClientRequest:  capture.clientRequest.toMessage(),
		ClientResponse: capture.clientResponse.toMessage(),
	}
	if c.Request != nil {
		entry.Method = c.Request.Method
		if c.Request.URL != nil {
			entry.Path = c.Request.URL.Path
			entry.Query = c.Request.URL.RawQuery
		}
	}
	if info != nil {
		entry.Stream = info.IsStream
		entry.Model = info.OriginModelName
		entry.UpstreamModel = info.UpstreamModelName
		entry.RetryIndex = info.RetryIndex
		if info.ChannelMeta != nil {
			entry.ChannelID = info.ChannelId
			entry.ChannelName = common.GetContextKeyString(c, constant.ContextKeyChannelName)
			entry.ChannelType = info.ChannelType
		}
	}
	if upID := c.GetString(common.UpstreamRequestIdKey); upID != "" {
		entry.UpstreamRequestID = upID
	}
	if apiErr != nil {
		entry.Error = apiErr.ErrorWithStatusCode()
		if apiErr.StatusCode > 0 {
			entry.StatusCode = apiErr.StatusCode
		}
	}
	entry.UpstreamAttempts = capture.toAttempts()
	entry.ApproxBytes = approximateRequestLogEntryBytes(entry)
	return entry
}

func (capture *requestLogCapture) toAttempts() []RequestLogAttempt {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	attempts := make([]RequestLogAttempt, 0, len(capture.attempts))
	for _, attempt := range capture.attempts {
		durationMs := int64(0)
		if !attempt.startedAt.IsZero() && !attempt.endedAt.IsZero() {
			durationMs = attempt.endedAt.Sub(attempt.startedAt).Milliseconds()
		}
		attempts = append(attempts, RequestLogAttempt{
			Index:       attempt.index,
			StartedAt:   attempt.startedAt.Unix(),
			DurationMs:  durationMs,
			ChannelID:   attempt.channelID,
			ChannelName: attempt.channelName,
			ChannelType: attempt.channelType,
			Error:       attempt.errText,
			Request:     attempt.request.toMessage(),
			Response:    attempt.response.toMessage(),
		})
	}
	return attempts
}

func (capture *requestLogCapture) setClientResponseStatus(status int) {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	capture.clientResponse.status = status
}

func (capture *requestLogCapture) appendBody(target *requestLogHTTPCapture, data []byte) {
	capture.appendBodyBytes(target, data, false)
}

func (capture *requestLogCapture) appendBodyBytes(target *requestLogHTTPCapture, data []byte, bodySizeAlreadyKnown bool) {
	if target == nil || len(data) == 0 {
		return
	}
	capture.mu.Lock()
	defer capture.mu.Unlock()
	if !bodySizeAlreadyKnown {
		target.bodySize += int64(len(data))
	}
	if capture.maxEntryBytes > 0 && capture.capturedBytes >= capture.maxEntryBytes {
		target.bodyTruncated = true
		capture.truncated = true
		return
	}
	writeData := data
	if capture.maxEntryBytes > 0 {
		remaining := capture.maxEntryBytes - capture.capturedBytes
		if int64(len(writeData)) > remaining {
			writeData = writeData[:remaining]
			target.bodyTruncated = true
			capture.truncated = true
		}
	}
	if len(writeData) > 0 {
		_, _ = target.body.Write(writeData)
		capture.capturedBytes += int64(len(writeData))
	}
	if len(writeData) < len(data) {
		target.bodyTruncated = true
		capture.truncated = true
	}
}

func (capture *requestLogCapture) readableByteLimit() (int64, bool) {
	if capture.maxEntryBytes <= 0 {
		return 0, false
	}
	capture.mu.Lock()
	defer capture.mu.Unlock()
	remaining := capture.maxEntryBytes - capture.capturedBytes
	if remaining < 0 {
		return 0, true
	}
	return remaining, true
}

func (capture *requestLogCapture) markTruncated() {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	capture.truncated = true
}

func (payload *requestLogHTTPCapture) toMessage() RequestLogHTTPMessage {
	if payload == nil {
		return RequestLogHTTPMessage{}
	}
	return RequestLogHTTPMessage{
		Status:        payload.status,
		Headers:       cloneHeaderMap(payload.headers),
		Body:          payload.body.String(),
		BodySize:      payload.bodySize,
		BodyTruncated: payload.bodyTruncated,
	}
}

func (store *requestLogStore) ensureLoadedLocked() {
	if store.loaded {
		return
	}
	store.settings = defaultRequestLogSettings()
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[requestLogOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) != "" {
		var parsed RequestLogSettings
		if err := common.UnmarshalJsonStr(raw, &parsed); err == nil {
			if normalized, normErr := normalizeRequestLogSettings(parsed); normErr == nil {
				store.settings = normalized
			}
		}
	}
	store.loaded = true
}

func (store *requestLogStore) add(entry RequestLogEntry) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.ensureLoadedLocked()
	settings := store.settings
	entry.ApproxBytes = approximateRequestLogEntryBytes(entry)
	if entry.Truncated {
		store.truncated++
	}
	if store.stopped && settings.OverflowStrategy == requestLogOverflowStopSampling {
		store.dropped++
		return
	}
	if settings.MaxEntries <= 0 {
		store.dropped++
		return
	}
	if settings.MaxTotalBytes > 0 && entry.ApproxBytes > settings.MaxTotalBytes {
		store.dropped++
		return
	}
	if settings.OverflowStrategy == requestLogOverflowStopSampling {
		if len(store.entries) >= settings.MaxEntries || (settings.MaxTotalBytes > 0 && store.totalBytes+entry.ApproxBytes > settings.MaxTotalBytes) {
			store.stopped = true
			store.dropped++
			return
		}
	} else {
		for len(store.entries) >= settings.MaxEntries {
			store.dropOldestLocked()
		}
		for settings.MaxTotalBytes > 0 && len(store.entries) > 0 && store.totalBytes+entry.ApproxBytes > settings.MaxTotalBytes {
			store.dropOldestLocked()
		}
	}
	store.entries = append(store.entries, entry)
	store.totalBytes += entry.ApproxBytes
}

func (store *requestLogStore) trimToLimitsLocked() {
	settings := store.settings
	if settings.MaxEntries <= 0 {
		store.entries = store.entries[:0]
		store.totalBytes = 0
		return
	}
	for len(store.entries) > settings.MaxEntries {
		store.dropOldestLocked()
	}
	for settings.MaxTotalBytes > 0 && len(store.entries) > 0 && store.totalBytes > settings.MaxTotalBytes {
		store.dropOldestLocked()
	}
}

func (store *requestLogStore) dropOldestLocked() {
	if len(store.entries) == 0 {
		return
	}
	store.totalBytes -= store.entries[0].ApproxBytes
	if store.totalBytes < 0 {
		store.totalBytes = 0
	}
	copy(store.entries, store.entries[1:])
	store.entries = store.entries[:len(store.entries)-1]
}

func (store *requestLogStore) statsLocked() RequestLogStats {
	return RequestLogStats{
		Total:            len(store.entries),
		TotalBytes:       store.totalBytes,
		Stopped:          store.stopped,
		Dropped:          store.dropped,
		Truncated:        store.truncated,
		NextID:           atomic.LoadUint64(&store.nextID),
		MaxEntries:       store.settings.MaxEntries,
		MaxEntryBytes:    store.settings.MaxEntryBytes,
		MaxTotalBytes:    store.settings.MaxTotalBytes,
		OverflowStrategy: store.settings.OverflowStrategy,
	}
}

func requestLogSamplingSettings(c *gin.Context, info *relaycommon.RelayInfo) (RequestLogSettings, bool) {
	requestLogs.mu.Lock()
	requestLogs.ensureLoadedLocked()
	settings := cloneRequestLogSettings(requestLogs.settings)
	stopped := requestLogs.stopped
	requestLogs.mu.Unlock()
	if !settings.Enabled || stopped || settings.MaxEntries <= 0 {
		return settings, false
	}
	rate, matched := requestLogSampleRateForContext(c, info, settings)
	if !matched || rate <= 0 {
		return settings, false
	}
	if rate < 1 && rand.Float64() >= rate {
		return settings, false
	}
	return settings, true
}

func requestLogSampleRateForContext(c *gin.Context, info *relaycommon.RelayInfo, settings RequestLogSettings) (float64, bool) {
	if len(settings.Rules) == 0 {
		return clampSampleRate(settings.SampleRate), true
	}
	for _, rule := range settings.Rules {
		if !rule.Enabled {
			continue
		}
		if !requestLogRuleMatches(c, info, rule) {
			continue
		}
		if rule.SampleRate != nil {
			return clampSampleRate(*rule.SampleRate), true
		}
		return clampSampleRate(settings.SampleRate), true
	}
	return 0, false
}

func requestLogRuleMatches(c *gin.Context, info *relaycommon.RelayInfo, rule RequestLogRule) bool {
	channelID := common.GetContextKeyInt(c, constant.ContextKeyChannelId)
	modelName := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)
	tokenID := common.GetContextKeyInt(c, constant.ContextKeyTokenId)
	tokenName := c.GetString("token_name")
	tokenKey := common.GetContextKeyString(c, constant.ContextKeyTokenKey)
	if info != nil {
		if info.ChannelMeta != nil && info.ChannelId != 0 {
			channelID = info.ChannelId
		}
		if info.OriginModelName != "" {
			modelName = info.OriginModelName
		}
		if info.TokenId != 0 {
			tokenID = info.TokenId
		}
		if info.TokenKey != "" {
			tokenKey = info.TokenKey
		}
	}
	if len(rule.ChannelIDs) > 0 && !intInSlice(channelID, rule.ChannelIDs) {
		return false
	}
	if len(rule.Models) > 0 && !textMatchesAny(modelName, rule.Models) {
		return false
	}
	if len(rule.TokenIDs) > 0 && !intInSlice(tokenID, rule.TokenIDs) {
		return false
	}
	if len(rule.TokenNames) > 0 && !textMatchesAny(tokenName, rule.TokenNames) {
		return false
	}
	if len(rule.TokenKeys) > 0 && !tokenKeyMatchesAny(tokenKey, rule.TokenKeys) {
		return false
	}
	return true
}

func normalizeRequestLogSettings(settings RequestLogSettings) (RequestLogSettings, error) {
	defaults := defaultRequestLogSettings()
	if settings.SampleRate < 0 || settings.SampleRate > 1 {
		return settings, fmt.Errorf("sample_rate must be between 0 and 1")
	}
	if settings.MaxEntries < 0 {
		return settings, fmt.Errorf("max_entries must be greater than or equal to 0")
	}
	if settings.MaxEntries == 0 {
		settings.MaxEntries = defaults.MaxEntries
	}
	if strings.TrimSpace(settings.OverflowStrategy) == "" {
		settings.OverflowStrategy = defaults.OverflowStrategy
	}
	settings.OverflowStrategy = strings.ToLower(strings.TrimSpace(settings.OverflowStrategy))
	if settings.OverflowStrategy != requestLogOverflowReplaceOldest && settings.OverflowStrategy != requestLogOverflowStopSampling {
		return settings, fmt.Errorf("unsupported overflow_strategy: %s", settings.OverflowStrategy)
	}
	if settings.MaxEntryBytes < 0 {
		return settings, fmt.Errorf("max_entry_bytes must be greater than or equal to 0")
	}
	if settings.MaxEntryBytes == 0 {
		settings.MaxEntryBytes = defaults.MaxEntryBytes
	}
	if settings.MaxTotalBytes < 0 {
		return settings, fmt.Errorf("max_total_bytes must be greater than or equal to 0")
	}
	if settings.MaxTotalBytes == 0 {
		settings.MaxTotalBytes = defaults.MaxTotalBytes
	}
	for i := range settings.Rules {
		if settings.Rules[i].SampleRate != nil {
			rate := *settings.Rules[i].SampleRate
			if rate < 0 || rate > 1 {
				return settings, fmt.Errorf("rule %d sample_rate must be between 0 and 1", i+1)
			}
		}
	}
	if settings.Rules == nil {
		settings.Rules = []RequestLogRule{}
	}
	return settings, nil
}

func cloneRequestLogSettings(settings RequestLogSettings) RequestLogSettings {
	cloned := settings
	cloned.Rules = append([]RequestLogRule(nil), settings.Rules...)
	for i := range cloned.Rules {
		cloned.Rules[i].ChannelIDs = append([]int(nil), cloned.Rules[i].ChannelIDs...)
		cloned.Rules[i].Models = append([]string(nil), cloned.Rules[i].Models...)
		cloned.Rules[i].TokenIDs = append([]int(nil), cloned.Rules[i].TokenIDs...)
		cloned.Rules[i].TokenNames = append([]string(nil), cloned.Rules[i].TokenNames...)
		cloned.Rules[i].TokenKeys = append([]string(nil), cloned.Rules[i].TokenKeys...)
	}
	return cloned
}

func requestLogEntryMatches(entry RequestLogEntry, query RequestLogQuery) bool {
	if query.Model != "" && !textMatchesAny(entry.Model, []string{query.Model}) && !textMatchesAny(entry.UpstreamModel, []string{query.Model}) {
		return false
	}
	if query.ChannelID > 0 && entry.ChannelID != query.ChannelID {
		return false
	}
	if query.TokenID > 0 && entry.TokenID != query.TokenID {
		return false
	}
	if query.TokenName != "" && !strings.Contains(strings.ToLower(entry.TokenName), strings.ToLower(query.TokenName)) {
		return false
	}
	if query.StatusCode > 0 && entry.StatusCode != query.StatusCode {
		return false
	}
	if query.RequestID != "" && !strings.Contains(strings.ToLower(entry.RequestID), strings.ToLower(query.RequestID)) && !strings.Contains(strings.ToLower(entry.UpstreamRequestID), strings.ToLower(query.RequestID)) {
		return false
	}
	return true
}

func (entry RequestLogEntry) Summary() RequestLogSummary {
	upstreamBodySize := int64(0)
	for _, attempt := range entry.UpstreamAttempts {
		upstreamBodySize += attempt.Response.BodySize
	}
	return RequestLogSummary{
		ID:                entry.ID,
		CreatedAt:         entry.CreatedAt,
		DurationMs:        entry.DurationMs,
		Method:            entry.Method,
		Path:              entry.Path,
		RequestID:         entry.RequestID,
		UpstreamRequestID: entry.UpstreamRequestID,
		Stream:            entry.Stream,
		Model:             entry.Model,
		UpstreamModel:     entry.UpstreamModel,
		UserID:            entry.UserID,
		Username:          entry.Username,
		TokenID:           entry.TokenID,
		TokenName:         entry.TokenName,
		ChannelID:         entry.ChannelID,
		ChannelName:       entry.ChannelName,
		ChannelType:       entry.ChannelType,
		StatusCode:        entry.StatusCode,
		Error:             entry.Error,
		RetryIndex:        entry.RetryIndex,
		UsedChannels:      append([]string(nil), entry.UsedChannels...),
		Truncated:         entry.Truncated,
		ApproxBytes:       entry.ApproxBytes,
		RequestBodySize:   entry.ClientRequest.BodySize,
		ResponseBodySize:  entry.ClientResponse.BodySize,
		UpstreamBodySize:  upstreamBodySize,
	}
}

func getRequestLogCapture(c *gin.Context) (*requestLogCapture, bool) {
	if c == nil {
		return nil, false
	}
	raw, ok := c.Get(requestLogContextKey)
	if !ok {
		return nil, false
	}
	capture, ok := raw.(*requestLogCapture)
	return capture, ok && capture != nil
}

func cloneHeaderMap(headers map[string][]string) map[string][]string {
	if len(headers) == 0 {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(headers))
	for key, values := range headers {
		cloned[key] = append([]string(nil), values...)
	}
	return cloned
}

func approximateRequestLogEntryBytes(entry RequestLogEntry) int64 {
	raw, err := common.Marshal(entry)
	if err != nil {
		return int64(len(entry.ClientRequest.Body) + len(entry.ClientResponse.Body))
	}
	return int64(len(raw))
}

func intInSlice(value int, items []int) bool {
	for _, item := range items {
		if value == item {
			return true
		}
	}
	return false
}

func textMatchesAny(value string, patterns []string) bool {
	value = strings.TrimSpace(value)
	for _, patternValue := range patterns {
		patternValue = strings.TrimSpace(patternValue)
		if patternValue == "" {
			continue
		}
		if patternValue == "*" || strings.EqualFold(value, patternValue) {
			return true
		}
		if strings.Contains(patternValue, "*") {
			if matched, _ := path.Match(strings.ToLower(patternValue), strings.ToLower(value)); matched {
				return true
			}
		}
	}
	return false
}

func tokenKeyMatchesAny(value string, patterns []string) bool {
	normalized := normalizeTokenKey(value)
	for _, patternValue := range patterns {
		patternValue = normalizeTokenKey(patternValue)
		if patternValue == "" {
			continue
		}
		if patternValue == "*" || strings.EqualFold(normalized, patternValue) {
			return true
		}
		if strings.Contains(patternValue, "*") {
			if matched, _ := path.Match(strings.ToLower(patternValue), strings.ToLower(normalized)); matched {
				return true
			}
		}
	}
	return false
}

func normalizeTokenKey(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "Bearer ")
	value = strings.TrimPrefix(value, "bearer ")
	value = strings.TrimPrefix(value, "sk-")
	return strings.TrimSpace(value)
}

func clampSampleRate(rate float64) float64 {
	if rate < 0 {
		return 0
	}
	if rate > 1 {
		return 1
	}
	return rate
}
