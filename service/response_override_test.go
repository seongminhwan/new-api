package service

import (
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/require"
)

func TestApplyResponseOverridesRewritesBodyAndHeaders(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-test"}`)
	ctx.Writer.Header().Set("Content-Type", "application/json")
	ctx.Writer.Header().Set("X-Remove", "stale")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"path":  "message",
						"mode":  "set",
						"value": "rewritten",
					},
					map[string]interface{}{
						"path":  "X-Rewrite",
						"mode":  "set_header",
						"value": "yes",
					},
					map[string]interface{}{
						"path": "X-Remove",
						"mode": "delete_header",
					},
				},
			},
			ResponseHeadersOverride: map[string]interface{}{
				"X-Direct": "ok",
			},
		},
	})

	body := ApplyResponseOverrides(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
	}, []byte(`{"message":"original"}`))

	var parsed map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &parsed))
	require.Equal(t, "rewritten", parsed["message"])
	require.Equal(t, "yes", ctx.Writer.Header().Get("X-Rewrite"))
	require.Equal(t, "", ctx.Writer.Header().Get("X-Remove"))
	require.Equal(t, "ok", ctx.Writer.Header().Get("X-Direct"))
}

func TestApplyResponseHeaderOverrideDeletesMatchingHeaders(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/messages", `{"model":"claude-test"}`)
	ctx.Writer.Header().Set("Content-Type", "application/json")
	ctx.Writer.Header().Set("X-Litellm-Model-Id", "claude")
	ctx.Writer.Header().Set("X-Litellm-Response-Cost", "0.01")
	ctx.Writer.Header().Set("X-Keep", "ok")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseHeadersOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode": "delete_header",
						"path": "X-Litellm-*",
					},
				},
			},
		},
	})

	ApplyResponseHeaderOverrides(ctx)

	require.Empty(t, ctx.Writer.Header().Get("X-Litellm-Model-Id"))
	require.Empty(t, ctx.Writer.Header().Get("X-Litellm-Response-Cost"))
	require.Equal(t, "ok", ctx.Writer.Header().Get("X-Keep"))
	require.Equal(t, "application/json", ctx.Writer.Header().Get("Content-Type"))
}

func TestApplyResponseHeaderOverrideKeepsOnlySelectedHeaders(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/messages", `{"model":"claude-test"}`)
	ctx.Writer.Header().Set("Content-Type", "application/json")
	ctx.Writer.Header().Set("Cache-Control", "no-cache")
	ctx.Writer.Header().Set("X-Request-Id", "req-1")
	ctx.Writer.Header().Set("X-Litellm-Response-Cost", "0.01")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseHeadersOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode":  "keep_headers",
						"value": []interface{}{"Content-Type", "X-Request-Id"},
					},
				},
			},
		},
	})

	ApplyResponseHeaderOverrides(ctx)

	require.Equal(t, "application/json", ctx.Writer.Header().Get("Content-Type"))
	require.Equal(t, "req-1", ctx.Writer.Header().Get("X-Request-Id"))
	require.Empty(t, ctx.Writer.Header().Get("Cache-Control"))
	require.Empty(t, ctx.Writer.Header().Get("X-Litellm-Response-Cost"))
}

func TestGlobalResponseHeaderPolicyAppliesWhitelistAndBlacklist(t *testing.T) {
	setting := system_setting.GetResponseHeaderPolicySetting()
	originalWhitelist := append([]string(nil), setting.Whitelist...)
	originalBlacklist := append([]string(nil), setting.Blacklist...)
	t.Cleanup(func() {
		setting.Whitelist = originalWhitelist
		setting.Blacklist = originalBlacklist
	})

	setting.Whitelist = []string{"Content-Type", "X-Request-*", "X-Blocked"}
	setting.Blacklist = []string{"X-Blocked"}

	headers := http.Header{}
	headers.Set("Content-Type", "application/json")
	headers.Set("X-Request-Id", "req-1")
	headers.Set("X-Blocked", "secret")
	headers.Set("X-Other", "drop")

	ApplyGlobalResponseHeaderPolicyToHeader(headers)

	require.Equal(t, "application/json", headers.Get("Content-Type"))
	require.Equal(t, "req-1", headers.Get("X-Request-Id"))
	require.Empty(t, headers.Get("X-Blocked"))
	require.Empty(t, headers.Get("X-Other"))
}

func TestApplyResponseOverridesCanRewriteStatusCode(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-test"}`)
	ctx.Writer.Header().Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode":  "set_status",
						"value": 421,
						"conditions": []interface{}{
							map[string]interface{}{
								"path":  "response.status",
								"mode":  "full",
								"value": float64(http.StatusOK),
							},
						},
					},
					map[string]interface{}{
						"path":  "message",
						"mode":  "set",
						"value": "rewritten",
					},
				},
			},
		},
	})

	body, statusCode := ApplyResponseOverridesWithStatus(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
	}, []byte(`{"message":"original"}`))

	var parsed map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &parsed))
	require.Equal(t, "rewritten", parsed["message"])
	require.Equal(t, http.StatusMisdirectedRequest, statusCode)
}

func TestApplyResponseOverridesReturnErrorWorksForNonJSONBody(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-test"}`)
	ctx.Writer.Header().Set("Content-Type", "text/html")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode": "return_error",
						"value": map[string]interface{}{
							"message":     "pending authorization",
							"status_code": 421,
							"code":        "pending_authorization",
							"type":        "upstream_error",
						},
						"conditions": []interface{}{
							map[string]interface{}{
								"path":  "response.status",
								"mode":  "full",
								"value": float64(http.StatusOK),
							},
						},
					},
				},
			},
		},
	})

	body, statusCode := ApplyResponseOverridesWithStatus(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"text/html"},
		},
	}, []byte(`<html>login required</html>`))

	var parsed map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &parsed))
	errObj := parsed["error"].(map[string]interface{})
	require.Equal(t, "pending authorization", errObj["message"])
	require.Equal(t, "pending_authorization", errObj["code"])
	require.Equal(t, http.StatusMisdirectedRequest, statusCode)
	require.Contains(t, ctx.Writer.Header().Get("Content-Type"), "application/json")
}

func TestApplyResponseOverridesSetBodyWorksForNonJSONBody(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-test"}`)
	ctx.Writer.Header().Set("Content-Type", "text/html")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode":  "set_status",
						"value": "421",
					},
					map[string]interface{}{
						"mode": "set_body",
						"value": map[string]interface{}{
							"message": "pending authorization",
							"code":    "pending_authorization",
						},
					},
					map[string]interface{}{
						"mode":  "set_header",
						"path":  "Content-Type",
						"value": "application/json",
					},
				},
			},
		},
	})

	body, statusCode := ApplyResponseOverridesWithStatus(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"text/html"},
		},
	}, []byte(`<html>login required</html>`))

	var parsed map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &parsed))
	require.Equal(t, "pending authorization", parsed["message"])
	require.Equal(t, "pending_authorization", parsed["code"])
	require.Equal(t, http.StatusMisdirectedRequest, statusCode)
	require.Equal(t, "application/json", ctx.Writer.Header().Get("Content-Type"))
}

func TestApplyResponseOverridesSupportsExprAndJSOperations(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-test"}`)
	ctx.Writer.Header().Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"path":   "message",
						"mode":   "transform_js",
						"script": "return current + ' for ' + get('req.body.model');",
					},
					map[string]interface{}{
						"path": "usage.total_tokens",
						"mode": "set_expr",
						"expr": "get('usage.input_tokens') + get('usage.output_tokens')",
					},
					map[string]interface{}{
						"path": "X-Model",
						"mode": "set_header_expr",
						"expr": "get('req.body.model')",
					},
				},
			},
		},
	})

	body := ApplyResponseOverrides(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
	}, []byte(`{"message":"ok","usage":{"input_tokens":3,"output_tokens":4}}`))

	var parsed map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &parsed))
	require.Equal(t, "ok for gpt-test", parsed["message"])
	require.Equal(t, float64(7), parsed["usage"].(map[string]interface{})["total_tokens"])
	require.Equal(t, "gpt-test", ctx.Writer.Header().Get("X-Model"))
}

func TestValidateChannelResponseOverrideRejectsInvalidExprAndJS(t *testing.T) {
	err := ValidateChannelResponseOverride(common.GetPointer(`{
		"operations": [
			{
				"path": "message",
				"mode": "transform_js",
				"script": "return ("
			}
		]
	}`))
	require.Error(t, err)

	err = ValidateChannelResponseOverride(common.GetPointer(`{
		"operations": [
			{
				"path": "message",
				"mode": "set",
				"value": "blocked",
				"conditions": [
					{
						"mode": "expr",
						"expr": "get('message') =="
					}
				]
			}
		]
	}`))
	require.Error(t, err)
}

func TestValidateChannelResponseHeaderOverrideRejectsInvalidScriptOperation(t *testing.T) {
	err := ValidateChannelResponseHeaderOverride(common.GetPointer(`{
		"operations": [
			{
				"path": "X-Test",
				"mode": "set_header_js",
				"script": "return ("
			}
		]
	}`))
	require.Error(t, err)
}

func TestApplyStreamResponseOverrideCanDropMatchedEventChunk(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/messages", `{"model":"claude-test","stream":true}`)
	common.SetContextKey(ctx, constant.ContextKeyRelayInfo, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ResponseOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"mode": "drop_event",
						"conditions": []interface{}{
							map[string]interface{}{
								"path":  "stream.event",
								"mode":  "full",
								"value": "content_block_delta",
							},
							map[string]interface{}{
								"path":  "delta.type",
								"mode":  "full",
								"value": "thinking_delta",
							},
						},
						"logic": "AND",
					},
				},
			},
		},
	})

	data, drop, err := ApplyStreamResponseOverride(ctx, `{"delta":{"type":"thinking_delta"}}`, StreamResponseOverrideOptions{
		Format: "claude",
		Event:  "content_block_delta",
	})

	require.NoError(t, err)
	require.True(t, drop)
	require.Empty(t, data)
}

func TestShouldSkipRetryByElapsedThresholdSupportsGlobalAndModelOverride(t *testing.T) {
	setting := operation_setting.GetMonitorSetting()
	oldGlobal := setting.RetryElapsedThresholdSeconds
	oldModels := setting.RetryElapsedModelThresholds
	t.Cleanup(func() {
		setting.RetryElapsedThresholdSeconds = oldGlobal
		setting.RetryElapsedModelThresholds = oldModels
	})

	setting.RetryElapsedThresholdSeconds = 20
	setting.RetryElapsedModelThresholds = map[string]int{
		"gpt-slow":     5,
		"gpt-disabled": 0,
	}

	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"model":"gpt-slow"}`)
	common.SetContextKey(ctx, constant.ContextKeyRequestStartTime, time.Now().Add(-10*time.Second))

	skip, threshold, elapsed := ShouldSkipRetryByElapsedThreshold(ctx, "gpt-slow")
	require.True(t, skip)
	require.Equal(t, 5*time.Second, threshold)
	require.GreaterOrEqual(t, elapsed, 10*time.Second)

	skip, threshold, elapsed = ShouldSkipRetryByElapsedThreshold(ctx, "gpt-default")
	require.False(t, skip)
	require.Equal(t, 20*time.Second, threshold)
	require.GreaterOrEqual(t, elapsed, 10*time.Second)

	skip, threshold, elapsed = ShouldSkipRetryByElapsedThreshold(ctx, "gpt-disabled")
	require.False(t, skip)
	require.Zero(t, threshold)
	require.Zero(t, elapsed)
}
