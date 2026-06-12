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
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
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
