package service

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/ruleeval"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const ginKeyChannelRequestMatchBody = "channel_request_match_body"

type ChannelRequestMatchConfig struct {
	Logic      string                         `json:"logic,omitempty"`
	Conditions []ChannelRequestMatchCondition `json:"conditions,omitempty"`
}

type ChannelRequestMatchCondition struct {
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

type requestMatchValue struct {
	Exists bool
	Value  interface{}
	Text   string
}

func ValidateChannelRequestMatch(raw *string) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	config, err := parseChannelRequestMatchConfig(*raw)
	if err != nil {
		return err
	}
	logic := strings.ToUpper(strings.TrimSpace(config.Logic))
	if logic != "" && logic != "AND" && logic != "OR" {
		return fmt.Errorf("unsupported logic: %s", config.Logic)
	}
	for i, condition := range config.Conditions {
		if err := validateChannelRequestMatchCondition(condition); err != nil {
			return fmt.Errorf("condition %d: %w", i+1, err)
		}
	}
	return nil
}

func BuildChannelRequestMatchFilter(c *gin.Context) model.ChannelFilterFunc {
	if c == nil {
		return nil
	}
	return func(channel *model.Channel) bool {
		matched, err := MatchChannelRequest(c, channel)
		if err != nil {
			channelID := 0
			if channel != nil {
				channelID = channel.Id
			}
			logger.LogWarn(c, fmt.Sprintf("channel request match skipped channel #%d: %v", channelID, err))
			return false
		}
		return matched
	}
}

func ChannelMatchesRequest(c *gin.Context, channel *model.Channel) bool {
	matched, err := MatchChannelRequest(c, channel)
	if err != nil {
		channelID := 0
		if channel != nil {
			channelID = channel.Id
		}
		logger.LogWarn(c, fmt.Sprintf("channel request match skipped channel #%d: %v", channelID, err))
		return false
	}
	return matched
}

func MatchChannelRequest(c *gin.Context, channel *model.Channel) (bool, error) {
	if channel == nil {
		return false, nil
	}
	raw := strings.TrimSpace(channel.GetRequestMatch())
	if raw == "" {
		return true, nil
	}
	config, err := parseChannelRequestMatchConfig(raw)
	if err != nil {
		return false, err
	}
	if len(config.Conditions) == 0 {
		return true, nil
	}

	logic := strings.ToUpper(strings.TrimSpace(config.Logic))
	if logic == "" {
		logic = "AND"
	}
	if logic != "AND" && logic != "OR" {
		return false, fmt.Errorf("unsupported logic: %s", config.Logic)
	}

	if logic == "AND" {
		for _, condition := range config.Conditions {
			ok, err := evalChannelRequestMatchCondition(c, condition)
			if err != nil || !ok {
				return ok, err
			}
		}
		return true, nil
	}

	for _, condition := range config.Conditions {
		ok, err := evalChannelRequestMatchCondition(c, condition)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

func parseChannelRequestMatchConfig(raw string) (ChannelRequestMatchConfig, error) {
	config := ChannelRequestMatchConfig{}
	if err := common.Unmarshal([]byte(raw), &config); err != nil {
		return config, err
	}
	return config, nil
}

func validateChannelRequestMatchCondition(condition ChannelRequestMatchCondition) error {
	op := normalizeRequestMatchOp(condition)
	switch op {
	case "expr":
		source := requestMatchExpressionSource(condition)
		if source == "" {
			return fmt.Errorf("expr is required")
		}
		return ruleeval.ValidateExpr(source)
	case "js":
		source := requestMatchScriptSource(condition)
		if source == "" {
			return fmt.Errorf("script is required")
		}
		return ruleeval.ValidateJS(source)
	}

	source := normalizeRequestMatchSource(condition.Source)
	if source == "" {
		return fmt.Errorf("source is required")
	}
	switch source {
	case "header", "query", "context":
		if requestMatchLookupKey(condition) == "" {
			return fmt.Errorf("key is required for %s source", source)
		}
	case "body":
		if requestMatchLookupKey(condition) == "" {
			return fmt.Errorf("path is required for body source")
		}
	case "path", "method":
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
		return fmt.Errorf("unsupported op: %s", requestMatchRawOp(condition))
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

func evalChannelRequestMatchCondition(c *gin.Context, condition ChannelRequestMatchCondition) (bool, error) {
	if err := validateChannelRequestMatchCondition(condition); err != nil {
		return false, err
	}
	op := normalizeRequestMatchOp(condition)
	if op == "expr" || op == "js" {
		matched, err := evalChannelRequestMatchScriptCondition(c, condition)
		if err != nil {
			return false, nil
		}
		if condition.Not || condition.Invert {
			matched = !matched
		}
		return matched, nil
	}
	actual, err := resolveChannelRequestMatchValue(c, condition)
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

func evalChannelRequestMatchScriptCondition(c *gin.Context, condition ChannelRequestMatchCondition) (bool, error) {
	input, err := buildChannelRequestMatchRuleInput(c)
	if err != nil {
		return false, err
	}
	switch normalizeRequestMatchOp(condition) {
	case "expr":
		return ruleeval.EvalExprBool(requestMatchExpressionSource(condition), input)
	case "js":
		return ruleeval.EvalJSBool(requestMatchScriptSource(condition), input)
	default:
		return false, fmt.Errorf("unsupported script op: %s", normalizeRequestMatchOp(condition))
	}
}

func buildChannelRequestMatchRuleInput(c *gin.Context) (ruleeval.Input, error) {
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
	}
	return ruleeval.Input{Body: body, Context: context}, nil
}

func resolveChannelRequestMatchValue(c *gin.Context, condition ChannelRequestMatchCondition) (requestMatchValue, error) {
	if c == nil || c.Request == nil {
		return requestMatchValue{}, nil
	}

	source := normalizeRequestMatchSource(condition.Source)
	key := requestMatchLookupKey(condition)
	switch source {
	case "header":
		value, exists := getRequestHeaderValue(c.Request.Header, key)
		return newRequestMatchValue(exists, value), nil
	case "query":
		values := c.Request.URL.Query()
		items, exists := values[key]
		if !exists {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, strings.TrimSpace(strings.Join(items, ","))), nil
	case "body":
		body, err := getRequestMatchBody(c)
		if err != nil {
			return requestMatchValue{}, err
		}
		result := gjson.GetBytes(body, key)
		if !result.Exists() {
			return requestMatchValue{}, nil
		}
		return requestMatchValueFromGJSON(result), nil
	case "path":
		path := ""
		if c.Request.URL != nil {
			path = c.Request.URL.Path
		}
		return newRequestMatchValue(path != "", path), nil
	case "method":
		return newRequestMatchValue(c.Request.Method != "", c.Request.Method), nil
	case "context":
		value, exists := c.Get(key)
		if !exists {
			return requestMatchValue{}, nil
		}
		return newRequestMatchValue(true, value), nil
	default:
		return requestMatchValue{}, fmt.Errorf("unsupported source: %s", condition.Source)
	}
}

func requestMatchExpressionSource(condition ChannelRequestMatchCondition) string {
	if strings.TrimSpace(condition.Expr) != "" {
		return strings.TrimSpace(condition.Expr)
	}
	if source, ok := condition.Value.(string); ok {
		return strings.TrimSpace(source)
	}
	return ""
}

func requestMatchScriptSource(condition ChannelRequestMatchCondition) string {
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

func requestHeaderContext(headers http.Header) map[string]interface{} {
	result := make(map[string]interface{})
	for name, values := range headers {
		normalized := strings.ToLower(strings.TrimSpace(name))
		if normalized == "" {
			continue
		}
		joined := strings.TrimSpace(strings.Join(values, ","))
		if joined != "" {
			result[normalized] = joined
		}
	}
	return result
}

func requestQueryContext(c *gin.Context) map[string]interface{} {
	result := make(map[string]interface{})
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return result
	}
	for name, values := range c.Request.URL.Query() {
		if strings.TrimSpace(name) == "" {
			continue
		}
		result[name] = strings.TrimSpace(strings.Join(values, ","))
	}
	return result
}

func requestBodyContextValue(body []byte) interface{} {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return map[string]interface{}{}
	}
	var value interface{}
	if err := common.Unmarshal([]byte(trimmed), &value); err != nil {
		return trimmed
	}
	return value
}

func getRequestMatchBody(c *gin.Context) ([]byte, error) {
	if cached, ok := c.Get(ginKeyChannelRequestMatchBody); ok {
		if body, ok := cached.([]byte); ok {
			return body, nil
		}
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	body, err := storage.Bytes()
	if err != nil {
		return nil, err
	}
	if _, err := storage.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	c.Request.Body = io.NopCloser(storage)
	c.Set(ginKeyChannelRequestMatchBody, body)
	return body, nil
}

func getRequestHeaderValue(header http.Header, key string) (string, bool) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", false
	}
	for name, values := range header {
		if !strings.EqualFold(name, key) {
			continue
		}
		return strings.TrimSpace(strings.Join(values, ",")), true
	}
	return "", false
}

func newRequestMatchValue(exists bool, value interface{}) requestMatchValue {
	return requestMatchValue{
		Exists: exists,
		Value:  value,
		Text:   requestMatchString(value),
	}
}

func requestMatchValueFromGJSON(result gjson.Result) requestMatchValue {
	switch result.Type {
	case gjson.String:
		return newRequestMatchValue(true, result.String())
	case gjson.Number:
		return newRequestMatchValue(true, result.Num)
	case gjson.True:
		return newRequestMatchValue(true, true)
	case gjson.False:
		return newRequestMatchValue(true, false)
	case gjson.Null:
		return requestMatchValue{Exists: true, Value: nil, Text: ""}
	default:
		return newRequestMatchValue(true, result.Raw)
	}
}

func requestMatchLookupKey(condition ChannelRequestMatchCondition) string {
	if strings.TrimSpace(condition.Path) != "" {
		return strings.TrimSpace(condition.Path)
	}
	return strings.TrimSpace(condition.Key)
}

func requestMatchRawOp(condition ChannelRequestMatchCondition) string {
	if strings.TrimSpace(condition.Op) != "" {
		return strings.TrimSpace(condition.Op)
	}
	return strings.TrimSpace(condition.Mode)
}

func normalizeRequestMatchSource(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))
	switch source {
	case "json", "gjson", "request_body":
		return "body"
	case "request_header":
		return "header"
	case "request_query":
		return "query"
	case "request_path":
		return "path"
	case "request_method":
		return "method"
	default:
		return source
	}
}

func normalizeRequestMatchOp(condition ChannelRequestMatchCondition) string {
	op := strings.ToLower(requestMatchRawOp(condition))
	switch op {
	case "=", "equals", "full":
		return "eq"
	case "!=", "not_eq", "not_equals":
		return "neq"
	case "in_list":
		return "in"
	case "not_in_list":
		return "not_in"
	case "startswith", "starts_with":
		return "prefix"
	case "endswith", "ends_with":
		return "suffix"
	default:
		return op
	}
}

func requestMatchEqual(actual interface{}, expected interface{}) bool {
	if expected == nil {
		return actual == nil || requestMatchString(actual) == ""
	}
	switch expectedValue := expected.(type) {
	case bool:
		actualBool, ok := requestMatchBool(actual)
		return ok && actualBool == expectedValue
	case float64:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, expectedValue)
	case float32:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, float64(expectedValue))
	case int:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, float64(expectedValue))
	case int64:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, float64(expectedValue))
	case uint:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, float64(expectedValue))
	case uint64:
		actualNumber, ok := requestMatchFloat(actual)
		return ok && nearlyEqual(actualNumber, float64(expectedValue))
	default:
		return requestMatchString(actual) == requestMatchString(expected)
	}
}

func requestMatchIn(actual interface{}, expected interface{}) bool {
	switch items := expected.(type) {
	case []interface{}:
		for _, item := range items {
			if requestMatchEqual(actual, item) {
				return true
			}
		}
	case []string:
		for _, item := range items {
			if requestMatchEqual(actual, item) {
				return true
			}
		}
	default:
		return requestMatchEqual(actual, expected)
	}
	return false
}

func requestMatchNumericCompare(actual interface{}, expected interface{}, op string) (bool, error) {
	actualNumber, ok := requestMatchFloat(actual)
	if !ok {
		return false, nil
	}
	expectedNumber, ok := requestMatchFloat(expected)
	if !ok {
		return false, fmt.Errorf("numeric comparison value must be a number")
	}
	switch op {
	case "gt":
		return actualNumber > expectedNumber, nil
	case "gte":
		return actualNumber >= expectedNumber, nil
	case "lt":
		return actualNumber < expectedNumber, nil
	case "lte":
		return actualNumber <= expectedNumber, nil
	default:
		return false, fmt.Errorf("unsupported numeric op: %s", op)
	}
}

func requestMatchFloat(value interface{}) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func requestMatchBool(value interface{}) (bool, bool) {
	switch typed := value.(type) {
	case bool:
		return typed, true
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		return parsed, err == nil
	default:
		return false, false
	}
}

func requestMatchString(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case bool:
		return strconv.FormatBool(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case uint:
		return strconv.FormatUint(uint64(typed), 10)
	case uint64:
		return strconv.FormatUint(typed, 10)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func nearlyEqual(a float64, b float64) bool {
	return math.Abs(a-b) < 1e-9
}
