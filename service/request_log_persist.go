package service

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type requestLogPersistStore struct {
	queue       chan requestLogPersistItem
	started     atomic.Bool
	queued      atomic.Int64
	stored      atomic.Int64
	written     atomic.Int64
	dropped     atomic.Int64
	failed      atomic.Int64
	generation  atomic.Int64
	lastErrMu   sync.Mutex
	lastErrText string
}

type requestLogPersistItem struct {
	entry      RequestLogEntry
	generation int64
}

var requestLogPersist = &requestLogPersistStore{
	queue: make(chan requestLogPersistItem, maxRequestLogPersistQueue),
}

func StartRequestLogPersistWorker() {
	if !requestLogPersist.started.CompareAndSwap(false, true) {
		return
	}
	requestLogPersist.refreshStoredCount()
	go requestLogPersist.loop()
}

func enqueueRequestLogPersistence(entry RequestLogEntry, settings RequestLogSettings) {
	if !settings.PersistEnabled {
		return
	}
	requestLogPersist.tryEnqueue(entry, settings)
}

func requestLogPersistenceMayAccept(settings RequestLogSettings) bool {
	if !settings.PersistEnabled {
		return false
	}
	if settings.PersistMax <= 0 || settings.PersistQueueSize <= 0 {
		return false
	}
	if requestLogPersist.stored.Load()+requestLogPersist.queued.Load() >= int64(settings.PersistMax) {
		return false
	}
	return requestLogPersist.queued.Load() < int64(settings.PersistQueueSize)
}

func requestLogPersistenceShouldListHistory(settings RequestLogSettings) bool {
	return settings.PersistEnabled || requestLogPersist.stored.Load() > 0
}

func withRequestLogPersistStats(stats RequestLogStats, settings RequestLogSettings) RequestLogStats {
	stats.PersistEnabled = settings.PersistEnabled
	stats.PersistMax = settings.PersistMax
	stats.PersistQueueSize = settings.PersistQueueSize
	stats.PersistBatchSize = settings.PersistBatchSize
	stats.PersistQueued = requestLogPersist.queued.Load()
	stats.PersistStored = requestLogPersist.stored.Load()
	stats.PersistWritten = requestLogPersist.written.Load()
	stats.PersistDropped = requestLogPersist.dropped.Load()
	stats.PersistFailed = requestLogPersist.failed.Load()
	stats.PersistOverflowStrategy = "drop"
	stats.PersistLastError = requestLogPersist.lastError()
	return stats
}

func (store *requestLogPersistStore) tryEnqueue(entry RequestLogEntry, settings RequestLogSettings) {
	if settings.PersistMax > 0 && store.stored.Load()+store.queued.Load() >= int64(settings.PersistMax) {
		store.dropped.Add(1)
		return
	}
	queueLimit := settings.PersistQueueSize
	if queueLimit <= 0 {
		store.dropped.Add(1)
		return
	}
	if queueLimit > maxRequestLogPersistQueue {
		queueLimit = maxRequestLogPersistQueue
	}
	if store.queued.Add(1) > int64(queueLimit) {
		store.queued.Add(-1)
		store.dropped.Add(1)
		return
	}
	select {
	case store.queue <- requestLogPersistItem{
		entry:      entry,
		generation: store.generation.Load(),
	}:
	default:
		store.queued.Add(-1)
		store.dropped.Add(1)
	}
}

func (store *requestLogPersistStore) loop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	batch := make([]requestLogPersistItem, 0, defaultRequestLogPersistBatch)
	for {
		select {
		case item := <-store.queue:
			store.queued.Add(-1)
			batch = append(batch, item)
			settings := currentRequestLogSettings()
			batchSize := settings.PersistBatchSize
			if batchSize <= 0 {
				batchSize = defaultRequestLogPersistBatch
			}
			if batchSize > maxRequestLogPersistBatch {
				batchSize = maxRequestLogPersistBatch
			}
			if len(batch) >= batchSize {
				store.flushItems(batch, settings)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				store.flushItems(batch, currentRequestLogSettings())
				batch = batch[:0]
			}
		}
	}
}

func (store *requestLogPersistStore) flushItems(items []requestLogPersistItem, settings RequestLogSettings) {
	if len(items) == 0 {
		return
	}
	currentGeneration := store.generation.Load()
	entries := make([]RequestLogEntry, 0, len(items))
	for _, item := range items {
		if item.generation != currentGeneration {
			store.dropped.Add(1)
			continue
		}
		entries = append(entries, item.entry)
	}
	store.flush(entries, settings)
}

func (store *requestLogPersistStore) flush(entries []RequestLogEntry, settings RequestLogSettings) {
	if len(entries) == 0 {
		return
	}
	if !settings.PersistEnabled {
		store.dropped.Add(int64(len(entries)))
		return
	}
	maxEntries := settings.PersistMax
	if maxEntries <= 0 {
		store.dropped.Add(int64(len(entries)))
		return
	}
	remaining := int64(maxEntries) - store.stored.Load()
	if remaining <= 0 {
		store.dropped.Add(int64(len(entries)))
		return
	}
	if int64(len(entries)) > remaining {
		store.dropped.Add(int64(len(entries)) - remaining)
		entries = entries[:int(remaining)]
	}
	rows := make([]model.RequestDebugLog, 0, len(entries))
	for _, entry := range entries {
		row, err := requestDebugLogFromEntry(entry)
		if err != nil {
			store.failed.Add(1)
			store.setLastError(err)
			continue
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return
	}
	batchSize := settings.PersistBatchSize
	if batchSize <= 0 {
		batchSize = defaultRequestLogPersistBatch
	}
	if batchSize > maxRequestLogPersistBatch {
		batchSize = maxRequestLogPersistBatch
	}
	if err := model.CreateRequestDebugLogs(rows, batchSize); err != nil {
		store.failed.Add(int64(len(rows)))
		store.setLastError(err)
		common.SysError("failed to persist request debug logs: " + err.Error())
		return
	}
	store.stored.Add(int64(len(rows)))
	store.written.Add(int64(len(rows)))
	store.clearLastError()
}

func (store *requestLogPersistStore) refreshStoredCount() {
	count, err := model.CountRequestDebugLogs()
	if err != nil {
		store.setLastError(err)
		return
	}
	store.stored.Store(count)
}

func (store *requestLogPersistStore) clearQueue() int64 {
	store.generation.Add(1)
	var cleared int64
	for {
		select {
		case <-store.queue:
			store.queued.Add(-1)
			cleared++
		default:
			if store.queued.Load() < 0 {
				store.queued.Store(0)
			}
			return cleared
		}
	}
}

func (store *requestLogPersistStore) setLastError(err error) {
	if err == nil {
		return
	}
	store.lastErrMu.Lock()
	store.lastErrText = err.Error()
	store.lastErrMu.Unlock()
}

func (store *requestLogPersistStore) clearLastError() {
	store.lastErrMu.Lock()
	store.lastErrText = ""
	store.lastErrMu.Unlock()
}

func (store *requestLogPersistStore) lastError() string {
	store.lastErrMu.Lock()
	defer store.lastErrMu.Unlock()
	return store.lastErrText
}

func currentRequestLogSettings() RequestLogSettings {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.ensureLoadedLocked()
	return cloneRequestLogSettings(requestLogs.settings)
}

func requestDebugLogFromEntry(entry RequestLogEntry) (model.RequestDebugLog, error) {
	entry.ApproxBytes = approximateRequestLogEntryBytes(entry)
	raw, err := common.Marshal(entry)
	if err != nil {
		return model.RequestDebugLog{}, err
	}
	upstreamBodySize := int64(0)
	for _, attempt := range entry.UpstreamAttempts {
		upstreamBodySize += attempt.Response.BodySize
	}
	return model.RequestDebugLog{
		RequestLogID:      entry.ID,
		CreatedAt:         entry.CreatedAt,
		Method:            entry.Method,
		Path:              entry.Path,
		RequestID:         entry.RequestID,
		UpstreamRequestID: entry.UpstreamRequestID,
		UserID:            entry.UserID,
		Username:          entry.Username,
		TokenID:           entry.TokenID,
		TokenName:         entry.TokenName,
		ChannelID:         entry.ChannelID,
		ChannelName:       entry.ChannelName,
		ChannelType:       entry.ChannelType,
		ModelName:         entry.Model,
		UpstreamModelName: entry.UpstreamModel,
		StatusCode:        entry.StatusCode,
		Error:             entry.Error,
		DurationMs:        entry.DurationMs,
		Failed:            requestLogEntryFailed(entry),
		Stream:            entry.Stream,
		Truncated:         entry.Truncated,
		ApproxBytes:       entry.ApproxBytes,
		RequestBodySize:   entry.ClientRequest.BodySize,
		ResponseBodySize:  entry.ClientResponse.BodySize,
		UpstreamBodySize:  upstreamBodySize,
		Payload:           string(raw),
	}, nil
}

func requestLogEntryFromPersisted(row model.RequestDebugLog) (RequestLogEntry, error) {
	var entry RequestLogEntry
	if err := common.UnmarshalJsonStr(row.Payload, &entry); err != nil {
		return RequestLogEntry{}, err
	}
	entry.ID = persistedRequestLogID(row.Id)
	if entry.CreatedAt == 0 {
		entry.CreatedAt = row.CreatedAt
	}
	if entry.CreatedAtText == "" && entry.CreatedAt > 0 {
		entry.CreatedAtText = time.Unix(entry.CreatedAt, 0).Format(requestLogTimeFormat)
	}
	if entry.ApproxBytes == 0 {
		entry.ApproxBytes = row.ApproxBytes
	}
	return entry, nil
}

func persistedRequestLogID(id int64) string {
	return fmt.Sprintf("%s%d", requestLogPersistedIDPrefix, id)
}

func parsePersistedRequestLogID(id string) (int64, bool) {
	id = strings.TrimSpace(id)
	if !strings.HasPrefix(id, requestLogPersistedIDPrefix) {
		return 0, false
	}
	parsed, err := strconv.ParseInt(strings.TrimPrefix(id, requestLogPersistedIDPrefix), 10, 64)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func listPersistedRequestLogs(query RequestLogQuery, memoryIDs []string, offset int, limit int) ([]RequestLogSummary, int, error) {
	if limit <= 0 {
		return []RequestLogSummary{}, 0, nil
	}
	rows, total, err := model.ListRequestDebugLogs(model.RequestDebugLogQuery{
		Model:         query.Model,
		ChannelID:     query.ChannelID,
		TokenID:       query.TokenID,
		TokenName:     query.TokenName,
		StatusCode:    query.StatusCode,
		RequestID:     query.RequestID,
		ExcludeLogIDs: memoryIDs,
	}, offset, limit)
	if err != nil {
		requestLogPersist.setLastError(err)
		return []RequestLogSummary{}, 0, err
	}
	items := make([]RequestLogSummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, requestDebugLogSummary(row))
	}
	return items, int(total), nil
}

func requestDebugLogSummary(row model.RequestDebugLog) RequestLogSummary {
	return RequestLogSummary{
		ID:                persistedRequestLogID(row.Id),
		CreatedAt:         row.CreatedAt,
		DurationMs:        row.DurationMs,
		Method:            row.Method,
		Path:              row.Path,
		RequestID:         row.RequestID,
		UpstreamRequestID: row.UpstreamRequestID,
		Stream:            row.Stream,
		Model:             row.ModelName,
		UpstreamModel:     row.UpstreamModelName,
		UserID:            row.UserID,
		Username:          row.Username,
		TokenID:           row.TokenID,
		TokenName:         row.TokenName,
		ChannelID:         row.ChannelID,
		ChannelName:       row.ChannelName,
		ChannelType:       row.ChannelType,
		StatusCode:        row.StatusCode,
		Error:             row.Error,
		Truncated:         row.Truncated,
		ApproxBytes:       row.ApproxBytes,
		RequestBodySize:   row.RequestBodySize,
		ResponseBodySize:  row.ResponseBodySize,
		UpstreamBodySize:  row.UpstreamBodySize,
	}
}

func getPersistedRequestLogEntry(id string) (RequestLogEntry, bool) {
	if rowID, ok := parsePersistedRequestLogID(id); ok {
		row, found, err := model.GetRequestDebugLogByID(rowID)
		if err != nil {
			requestLogPersist.setLastError(err)
			return RequestLogEntry{}, false
		}
		if !found {
			return RequestLogEntry{}, false
		}
		entry, err := requestLogEntryFromPersisted(row)
		if err != nil {
			requestLogPersist.setLastError(err)
			return RequestLogEntry{}, false
		}
		return entry, true
	}

	row, found, err := model.GetRequestDebugLogByRequestLogID(id)
	if err != nil {
		requestLogPersist.setLastError(err)
		return RequestLogEntry{}, false
	}
	if !found {
		return RequestLogEntry{}, false
	}
	entry, err := requestLogEntryFromPersisted(row)
	if err != nil {
		requestLogPersist.setLastError(err)
		return RequestLogEntry{}, false
	}
	return entry, true
}

func ClearPersistedRequestLogs() (RequestLogStats, error) {
	requestLogPersist.clearQueue()
	_, err := model.DeleteAllRequestDebugLogs()
	if err != nil {
		requestLogPersist.setLastError(err)
		return GetRequestLogSettingsPayload().Stats, err
	}
	requestLogPersist.stored.Store(0)
	requestLogPersist.clearLastError()
	return GetRequestLogSettingsPayload().Stats, nil
}
