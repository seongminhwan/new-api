package service

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/ruleeval"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

type ChannelErrorOverrideConfig struct {
	Rules []ChannelErrorOverrideRule `json:"rules,omitempty"`
}

type ChannelErrorOverrideRule struct {
	Logic           string                          `json:"logic,omitempty"`
	Conditions      []ChannelErrorOverrideCondition `json:"conditions,omitempty"`
	Message         string                          `json:"message,omitempty"`
	StatusCode      *int                            `json:"status_code,omitempty"`
	Status          *int                            `json:"status,omitempty"`
	Headers         map[string]interface{}          `json:"headers,omitempty"`
	ResponseHeaders map[string]interface{}          `json:"response_headers,omitempty"`
}

type ChannelErrorOverrideCondition struct {
	Source string      `json:"source"`
	Key    string      `json:"key,omitempty"`
	Path   string      `json:"path,omitempty"`
	Op     string      `json:"op,omitempty"`
	Mode   string      `json:"mode,omitempty"`
	Value  interface{} `json:"value,omitempty"`
	Expr   string      `json:"expr,omitempty"`
	Script string      `json:"script,omitempty"`
	Not    bool        `json:"not,omitempty"`
	Invert bool        `json:"invert,omitempty"`
}

type errorOverrideEvalContext struct {
	OriginalStatusCode int
	UpstreamStatusCode int
	UpstreamHeaders    http.Header
}

func ValidateChannelErrorOverride(raw *string) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	config, err := parseChannelErrorOverrideConfig(*raw)
	if err != nil {
		return err
	}
	for i, rule := range config.Rules {
		if err := validateChannelErrorOverrideRule(rule); err != nil {
			return fmt.Errorf("rule %d: %w", i+1, err)
		}
	}
	return nil
}

func RecordUpstreamResponse(c *gin.Context, resp *http.Response) {
	if c == nil || resp == nil {
		return
	}
	common.SetContextKey(c, constant.ContextKeyUpstreamResponseStatus, resp.StatusCode)
	common.SetContextKey(c, constant.ContextKeyUpstreamResponseHeaders, cloneHTTPHeader(resp.Header))
}

func ApplyErrorResponseHeaders(c *gin.Context, newApiErr *types.NewAPIError) {
	if c == nil || newApiErr == nil || len(newApiErr.ResponseHeaders) == 0 {
		return
	}
	for name, value := range newApiErr.ResponseHeaders {
		name = strings.TrimSpace(name)
		if !isSafeResponseHeaderName(name) {
			continue
		}
		if value == nil {
			c.Writer.Header().Del(name)
			continue
		}
		if !isSafeResponseHeaderValue(*value) {
			continue
		}
		c.Writer.Header().Set(name, *value)
	}
}

func ApplyErrorOverrides(c *gin.Context, newApiErr *types.NewAPIError, statusCodeMappingStr string) {
	if newApiErr == nil {
		return
	}
	originalStatusCode := newApiErr.StatusCode
	ResetStatusCode(newApiErr, statusCodeMappingStr)
	if c == nil {
		return
	}
	ApplyErrorMessageOverride(c, newApiErr, common.GetContextKeyString(c, constant.ContextKeyChannelErrorOverride), originalStatusCode)
}

func ApplyErrorMessageOverride(c *gin.Context, newApiErr *types.NewAPIError, raw string, originalStatusCode int) {
	if c == nil || newApiErr == nil || strings.TrimSpace(raw) == "" {
		return
	}
	config, err := parseChannelErrorOverrideConfig(raw)
	if err != nil {
		return
	}
	evalCtx := newErrorOverrideEvalContext(c, originalStatusCode)
	for _, rule := range config.Rules {
		matched, err := matchChannelErrorOverrideRule(c, newApiErr, evalCtx, rule)
		if err != nil || !matched {
			continue
		}
		if strings.TrimSpace(rule.Message) != "" {
			newApiErr.SetMessage(renderErrorOverrideTemplate(c, newApiErr, evalCtx, rule.Message))
		}
		if statusCode, ok := getErrorOverrideRuleStatusCode(rule); ok {
			newApiErr.StatusCode = statusCode
		}
		applyErrorOverrideRuleHeaders(c, newApiErr, evalCtx, rule)
		return
	}
}

func parseChannelErrorOverrideConfig(raw string) (ChannelErrorOverrideConfig, error) {
	var config ChannelErrorOverrideConfig
	var rawValue interface{}
	if err := common.Unmarshal([]byte(raw), &rawValue); err != nil {
		return config, err
	}

	switch value := rawValue.(type) {
	case []interface{}:
		var rules []ChannelErrorOverrideRule
		if err := common.Unmarshal([]byte(raw), &rules); err != nil {
			return config, err
		}
		return ChannelErrorOverrideConfig{Rules: rules}, nil
	case map[string]interface{}:
		if _, hasRules := value["rules"]; hasRules {
			if err := common.Unmarshal([]byte(raw), &config); err != nil {
				return config, err
			}
			return config, nil
		}
		var singleRule ChannelErrorOverrideRule
		if err := common.Unmarshal([]byte(raw), &singleRule); err != nil {
			return config, err
		}
		if len(singleRule.Conditions) > 0 || strings.TrimSpace(singleRule.Message) != "" || singleRule.StatusCode != nil || singleRule.Status != nil || len(singleRule.Headers) > 0 || len(singleRule.ResponseHeaders) > 0 {
			return ChannelErrorOverrideConfig{Rules: []ChannelErrorOverrideRule{singleRule}}, nil
		}
		return ChannelErrorOverrideConfig{}, nil
	default:
		return config, fmt.Errorf("config must be a JSON object or array")
	}
}

func validateChannelErrorOverrideRule(rule ChannelErrorOverrideRule) error {
	logic := strings.ToUpper(strings.TrimSpace(rule.Logic))
	if logic != "" && logic != "AND" && logic != "OR" {
		return fmt.Errorf("unsupported logic: %s", rule.Logic)
	}
	if strings.TrimSpace(rule.Message) == "" && rule.StatusCode == nil && rule.Status == nil && len(getErrorOverrideRuleHeaders(rule)) == 0 {
		return fmt.Errorf("message, status_code or headers is required")
	}
	if statusCode, ok := getErrorOverrideRuleStatusCode(rule); ok && !isValidHTTPStatusCode(statusCode) {
		return fmt.Errorf("status_code out of range: %d", statusCode)
	}
	for name, value := range getErrorOverrideRuleHeaders(rule) {
		if !isSafeResponseHeaderName(name) {
			return fmt.Errorf("invalid response header name: %s", name)
		}
		if value != nil && !isSafeResponseHeaderValue(requestMatchString(value)) {
			return fmt.Errorf("invalid response header value for %s", name)
		}
	}
	for i, condition := range rule.Conditions {
		if err := validateChannelErrorOverrideCondition(condition); err != nil {
			return fmt.Errorf("condition %d: %w", i+1, err)
		}
	}
	return nil
}

func validateChannelErrorOverrideCondition(condition ChannelErrorOverrideCondition) error {
	op := normalizeErrorOverrideOp(condition)
	switch op {
	case "expr":
		source := errorOverrideExpressionSource(condition)
		if source == "" {
			return fmt.Errorf("expr is required")
		}
		return ruleeval.ValidateExpr(source)
	case "js":
		source := errorOverrideScriptSource(condition)
		if source == "" {
			return fmt.Errorf("script is required")
		}
		return ruleeval.ValidateJS(source)
	}

	source := normalizeErrorOverrideSource(condition.Source)
	if source == "" {
		return fmt.Errorf("source is required")
	}
	switch source {
	case "status", "original_status", "upstream_status", "error_message", "error_code", "error_type", "channel_id", "channel_name", "channel_type":
	case "req_header", "req_query", "resp_header":
		if errorOverrideLookupKey(condition) == "" {
			return fmt.Errorf("key is required for %s source", condition.Source)
		}
	case "req_body":
		if errorOverrideLookupKey(condition) == "" {
			return fmt.Errorf("path is required for %s source", condition.Source)
		}
	default:
		return fmt.Errorf("unsupported source: %s", condition.Source)
	}

	if op == "" {
		return fmt.Errorf("op is required")
	}
	switch op {
	case "exists", "missing":
		return nil
	case "eq", "neq", "in", "not_in", "contains", "prefix", "suffix", "regex", "gt", "gte", "lt", "lte":
	default:
		return fmt.Errorf("unsupported op: %s", errorOverrideRawOp(condition))
	}
	if condition.Value == nil {
		return fmt.Errorf("value is required for %s", op)
	}
	if op == "regex" {
		pattern, ok := condition.Value.(string)
		if !ok || strings.TrimSpace(pattern) == "" {
			return fmt.Errorf("regex value must be a non-empty string")
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("invalid regex: %w", err)
		}
	}
	return nil
}

func matchChannelErrorOverrideRule(c *gin.Context, apiErr *types.NewAPIError, evalCtx errorOverrideEvalContext, rule ChannelErrorOverrideRule) (bool, error) {
	if err := validateChannelErrorOverrideRule(rule); err != nil {
		return false, err
	}
	if len(rule.Conditions) == 0 {
		return true, nil
	}
	logic := strings.ToUpper(strings.TrimSpace(rule.Logic))
	if logic == "" {
		logic = "AND"
	}
	if logic == "AND" {
		for _, condition := range rule.Conditions {
			ok, err := evalChannelErrorOverrideCondition(c, apiErr, evalCtx, condition)
			if err != nil || !ok {
				return ok, err
			}
		}
		return true, nil
	}
	for _, condition := range rule.Conditions {
		ok, err := evalChannelErrorOverrideCondition(c, apiErr, evalCtx, condition)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

func evalChannelErrorOverrideCondition(c *gin.Context, apiErr *types.NewAPIError, evalCtx errorOverrideEvalContext, condition ChannelErrorOverrideCondition) (bool, error) {
	if err := validateChannelErrorOverrideCondition(condition); err != nil {
		return false, err
	}
	op := normalizeErrorOverrideOp(condition)
	if op == "expr" || op == "js" {
		matched, err := evalChannelErrorOverrideScriptCondition(c, apiErr, evalCtx, condition)
		if err != nil {
			return false, nil
		}
		if condition.Not || condition.Invert {
			matched = !matched
		}
		return matched, nil
	}
	actual, err := resolveChannelErrorOverrideValue(c, apiErr, evalCtx, condition)
	if err != nil {
		return false, err
	}

	var matched bool
	switch op {
	case "exists":
		matched = actual.Exists
	case "missing":
		matched = !actual.Exists
	case "eq":
		matched = requestMatchEqual(actual.Value, condition.Value)
	case "neq":
		matched = !requestMatchEqual(actual.Value, condition.Value)
	case "in":
		matched = requestMatchIn(actual.Value, condition.Value)
	case "not_in":
		matched = !requestMatchIn(actual.Value, condition.Value)
	case "contains":
		matched = strings.Contains(actual.Text, requestMatchString(condition.Value))
	case "prefix":
		matched = strings.HasPrefix(actual.Text, requestMatchString(condition.Value))
	case "suffix":
		matched = strings.HasSuffix(actual.Text, requestMatchString(condition.Value))
	case "regex":
		matched, err = regexp.MatchString(requestMatchString(condition.Value), actual.Text)
	case "gt", "gte", "lt", "lte":
		matched, err = requestMatchNumericCompare(actual.Value, condition.Value, op)
	default:
		err = fmt.Errorf("unsupported op: %s", op)
	}
	if err != nil {
		return false, err
	}
	if condition.Not || condition.Invert {
		matched = !matched
	}
	return matched, nil
}

func evalChannelErrorOverrideScriptCondition(c *gin.Context, apiErr *types.NewAPIError, evalCtx errorOverrideEvalContext, condition ChannelErrorOverrideCondition) (bool, error) {
	input, err := buildChannelErrorOverrideRuleInput(c, apiErr, evalCtx)
	if err != nil {
		return false, err
	}
	switch normalizeErrorOverrideOp(condition) {
	case "expr":
		return ruleeval.EvalExprBool(errorOverrideExpressionSource(condition), input)
	case "js":
		return ruleeval.EvalJSBool(errorOverrideScriptSource(condition), input)
	default:
		return false, fmt.Errorf("unsupported script op: %s", normalizeErrorOverrideOp(condition))
	}
}

func buildChannelErrorOverrideRuleInput(c *gin.Context, apiErr *types.NewAPIError, evalCtx errorOverrideEvalContext) (ruleeval.Input, error) {
	context := map[string]interface{}{}
	var body []byte
	if c != nil && c.Request != nil {
		var err error
		body, err = getRequestMatchBody(c)
		if err != nil {
			return ruleeval.Input{}, err
		}
		context["request_body"] = requestBodyContextValue(body)
		context["request_headers"] = requestHeaderContext(c.Request.Header)
		context["request_query"] = requestQueryContext(c)
		context["request_method"] = c.Request.Method
		if c.Request.URL != nil {
			context["request_path"] = c.Request.URL.Path
		}
		context["channel"] = map[string]interface{}{
			"id":   common.GetContextKeyInt(c, constant.ContextKeyChannelId),
			"name": common.GetContextKeyString(c, constant.ContextKeyChannelName),
			"type": common.GetContextKeyInt(c, constant.ContextKeyChannelType),
		}
	}
	statusCode := 0
	message := ""
	code := ""
	errorType := ""
	if apiErr != nil {
		statusCode = apiErr.StatusCode
		message = apiErr.Error()
		code = string(apiErr.GetErrorCode())
		errorType = string(apiErr.GetErrorType())
	}
	context["error"] = map[string]interface{}{
		"status":      statusCode,
		"status_code": statusCode,
		"message":     message,
		"code":        code,
		"error_code":  code,
		"type":        errorType,
		"error_type":  errorType,
	}
	context["response"] = map[string]interface{}{
		"status":      statusCode,
		"status_code": statusCode,
	}
	upstreamStatus := evalCtx.UpstreamStatusCode
	if upstreamStatus == 0 {
		upstreamStatus = evalCtx.OriginalStatusCode
	}
	context["original_status"] = evalCtx.OriginalStatusCode
	context["original_status_code"] = evalCtx.OriginalStatusCode
	context["upstream_response"] = map[string]interface{}{
		"status":      upstreamStatus,
		"status_code": upstreamStatus,
		"headers":     requestHeaderContext(evalCtx.UpstreamHeaders),
	}
	context["upstream_status"] = upstreamStatus
	context["upstream_status_code"] = upstreamStatus
	return ruleeval.Input{Body: body, Context: context}, nil
}

func resolveChannelErrorOverrideValue(c *gin.Context, err *types.NewAPIError, evalCtx errorOverrideEvalContext, condition ChannelErrorOverrideCondition) (requestMatchValue, error) {
	source := normalizeErrorOverrideSource(condition.Source)
	key := errorOverrideLookupKey(condition)
	switch source {
	case "status":
		return newRequestMatchValue(err != nil && err.StatusCode != 0, err.StatusCode), nil
	case "original_status":
		return newRequestMatchValue(evalCtx.OriginalStatusCode != 0, evalCtx.OriginalStatusCode), nil
	case "upstream_status":
		if evalCtx.UpstreamStatusCode != 0 {
			return newRequestMatchValue(true, evalCtx.UpstreamStatusCode), nil
		}
		return newRequestMatchValue(evalCtx.OriginalStatusCode != 0, evalCtx.OriginalStatusCode), nil
	case "error_message":
		if err == nil {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(err.Error() != "", err.Error()), nil
	case "error_code":
		if err == nil {
			return requestMatchValue{}, nil
		}
		code := string(err.GetErrorCode())
		return newRequestMatchValue(code != "", code), nil
	case "error_type":
		if err == nil {
			return requestMatchValue{}, nil
		}
		errorType := string(err.GetErrorType())
		return newRequestMatchValue(errorType != "", errorType), nil
	case "channel_id":
		if c == nil {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, common.GetContextKeyInt(c, constant.ContextKeyChannelId)), nil
	case "channel_name":
		if c == nil {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, common.GetContextKeyString(c, constant.ContextKeyChannelName)), nil
	case "channel_type":
		if c == nil {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, common.GetContextKeyInt(c, constant.ContextKeyChannelType)), nil
	case "req_header":
		if c == nil || c.Request == nil {
			return requestMatchValue{}, nil
		}
		value, exists := getRequestHeaderValue(c.Request.Header, key)
		return newRequestMatchValue(exists, value), nil
	case "req_query":
		if c == nil || c.Request == nil || c.Request.URL == nil {
			return requestMatchValue{}, nil
		}
		items, exists := c.Request.URL.Query()[key]
		if !exists {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, strings.TrimSpace(strings.Join(items, ","))), nil
	case "req_body":
		if c == nil {
			return requestMatchValue{}, nil
		}
		body, err := getRequestMatchBody(c)
		if err != nil {
			return requestMatchValue{}, err
		}
		result := gjson.GetBytes(body, key)
		if !result.Exists() {
			return requestMatchValue{}, nil
		}
		return requestMatchValueFromGJSON(result), nil
	case "resp_header":
		value, exists := getRequestHeaderValue(evalCtx.UpstreamHeaders, key)
		return newRequestMatchValue(exists, value), nil
	default:
		return requestMatchValue{}, fmt.Errorf("unsupported source: %s", condition.Source)
	}
}

func errorOverrideExpressionSource(condition ChannelErrorOverrideCondition) string {
	if strings.TrimSpace(condition.Expr) != "" {
		return strings.TrimSpace(condition.Expr)
	}
	if source, ok := condition.Value.(string); ok {
		return strings.TrimSpace(source)
	}
	return ""
}

func errorOverrideScriptSource(condition ChannelErrorOverrideCondition) string {
	if strings.TrimSpace(condition.Script) != "" {
		return strings.TrimSpace(condition.Script)
	}
	if strings.TrimSpace(condition.Expr) != "" {
		return strings.TrimSpace(condition.Expr)
	}
	if source, ok := condition.Value.(string); ok {
		return strings.TrimSpace(source)
	}
	return ""
}

func renderErrorOverrideTemplate(c *gin.Context, err *types.NewAPIError, evalCtx errorOverrideEvalContext, template string) string {
	re := regexp.MustCompile(`\{([^{}]+)\}`)
	return re.ReplaceAllStringFunc(template, func(match string) string {
		key := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(match, "{"), "}"))
		value, ok := resolveErrorOverrideTemplateValue(c, err, evalCtx, key)
		if !ok {
			return ""
		}
		return requestMatchString(value)
	})
}

func resolveErrorOverrideTemplateValue(c *gin.Context, err *types.NewAPIError, evalCtx errorOverrideEvalContext, key string) (interface{}, bool) {
	switch {
	case key == "status_code" || key == "status":
		if err == nil || err.StatusCode == 0 {
			return nil, false
		}
		return err.StatusCode, true
	case key == "original_status" || key == "original_status_code":
		if evalCtx.OriginalStatusCode == 0 {
			return nil, false
		}
		return evalCtx.OriginalStatusCode, true
	case key == "upstream_status" || key == "upstream_status_code":
		if evalCtx.UpstreamStatusCode != 0 {
			return evalCtx.UpstreamStatusCode, true
		}
		if evalCtx.OriginalStatusCode == 0 {
			return nil, false
		}
		return evalCtx.OriginalStatusCode, true
	case key == "error.message":
		if err == nil {
			return nil, false
		}
		return err.Error(), err.Error() != ""
	case key == "error.code":
		if err == nil {
			return nil, false
		}
		code := string(err.GetErrorCode())
		return code, code != ""
	case key == "error.type":
		if err == nil {
			return nil, false
		}
		errorType := string(err.GetErrorType())
		return errorType, errorType != ""
	case key == "channel.id":
		if c == nil {
			return nil, false
		}
		return common.GetContextKeyInt(c, constant.ContextKeyChannelId), true
	case key == "channel.name":
		if c == nil {
			return nil, false
		}
		return common.GetContextKeyString(c, constant.ContextKeyChannelName), true
	case key == "channel.type":
		if c == nil {
			return nil, false
		}
		return common.GetContextKeyInt(c, constant.ContextKeyChannelType), true
	case strings.HasPrefix(key, "req.body."):
		if c == nil {
			return nil, false
		}
		body, err := getRequestMatchBody(c)
		if err != nil {
			return nil, false
		}
		result := gjson.GetBytes(body, strings.TrimPrefix(key, "req.body."))
		if !result.Exists() {
			return nil, false
		}
		return requestMatchValueFromGJSON(result).Value, true
	case strings.HasPrefix(key, "req.query."):
		if c == nil || c.Request == nil || c.Request.URL == nil {
			return nil, false
		}
		queryKey := strings.TrimPrefix(key, "req.query.")
		items, exists := c.Request.URL.Query()[queryKey]
		if !exists {
			return nil, false
		}
		return strings.TrimSpace(strings.Join(items, ",")), true
	case strings.HasPrefix(key, "req.header."):
		if c == nil || c.Request == nil {
			return nil, false
		}
		return getRequestHeaderValue(c.Request.Header, strings.TrimPrefix(key, "req.header."))
	case strings.HasPrefix(key, "resp.header."):
		return getRequestHeaderValue(evalCtx.UpstreamHeaders, strings.TrimPrefix(key, "resp.header."))
	case strings.HasPrefix(key, "upstream.header."):
		return getRequestHeaderValue(evalCtx.UpstreamHeaders, strings.TrimPrefix(key, "upstream.header."))
	default:
		return nil, false
	}
}

func errorOverrideLookupKey(condition ChannelErrorOverrideCondition) string {
	if strings.TrimSpace(condition.Path) != "" {
		return strings.TrimSpace(condition.Path)
	}
	return strings.TrimSpace(condition.Key)
}

func errorOverrideRawOp(condition ChannelErrorOverrideCondition) string {
	if strings.TrimSpace(condition.Op) != "" {
		return strings.TrimSpace(condition.Op)
	}
	return strings.TrimSpace(condition.Mode)
}

func normalizeErrorOverrideSource(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))
	source = strings.ReplaceAll(source, "-", "_")
	switch source {
	case "effective_status", "status_code", "error_status", "error.status", "error.status_code":
		return "status"
	case "original_status", "original_status_code", "error_original_status", "error.original_status":
		return "original_status"
	case "upstream_status", "upstream_status_code", "upstream.status", "upstream.status_code", "resp_status", "resp.status", "response_status", "response.status":
		return "upstream_status"
	case "message", "error.message":
		return "error_message"
	case "code", "error.code":
		return "error_code"
	case "type", "error.type":
		return "error_type"
	case "header", "request_header", "req.header", "req_header":
		return "req_header"
	case "response_header", "response.header", "resp.header", "resp_header", "upstream_header", "upstream.header", "upstream_response_header":
		return "resp_header"
	case "query", "request_query", "req.query", "req_query":
		return "req_query"
	case "body", "json", "gjson", "request_body", "req.body", "req_body":
		return "req_body"
	case "channel.id":
		return "channel_id"
	case "channel.name":
		return "channel_name"
	case "channel.type":
		return "channel_type"
	default:
		return source
	}
}

func normalizeErrorOverrideOp(condition ChannelErrorOverrideCondition) string {
	return normalizeRequestMatchOp(ChannelRequestMatchCondition{
		Op:   condition.Op,
		Mode: condition.Mode,
	})
}

func getErrorOverrideRuleStatusCode(rule ChannelErrorOverrideRule) (int, bool) {
	if rule.StatusCode != nil {
		return *rule.StatusCode, true
	}
	if rule.Status != nil {
		return *rule.Status, true
	}
	return 0, false
}

func getErrorOverrideRuleHeaders(rule ChannelErrorOverrideRule) map[string]interface{} {
	if len(rule.Headers) == 0 && len(rule.ResponseHeaders) == 0 {
		return nil
	}
	headers := make(map[string]interface{}, len(rule.Headers)+len(rule.ResponseHeaders))
	for name, value := range rule.Headers {
		headers[name] = value
	}
	for name, value := range rule.ResponseHeaders {
		headers[name] = value
	}
	return headers
}

func applyErrorOverrideRuleHeaders(c *gin.Context, newApiErr *types.NewAPIError, evalCtx errorOverrideEvalContext, rule ChannelErrorOverrideRule) {
	if c == nil || newApiErr == nil {
		return
	}
	headers := getErrorOverrideRuleHeaders(rule)
	if len(headers) == 0 {
		return
	}
	if newApiErr.ResponseHeaders == nil {
		newApiErr.ResponseHeaders = make(map[string]*string, len(headers))
	}
	for name, rawValue := range headers {
		name = strings.TrimSpace(name)
		if !isSafeResponseHeaderName(name) {
			continue
		}
		if rawValue == nil {
			newApiErr.ResponseHeaders[name] = nil
			continue
		}
		value := renderErrorOverrideTemplate(c, newApiErr, evalCtx, requestMatchString(rawValue))
		if !isSafeResponseHeaderValue(value) {
			continue
		}
		newApiErr.ResponseHeaders[name] = common.GetPointer(value)
	}
}

func newErrorOverrideEvalContext(c *gin.Context, originalStatusCode int) errorOverrideEvalContext {
	evalCtx := errorOverrideEvalContext{OriginalStatusCode: originalStatusCode}
	if c == nil {
		return evalCtx
	}
	if value, ok := common.GetContextKey(c, constant.ContextKeyUpstreamResponseStatus); ok {
		switch status := value.(type) {
		case int:
			evalCtx.UpstreamStatusCode = status
		case int64:
			evalCtx.UpstreamStatusCode = int(status)
		case float64:
			evalCtx.UpstreamStatusCode = int(status)
		}
	}
	if headers, ok := common.GetContextKeyType[http.Header](c, constant.ContextKeyUpstreamResponseHeaders); ok {
		evalCtx.UpstreamHeaders = headers
	}
	return evalCtx
}

func cloneHTTPHeader(src http.Header) http.Header {
	if len(src) == 0 {
		return http.Header{}
	}
	dst := make(http.Header, len(src))
	for key, values := range src {
		dst[key] = append([]string(nil), values...)
	}
	return dst
}

func isSafeResponseHeaderName(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !strings.ContainsAny(name, "\r\n:")
}

func isSafeResponseHeaderValue(value string) bool {
	return !strings.ContainsAny(value, "\r\n")
}

func isValidHTTPStatusCode(statusCode int) bool {
	return statusCode >= 100 && statusCode <= 599
}
