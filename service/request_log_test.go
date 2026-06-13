package service

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetRequestLogStoreForTest(settings RequestLogSettings) {
	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	requestLogs.loaded = true
	requestLogs.settings = settings
	requestLogs.entries = nil
	requestLogs.totalBytes = 0
	requestLogs.nextID = 0
	requestLogs.stopped = false
	requestLogs.dropped = 0
	requestLogs.truncated = 0
	resetRequestLogPersistForTest()
}

func resetRequestLogPersistForTest() {
	for {
		select {
		case <-requestLogPersist.queue:
		default:
			requestLogPersist.queued.Store(0)
			requestLogPersist.stored.Store(0)
			requestLogPersist.written.Store(0)
			requestLogPersist.dropped.Store(0)
			requestLogPersist.failed.Store(0)
			requestLogPersist.generation.Store(0)
			requestLogPersist.clearLastError()
			return
		}
	}
}

func setupRequestDebugLogDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.RequestDebugLog{}))
	previous := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = previous
		resetRequestLogPersistForTest()
	})
}

func requestLogTestContext(body string) *gin.Context {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions?debug=1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk-debug")
	ctx.Request = req
	common.SetContextKey(ctx, constant.ContextKeyRequestStartTime, time.Now().Add(-25*time.Millisecond))
	common.SetContextKey(ctx, constant.ContextKeyOriginalModel, "gpt-debug")
	common.SetContextKey(ctx, constant.ContextKeyTokenId, 3)
	common.SetContextKey(ctx, constant.ContextKeyTokenKey, "debug")
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 7)
	common.SetContextKey(ctx, constant.ContextKeyChannelName, "debug-channel")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, 1)
	ctx.Set("token_name", "debug-key")
	ctx.Set("username", "root")
	ctx.Set("id", 1)
	ctx.Set("use_channel", []string{"7"})
	return ctx
}

func TestRequestLogCaptureRecordsClientAndUpstreamPayloads(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
	})
	ctx := requestLogTestContext(`{"model":"gpt-debug","messages":[{"role":"user","content":"hi"}]}`)
	info := &relaycommon.RelayInfo{
		TokenId:         3,
		TokenKey:        "debug",
		UserId:          1,
		OriginModelName: "gpt-debug",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:         7,
			ChannelType:       1,
			UpstreamModelName: "upstream-gpt-debug",
		},
	}

	MaybeStartRequestLogCapture(ctx, info)
	require.IsType(t, &requestLogResponseWriter{}, ctx.Writer)

	upReq := httptest.NewRequest(http.MethodPost, "https://upstream.example/v1/chat/completions", strings.NewReader(`{"upstream":true}`))
	upReq.Header.Set("X-Upstream", "yes")
	attempt := StartRequestLogUpstreamAttempt(ctx, upReq)
	_, err := io.ReadAll(upReq.Body)
	require.NoError(t, err)
	require.NoError(t, upReq.Body.Close())

	upResp := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
		Body: io.NopCloser(strings.NewReader(`{"result":"ok"}`)),
	}
	FinishRequestLogUpstreamAttempt(ctx, attempt, upResp, nil)
	_, err = io.ReadAll(upResp.Body)
	require.NoError(t, err)
	require.NoError(t, upResp.Body.Close())

	ctx.Writer.Header().Set("X-Client", "ok")
	ctx.Writer.WriteHeader(http.StatusAccepted)
	_, err = ctx.Writer.Write([]byte(`{"client":"ok"}`))
	require.NoError(t, err)

	FinishRequestLogCapture(ctx, nil)

	result := ListRequestLogs(RequestLogQuery{Limit: 10})
	require.Equal(t, 1, result.Total)
	entry, ok := GetRequestLogEntry(result.Items[0].ID)
	require.True(t, ok)
	require.Equal(t, http.StatusAccepted, entry.StatusCode)
	require.Contains(t, entry.ClientRequest.Body, `"gpt-debug"`)
	require.Equal(t, "Bearer sk-debug", entry.ClientRequest.Headers["Authorization"][0])
	require.Equal(t, "ok", entry.ClientResponse.Headers["X-Client"][0])
	require.Equal(t, `{"client":"ok"}`, entry.ClientResponse.Body)
	require.Len(t, entry.UpstreamAttempts, 1)
	require.Equal(t, `{"upstream":true}`, entry.UpstreamAttempts[0].Request.Body)
	require.Equal(t, `{"result":"ok"}`, entry.UpstreamAttempts[0].Response.Body)
}

func TestRequestLogRuleMismatchDoesNotInstallCapture(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		Rules: []RequestLogRule{
			{
				Enabled:    true,
				ChannelIDs: []int{99},
			},
		},
	})
	ctx := requestLogTestContext(`{"model":"gpt-debug"}`)
	MaybeStartRequestLogCapture(ctx, &relaycommon.RelayInfo{OriginModelName: "gpt-debug"})
	_, ok := getRequestLogCapture(ctx)
	require.False(t, ok)
}

func TestRequestLogFinalCriteriaEvaluatedAfterResponse(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		Rules: []RequestLogRule{
			{
				Enabled:     true,
				FailedOnly:  true,
				StatusCodes: []int{http.StatusInternalServerError},
			},
		},
	})

	okCtx := requestLogTestContext(`{"model":"gpt-debug"}`)
	MaybeStartRequestLogCapture(okCtx, &relaycommon.RelayInfo{OriginModelName: "gpt-debug"})
	_, ok := getRequestLogCapture(okCtx)
	require.True(t, ok)
	okCtx.Writer.WriteHeader(http.StatusOK)
	FinishRequestLogCapture(okCtx, nil)
	require.Equal(t, 0, ListRequestLogs(RequestLogQuery{Limit: 10}).Total)

	failedCtx := requestLogTestContext(`{"model":"gpt-debug"}`)
	MaybeStartRequestLogCapture(failedCtx, &relaycommon.RelayInfo{OriginModelName: "gpt-debug"})
	failedCtx.Writer.WriteHeader(http.StatusInternalServerError)
	FinishRequestLogCapture(failedCtx, nil)

	result := ListRequestLogs(RequestLogQuery{Limit: 10})
	require.Equal(t, 1, result.Total)
	require.Equal(t, http.StatusInternalServerError, result.Items[0].StatusCode)
}

func TestRequestLogFinalCriteriaSampleRateAppliedBeforeCapture(t *testing.T) {
	zeroRate := 0.0
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		Rules: []RequestLogRule{
			{
				Enabled:     true,
				FailedOnly:  true,
				StatusCodes: []int{http.StatusInternalServerError},
				SampleRate:  &zeroRate,
			},
		},
	})

	ctx := requestLogTestContext(`{"model":"gpt-debug"}`)
	MaybeStartRequestLogCapture(ctx, &relaycommon.RelayInfo{OriginModelName: "gpt-debug"})
	_, ok := getRequestLogCapture(ctx)
	require.False(t, ok)
}

func TestRequestLogStopSamplingOverflowKeepsOldEntries(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       1,
		OverflowStrategy: requestLogOverflowStopSampling,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
	})

	requestLogs.add(RequestLogEntry{ID: "first", ClientResponse: RequestLogHTTPMessage{Body: "first"}})
	requestLogs.add(RequestLogEntry{ID: "second", ClientResponse: RequestLogHTTPMessage{Body: "second"}})

	result := ListRequestLogs(RequestLogQuery{Limit: 10})
	require.Equal(t, 1, result.Total)
	require.Equal(t, "first", result.Items[0].ID)
	payload := GetRequestLogSettingsPayload()
	require.True(t, payload.Stats.Stopped)
	require.Equal(t, int64(1), payload.Stats.Dropped)
}

func TestRequestLogListsPersistedHistoryWhenPersistenceDisabled(t *testing.T) {
	setupRequestDebugLogDB(t)
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		PersistEnabled:   false,
		PersistMax:       10,
		PersistQueueSize: 10,
		PersistBatchSize: 5,
	})

	row, err := requestDebugLogFromEntry(RequestLogEntry{
		ID:             "persisted-one",
		CreatedAt:      time.Now().Unix(),
		Method:         http.MethodPost,
		Path:           "/v1/chat/completions",
		Model:          "gpt-debug",
		StatusCode:     http.StatusOK,
		ClientResponse: RequestLogHTTPMessage{Body: "persisted"},
	})
	require.NoError(t, err)
	require.NoError(t, model.CreateRequestDebugLogs([]model.RequestDebugLog{row}, 1))
	requestLogPersist.refreshStoredCount()

	result := ListRequestLogs(RequestLogQuery{Limit: 10})
	require.Equal(t, 1, result.Total)
	require.Len(t, result.Items, 1)
	require.Equal(t, "gpt-debug", result.Items[0].Model)
	require.True(t, strings.HasPrefix(result.Items[0].ID, requestLogPersistedIDPrefix))
}

func TestRequestLogPersistDropsWhenDatabaseLimitReached(t *testing.T) {
	setupRequestDebugLogDB(t)
	resetRequestLogPersistForTest()
	settings := RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       10,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		PersistEnabled:   true,
		PersistMax:       1,
		PersistQueueSize: 10,
		PersistBatchSize: 10,
	}

	requestLogPersist.flush([]RequestLogEntry{
		{
			ID:             "one",
			CreatedAt:      time.Now().Unix(),
			Method:         http.MethodPost,
			Path:           "/v1/chat/completions",
			Model:          "gpt-debug",
			StatusCode:     http.StatusOK,
			ClientResponse: RequestLogHTTPMessage{Body: "first"},
		},
		{
			ID:             "two",
			CreatedAt:      time.Now().Unix(),
			Method:         http.MethodPost,
			Path:           "/v1/chat/completions",
			Model:          "gpt-debug",
			StatusCode:     http.StatusOK,
			ClientResponse: RequestLogHTTPMessage{Body: "second"},
		},
	}, settings)

	count, err := model.CountRequestDebugLogs()
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
	require.Equal(t, int64(1), requestLogPersist.dropped.Load())
	require.Equal(t, int64(1), requestLogPersist.written.Load())
}

func TestRequestLogPersistenceKeepsCaptureAfterMemoryStop(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       1,
		OverflowStrategy: requestLogOverflowStopSampling,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
		PersistEnabled:   true,
		PersistMax:       10,
		PersistQueueSize: 10,
		PersistBatchSize: 5,
	})

	requestLogs.add(RequestLogEntry{ID: "first", ClientResponse: RequestLogHTTPMessage{Body: "first"}})
	requestLogs.add(RequestLogEntry{ID: "second", ClientResponse: RequestLogHTTPMessage{Body: "second"}})
	require.True(t, GetRequestLogSettingsPayload().Stats.Stopped)

	ctx := requestLogTestContext(`{"model":"gpt-debug"}`)
	MaybeStartRequestLogCapture(ctx, &relaycommon.RelayInfo{OriginModelName: "gpt-debug"})
	_, ok := getRequestLogCapture(ctx)
	require.True(t, ok)
}

func TestRequestLogDropOldestClearsRemovedEntryReference(t *testing.T) {
	resetRequestLogStoreForTest(RequestLogSettings{
		Enabled:          true,
		SampleRate:       1,
		MaxEntries:       1,
		OverflowStrategy: requestLogOverflowReplaceOldest,
		MaxEntryBytes:    1 << 20,
		MaxTotalBytes:    4 << 20,
	})
	requestLogs.entries = make([]RequestLogEntry, 0, 2)

	requestLogs.add(RequestLogEntry{
		ID:             "first",
		ClientResponse: RequestLogHTTPMessage{Body: strings.Repeat("x", 1024)},
	})
	requestLogs.add(RequestLogEntry{
		ID:             "second",
		ClientResponse: RequestLogHTTPMessage{Body: "second"},
	})

	requestLogs.mu.Lock()
	defer requestLogs.mu.Unlock()
	require.Len(t, requestLogs.entries, 1)
	require.GreaterOrEqual(t, cap(requestLogs.entries), 2)
	backing := requestLogs.entries[:cap(requestLogs.entries)]
	require.Empty(t, backing[1].ClientResponse.Body)
}
