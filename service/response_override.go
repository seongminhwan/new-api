package service

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

const responseOverrideChunkIndexKey = "response_override_chunk_index"

type StreamResponseOverrideOptions struct {
	Format string
	Event  string
}

func ValidateChannelResponseOverride(raw *string) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	var parsed map[string]interface{}
	if err := common.Unmarshal([]byte(*raw), &parsed); err != nil {
		return err
	}
	return relaycommon.ValidateParamOverrideConfig(parsed)
}

func ValidateChannelResponseHeaderOverride(raw *string) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	var parsed map[string]interface{}
	if err := common.Unmarshal([]byte(*raw), &parsed); err != nil {
		return err
	}
	return relaycommon.ValidateParamOverrideConfig(parsed)
}

func ApplyResponseOverrides(c *gin.Context, src *http.Response, data []byte) []byte {
	body, _ := ApplyResponseOverridesWithStatus(c, src, data)
	return body
}

func ApplyResponseOverridesWithStatus(c *gin.Context, src *http.Response, data []byte) ([]byte, int) {
	statusCode := http.StatusOK
	var upstreamHeaders http.Header
	if src != nil {
		statusCode = src.StatusCode
		upstreamHeaders = src.Header
	}

	info := getRelayInfoFromContext(c)
	if info == nil || info.ChannelMeta == nil {
		return data, statusCode
	}
	if len(info.ResponseOverride) == 0 && len(info.ResponseHeadersOverride) == 0 {
		return data, statusCode
	}

	headers := c.Writer.Header()
	ctx := buildResponseOverrideContext(c, info, headers, upstreamHeaders, statusCode, false, StreamResponseOverrideOptions{})
	forceJSONContentType := false
	bodyLooksJSON := responseOverrideShouldApplyToBody(data, headers.Get("Content-Type"))
	canApplyRawBody := responseOverrideCanApplyToRawBody(info.ResponseOverride)
	if len(info.ResponseOverride) > 0 && (bodyLooksJSON || canApplyRawBody) {
		next, err := relaycommon.ApplyResponseOverride(data, info.ResponseOverride, ctx)
		switch {
		case err == nil:
			data = next
			applyResponseHeaderFinalMap(headers, relaycommon.HeaderOverrideFromContext(ctx))
			if !bodyLooksJSON && canApplyRawBody && responseOverrideShouldApplyToBody(next, "") {
				forceJSONContentType = true
			}
			if nextStatusCode, ok := relaycommon.StatusOverrideFromContext(ctx); ok {
				statusCode = nextStatusCode
			}
		case isResponseOverrideReturnError(err):
			fixedErr, _ := relaycommon.AsParamOverrideReturnError(err)
			data = responseOverrideErrorBody(fixedErr)
			statusCode = fixedErr.StatusCode
			applyResponseHeaderFinalMap(headers, relaycommon.HeaderOverrideFromContext(ctx))
			forceJSONContentType = true
		case relaycommon.IsOverrideDropChunk(err):
			logger.LogWarn(c, "response override drop_chunk ignored for non-stream response")
		default:
			logger.LogError(c, "response override failed: "+err.Error())
		}
	}

	if len(info.ResponseHeadersOverride) > 0 {
		if nextStatusCode, ok := applyResponseHeaderOverrideConfig(c, info.ResponseHeadersOverride, data, ctx, headers); ok {
			statusCode = nextStatusCode
		}
	}
	if nextStatusCode, ok := relaycommon.StatusOverrideFromContext(ctx); ok {
		statusCode = nextStatusCode
	}
	if forceJSONContentType && !strings.Contains(strings.ToLower(headers.Get("Content-Type")), "json") {
		headers.Set("Content-Type", "application/json; charset=utf-8")
	}
	return data, statusCode
}

func ApplyResponseHeaderOverrides(c *gin.Context) {
	info := getRelayInfoFromContext(c)
	if info == nil || info.ChannelMeta == nil || len(info.ResponseHeadersOverride) == 0 {
		return
	}
	headers := c.Writer.Header()
	upstreamHeaders := getUpstreamResponseHeaders(c)
	statusCode := getUpstreamResponseStatus(c)
	ctx := buildResponseOverrideContext(c, info, headers, upstreamHeaders, statusCode, true, StreamResponseOverrideOptions{})
	_, _ = applyResponseHeaderOverrideConfig(c, info.ResponseHeadersOverride, []byte(`{}`), ctx, headers)
}

func ApplyStreamResponseOverride(c *gin.Context, data string, options StreamResponseOverrideOptions) (string, bool, error) {
	info := getRelayInfoFromContext(c)
	if info == nil || info.ChannelMeta == nil || len(info.ResponseOverride) == 0 {
		return data, false, nil
	}

	trimmed := strings.TrimSpace(data)
	if trimmed == "" || strings.HasPrefix(trimmed, "[DONE]") || !responseOverrideShouldApplyToBody(common.StringToByteSlice(trimmed), "") {
		return data, false, nil
	}

	headers := c.Writer.Header()
	ctx := buildResponseOverrideContext(c, info, headers, getUpstreamResponseHeaders(c), getUpstreamResponseStatus(c), true, options)
	next, err := relaycommon.ApplyResponseOverride(common.StringToByteSlice(trimmed), info.ResponseOverride, ctx)
	if err == nil {
		applyResponseHeaderFinalMap(headers, relaycommon.HeaderOverrideFromContext(ctx))
		return string(next), false, nil
	}
	if relaycommon.IsOverrideDropChunk(err) {
		return "", true, nil
	}
	logger.LogError(c, "stream response override failed: "+err.Error())
	return data, false, err
}

func getRelayInfoFromContext(c *gin.Context) *relaycommon.RelayInfo {
	if c == nil {
		return nil
	}
	info, _ := common.GetContextKeyType[*relaycommon.RelayInfo](c, constant.ContextKeyRelayInfo)
	return info
}

func buildResponseOverrideContext(c *gin.Context, info *relaycommon.RelayInfo, responseHeaders http.Header, upstreamHeaders http.Header, statusCode int, stream bool, options StreamResponseOverrideOptions) map[string]interface{} {
	ctx := relaycommon.BuildParamOverrideContext(info)
	if ctx == nil {
		ctx = make(map[string]interface{})
	}

	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	if len(upstreamHeaders) == 0 {
		upstreamHeaders = getUpstreamResponseHeaders(c)
	}
	upstreamStatus := getUpstreamResponseStatus(c)
	if upstreamStatus == 0 {
		upstreamStatus = statusCode
	}

	ctx["response"] = map[string]interface{}{
		"status":       statusCode,
		"status_code":  statusCode,
		"headers":      headerContextMap(responseHeaders),
		"content_type": responseHeaders.Get("Content-Type"),
	}
	ctx["response_status"] = statusCode
	ctx["response_status_code"] = statusCode
	ctx["upstream_response"] = map[string]interface{}{
		"status":       upstreamStatus,
		"status_code":  upstreamStatus,
		"headers":      headerContextMap(upstreamHeaders),
		"content_type": upstreamHeaders.Get("Content-Type"),
	}
	ctx["upstream_status"] = upstreamStatus
	ctx["upstream_status_code"] = upstreamStatus
	ctx["header_override"] = headerContextMap(responseHeaders)

	if c != nil {
		if body, err := getRequestMatchBody(c); err == nil {
			ctx["request_body"] = requestBodyContextValue(body)
		}
		if c.Request != nil {
			ctx["request_headers"] = requestHeaderContext(c.Request.Header)
			ctx["request_query"] = requestQueryContext(c)
			ctx["request_method"] = c.Request.Method
			if c.Request.URL != nil {
				ctx["request_path"] = c.Request.URL.Path
			}
		}
	}

	format := normalizeStreamResponseFormat(options.Format, info)
	event := strings.TrimSpace(options.Event)
	chunkIndex := 0
	if c != nil {
		chunkIndex = c.GetInt(responseOverrideChunkIndexKey)
		if stream {
			c.Set(responseOverrideChunkIndexKey, chunkIndex+1)
		}
	}
	ctx["stream"] = map[string]interface{}{
		"enabled":     stream,
		"format":      format,
		"event":       event,
		"chunk_index": chunkIndex,
	}
	return ctx
}

func normalizeStreamResponseFormat(format string, info *relaycommon.RelayInfo) string {
	format = strings.TrimSpace(strings.ToLower(format))
	if format != "" {
		return format
	}
	if info == nil {
		return ""
	}
	if info.RelayFormat != "" {
		return strings.TrimSpace(strings.ToLower(string(info.RelayFormat)))
	}
	return ""
}

func responseOverrideShouldApplyToBody(data []byte, contentType string) bool {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return false
	}
	if trimmed[0] == '{' || trimmed[0] == '[' {
		return true
	}
	contentType = strings.ToLower(contentType)
	return strings.Contains(contentType, "json")
}

func responseOverrideCanApplyToRawBody(config map[string]interface{}) bool {
	raw, ok := config["operations"]
	if !ok {
		return false
	}
	operations, ok := raw.([]interface{})
	if !ok {
		if typed, ok := raw.([]map[string]interface{}); ok {
			operations = make([]interface{}, 0, len(typed))
			for _, op := range typed {
				operations = append(operations, op)
			}
		}
	}
	if len(operations) == 0 {
		return false
	}
	for _, item := range operations {
		op, ok := item.(map[string]interface{})
		if !ok {
			return false
		}
		mode := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", op["mode"])))
		switch mode {
		case "set_body", "set_body_expr", "set_body_js",
			"set_status", "set_status_expr", "set_status_js",
			"return_error",
			"set_header", "set_header_expr", "set_header_js",
			"delete_header", "copy_header", "move_header", "pass_headers",
			"drop_chunk", "drop_event":
			continue
		default:
			return false
		}
	}
	return true
}

func isResponseOverrideReturnError(err error) bool {
	_, ok := relaycommon.AsParamOverrideReturnError(err)
	return ok
}

func responseOverrideErrorBody(err *relaycommon.ParamOverrideReturnError) []byte {
	apiErr := relaycommon.NewAPIErrorFromParamOverride(err)
	data, marshalErr := common.Marshal(gin.H{
		"error": apiErr.ToOpenAIError(),
	})
	if marshalErr != nil {
		return []byte(`{"error":{"message":"response override returned error","type":"invalid_request_error","code":"response_override_error"}}`)
	}
	return data
}

func applyResponseHeaderOverrideConfig(c *gin.Context, config map[string]interface{}, body []byte, ctx map[string]interface{}, headers http.Header) (int, bool) {
	if len(config) == 0 {
		return 0, false
	}
	if _, ok := config["operations"]; ok {
		if len(body) == 0 {
			body = []byte(`{}`)
		}
		_, err := relaycommon.ApplyResponseOverride(body, config, ctx)
		if err != nil {
			if relaycommon.IsOverrideDropChunk(err) {
				return 0, false
			}
			logger.LogError(c, "response header override failed: "+err.Error())
			return 0, false
		}
		applyResponseHeaderFinalMap(headers, relaycommon.HeaderOverrideFromContext(ctx))
		return relaycommon.StatusOverrideFromContext(ctx)
	}

	for name, value := range config {
		name = strings.TrimSpace(name)
		if !isSafeResponseOverrideHeaderName(name) {
			continue
		}
		if value == nil {
			headers.Del(name)
			continue
		}
		headerValue := fmt.Sprintf("%v", value)
		if !isSafeResponseHeaderValue(headerValue) {
			continue
		}
		headers.Set(name, headerValue)
	}
	return 0, false
}

func applyResponseHeaderMap(headers http.Header, headerMap map[string]interface{}) {
	for name, value := range headerMap {
		name = strings.TrimSpace(name)
		if !isSafeResponseOverrideHeaderName(name) {
			continue
		}
		if value == nil {
			headers.Del(name)
			continue
		}
		headerValue := fmt.Sprintf("%v", value)
		if !isSafeResponseHeaderValue(headerValue) {
			continue
		}
		headers.Set(name, headerValue)
	}
}

func applyResponseHeaderFinalMap(headers http.Header, headerMap map[string]interface{}) {
	if headers == nil {
		return
	}
	for name := range headerContextMap(headers) {
		if _, ok := headerMap[name]; ok {
			continue
		}
		if isSafeResponseOverrideHeaderName(name) {
			headers.Del(name)
		}
	}
	applyResponseHeaderMap(headers, headerMap)
}

func isSafeResponseOverrideHeaderName(name string) bool {
	name = strings.TrimSpace(name)
	if !isSafeResponseHeaderName(name) {
		return false
	}
	return !strings.EqualFold(name, "Content-Length")
}

func headerContextMap(headers http.Header) map[string]interface{} {
	result := make(map[string]interface{})
	for name, values := range headers {
		normalized := strings.TrimSpace(strings.ToLower(name))
		if normalized == "" {
			continue
		}
		joined := strings.TrimSpace(strings.Join(values, ","))
		if joined == "" {
			continue
		}
		result[normalized] = joined
	}
	return result
}

func getUpstreamResponseStatus(c *gin.Context) int {
	if c == nil {
		return 0
	}
	if value, ok := common.GetContextKey(c, constant.ContextKeyUpstreamResponseStatus); ok {
		switch status := value.(type) {
		case int:
			return status
		case int64:
			return int(status)
		case float64:
			return int(status)
		}
	}
	return 0
}

func getUpstreamResponseHeaders(c *gin.Context) http.Header {
	if c == nil {
		return nil
	}
	headers, _ := common.GetContextKeyType[http.Header](c, constant.ContextKeyUpstreamResponseHeaders)
	return headers
}
