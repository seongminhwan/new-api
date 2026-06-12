package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func buildRequestMatchTestContext(method string, target string, body string) *gin.Context {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx.Request = req
	return ctx
}

func TestMatchChannelRequestSupportsHeaderQueryAndBody(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions?tier=gold", `{
		"model": "gpt-test",
		"stream": true,
		"max_tokens": 512,
		"reasoning": {"effort": "high"}
	}`)
	ctx.Request.Header.Set("X-Client", "codex")

	channel := &model.Channel{
		Id: 1,
		RequestMatch: common.GetPointer(`{
			"logic": "AND",
			"conditions": [
				{"source": "header", "key": "X-Client", "op": "exists"},
				{"source": "query", "key": "tier", "op": "in", "value": ["gold", "silver"]},
				{"source": "body", "path": "stream", "op": "eq", "value": true},
				{"source": "body", "path": "max_tokens", "op": "lte", "value": 1024},
				{"source": "body", "path": "reasoning.effort", "op": "eq", "value": "high"}
			]
		}`),
	}

	matched, err := MatchChannelRequest(ctx, channel)

	require.NoError(t, err)
	require.True(t, matched)
}

func TestMatchChannelRequestSkipsWhenConditionFails(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions", `{"stream": false}`)
	channel := &model.Channel{
		Id: 1,
		RequestMatch: common.GetPointer(`{
			"logic": "AND",
			"conditions": [
				{"source": "body", "path": "stream", "op": "eq", "value": true}
			]
		}`),
	}

	matched, err := MatchChannelRequest(ctx, channel)

	require.NoError(t, err)
	require.False(t, matched)
}

func TestMatchChannelRequestSupportsPathMethodRegexAndMissing(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/responses", `{}`)
	channel := &model.Channel{
		Id: 1,
		RequestMatch: common.GetPointer(`{
			"logic": "AND",
			"conditions": [
				{"source": "path", "op": "regex", "value": "^/v1/responses$"},
				{"source": "method", "op": "eq", "value": "POST"},
				{"source": "header", "key": "X-Missing", "op": "missing"}
			]
		}`),
	}

	matched, err := MatchChannelRequest(ctx, channel)

	require.NoError(t, err)
	require.True(t, matched)
}

func TestMatchChannelRequestSupportsExprAndJSConditions(t *testing.T) {
	ctx := buildRequestMatchTestContext(http.MethodPost, "/v1/chat/completions?tier=gold", `{
		"model": "gpt-test",
		"stream": false,
		"metadata": {"priority": 9}
	}`)
	ctx.Request.Header.Set("X-Client", "codex")

	channel := &model.Channel{
		Id: 1,
		RequestMatch: common.GetPointer(`{
			"logic": "AND",
			"conditions": [
				{
					"op": "expr",
					"expr": "get('req.body.metadata.priority') > 5 && reqHeader('X-Client') == 'codex'"
				},
				{
					"op": "js",
					"script": "return get('req.body.stream') === false && get('request.query.tier') === 'gold';"
				}
			]
		}`),
	}

	matched, err := MatchChannelRequest(ctx, channel)

	require.NoError(t, err)
	require.True(t, matched)
}

func TestValidateChannelRequestMatchRejectsInvalidRegex(t *testing.T) {
	err := ValidateChannelRequestMatch(common.GetPointer(`{
		"conditions": [
			{"source": "path", "op": "regex", "value": "["}
		]
	}`))

	require.Error(t, err)
}

func TestValidateChannelRequestMatchRejectsInvalidScriptCondition(t *testing.T) {
	err := ValidateChannelRequestMatch(common.GetPointer(`{
		"conditions": [
			{"op": "js", "script": "return ("}
		]
	}`))

	require.Error(t, err)
}
