package service

import (
	"errors"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestApplyErrorOverridesCanRewriteMessageStatusAndHeaders(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{
		"model": "gpt-test",
		"stream": false
	}`)
	common.SetContextKey(ctx, constant.ContextKeyChannelErrorOverride, `{
		"rules": [
			{
				"conditions": [
					{"source": "upstream_status", "op": "eq", "value": 200},
					{"source": "resp.header", "key": "Content-Type", "op": "contains", "value": "text/html"},
					{"source": "req.body", "path": "stream", "op": "eq", "value": false}
				],
				"message": "{req.body.model} 待授权",
				"status_code": 421,
				"headers": {
					"Content-Type": "application/json",
					"X-Upstream-Status": "{upstream_status}"
				}
			}
		]
	}`)
	RecordUpstreamResponse(ctx, &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"text/html; charset=utf-8"},
		},
	})

	apiErr := types.NewOpenAIError(errors.New("invalid character '<' looking for beginning of value"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	ApplyErrorOverrides(ctx, apiErr, "")
	ApplyErrorResponseHeaders(ctx, apiErr)

	require.Equal(t, http.StatusMisdirectedRequest, apiErr.StatusCode)
	require.Equal(t, "gpt-test 待授权", apiErr.ToOpenAIError().Message)
	require.Equal(t, "application/json", ctx.Writer.Header().Get("Content-Type"))
	require.Equal(t, "200", ctx.Writer.Header().Get("X-Upstream-Status"))
}

func TestApplyErrorOverridesRunsAfterLegacyStatusCodeMapping(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"stream":false}`)
	common.SetContextKey(ctx, constant.ContextKeyChannelErrorOverride, `{
		"rules": [
			{
				"conditions": [
					{"source": "status", "op": "eq", "value": 429},
					{"source": "original_status", "op": "eq", "value": 400}
				],
				"message": "mapped status",
				"status_code": 503
			}
		]
	}`)

	apiErr := types.NewOpenAIError(errors.New("bad request"), types.ErrorCodeBadResponseStatusCode, http.StatusBadRequest)
	ApplyErrorOverrides(ctx, apiErr, `{"400":429}`)

	require.Equal(t, http.StatusServiceUnavailable, apiErr.StatusCode)
	require.Equal(t, "mapped status", apiErr.ToOpenAIError().Message)
}

func TestApplyErrorOverridesSupportsExprAndJSConditions(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{
		"model": "gpt-test",
		"stream": false
	}`)
	common.SetContextKey(ctx, constant.ContextKeyChannelErrorOverride, `{
		"rules": [
			{
				"logic": "AND",
				"conditions": [
					{
						"op": "expr",
						"expr": "response.status_code == 429 && get('req.body.stream') == false"
					},
					{
						"op": "js",
						"script": "return get('req.body.model') === 'gpt-test';"
					}
				],
				"message": "{req.body.model} Resource exhausted",
				"status_code": 421
			}
		]
	}`)

	apiErr := types.NewOpenAIError(errors.New("rate limited"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests)
	ApplyErrorOverrides(ctx, apiErr, "")

	require.Equal(t, http.StatusMisdirectedRequest, apiErr.StatusCode)
	require.Equal(t, "gpt-test Resource exhausted", apiErr.ToOpenAIError().Message)
}

func TestValidateChannelErrorOverrideRejectsInvalidHeader(t *testing.T) {
	err := ValidateChannelErrorOverride(common.GetPointer(`{
		"rules": [
			{
				"message": "bad",
				"headers": {
					"Bad\nHeader": "value"
				}
			}
		]
	}`))

	require.Error(t, err)
}

func TestValidateChannelErrorOverrideRejectsInvalidRulesField(t *testing.T) {
	err := ValidateChannelErrorOverride(common.GetPointer(`{"rules":"bad"}`))

	require.Error(t, err)
}
