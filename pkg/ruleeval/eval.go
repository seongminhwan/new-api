package ruleeval

import (
	"crypto/sha256"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/dop251/goja"
	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/vm"
	"github.com/tidwall/gjson"
)

const (
	maxCacheSize         = 512
	defaultScriptTimeout = 50 * time.Millisecond
)

type Input struct {
	Body    []byte
	Context map[string]interface{}
	Current interface{}
	Path    string
	Timeout time.Duration
}

type runtimeInput struct {
	Input
	bodyValue   interface{}
	contextJSON string
}

var exprCompileEnv = map[string]interface{}{
	"body":              map[string]interface{}{},
	"current":           interface{}(nil),
	"path":              "",
	"ctx":               map[string]interface{}{},
	"req":               map[string]interface{}{},
	"request":           map[string]interface{}{},
	"response":          map[string]interface{}{},
	"upstream_response": map[string]interface{}{},
	"stream":            map[string]interface{}{},
	"model":             "",
	"original_model":    "",
	"upstream_model":    "",
	"get":               func(string) interface{} { return nil },
	"exists":            func(string) bool { return false },
	"has":               func(string) bool { return false },
	"header":            func(string) string { return "" },
	"reqHeader":         func(string) string { return "" },
	"respHeader":        func(string) string { return "" },
	"upstreamHeader":    func(string) string { return "" },
	"str":               func(interface{}) string { return "" },
	"num":               func(interface{}) float64 { return 0 },
	"bool":              func(interface{}) bool { return false },
	"json":              func(interface{}) string { return "" },
	"contains":          func(interface{}, interface{}) bool { return false },
	"starts_with":       func(interface{}, interface{}) bool { return false },
	"ends_with":         func(interface{}, interface{}) bool { return false },
	"startsWith":        func(interface{}, interface{}) bool { return false },
	"endsWith":          func(interface{}, interface{}) bool { return false },
	"lower":             func(interface{}) string { return "" },
	"upper":             func(interface{}) string { return "" },
	"max":               math.Max,
	"min":               math.Min,
	"abs":               math.Abs,
	"ceil":              math.Ceil,
	"floor":             math.Floor,
}

var (
	exprCacheMu sync.RWMutex
	exprCache   = make(map[string]*vm.Program, 64)

	jsCacheMu sync.RWMutex
	jsCache   = make(map[string]*goja.Program, 64)
)

func ValidateExpr(source string) error {
	_, err := compileExpr(source)
	return err
}

func ValidateJS(script string) error {
	_, err := compileJS(script)
	return err
}

func EvalExprBool(source string, input Input) (bool, error) {
	value, err := EvalExprValue(source, input)
	if err != nil {
		return false, err
	}
	result, ok := value.(bool)
	if !ok {
		return false, fmt.Errorf("expr result is %T, want bool", value)
	}
	return result, nil
}

func EvalExprValue(source string, input Input) (interface{}, error) {
	program, err := compileExpr(source)
	if err != nil {
		return nil, err
	}
	rt := newRuntimeInput(input)
	result, err := expr.Run(program, rt.env())
	if err != nil {
		return nil, fmt.Errorf("expr run error: %w", err)
	}
	return result, nil
}

func EvalJSBool(script string, input Input) (bool, error) {
	value, err := EvalJSValue(script, input)
	if err != nil {
		return false, err
	}
	result, ok := value.(bool)
	if !ok {
		return false, fmt.Errorf("js result is %T, want bool", value)
	}
	return result, nil
}

func EvalJSValue(script string, input Input) (interface{}, error) {
	program, err := compileJS(script)
	if err != nil {
		return nil, err
	}
	rt := newRuntimeInput(input)
	vm := goja.New()
	if err := installJSRuntime(vm, rt); err != nil {
		return nil, err
	}
	timeout := input.Timeout
	if timeout <= 0 {
		timeout = defaultScriptTimeout
	}
	timer := time.AfterFunc(timeout, func() {
		vm.Interrupt("script execution timeout")
	})
	defer timer.Stop()
	value, err := vm.RunProgram(program)
	if err != nil {
		return nil, fmt.Errorf("js run error: %w", err)
	}
	if goja.IsUndefined(value) {
		return nil, nil
	}
	return value.Export(), nil
}

func compileExpr(source string) (*vm.Program, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("expr source is required")
	}
	key := cacheKey(source)
	exprCacheMu.RLock()
	if program, ok := exprCache[key]; ok {
		exprCacheMu.RUnlock()
		return program, nil
	}
	exprCacheMu.RUnlock()

	program, err := expr.Compile(source, expr.Env(exprCompileEnv))
	if err != nil {
		return nil, fmt.Errorf("expr compile error: %w", err)
	}

	exprCacheMu.Lock()
	if len(exprCache) >= maxCacheSize {
		exprCache = make(map[string]*vm.Program, 64)
	}
	exprCache[key] = program
	exprCacheMu.Unlock()
	return program, nil
}

func compileJS(script string) (*goja.Program, error) {
	script = strings.TrimSpace(script)
	if script == "" {
		return nil, fmt.Errorf("js script is required")
	}
	wrapped := wrapJSScript(script)
	key := cacheKey(wrapped)
	jsCacheMu.RLock()
	if program, ok := jsCache[key]; ok {
		jsCacheMu.RUnlock()
		return program, nil
	}
	jsCacheMu.RUnlock()

	program, err := goja.Compile("channel-rule.js", wrapped, true)
	if err != nil {
		return nil, fmt.Errorf("js compile error: %w", err)
	}

	jsCacheMu.Lock()
	if len(jsCache) >= maxCacheSize {
		jsCache = make(map[string]*goja.Program, 64)
	}
	jsCache[key] = program
	jsCacheMu.Unlock()
	return program, nil
}

func wrapJSScript(script string) string {
	return "(function(){\n\"use strict\";\n" + script + "\n})()"
}

func cacheKey(source string) string {
	sum := sha256.Sum256([]byte(source))
	return fmt.Sprintf("%x", sum[:])
}

func newRuntimeInput(input Input) *runtimeInput {
	rt := &runtimeInput{Input: input}
	rt.bodyValue = parseJSONValue(input.Body)
	if len(input.Context) > 0 {
		if ctxBytes, err := common.Marshal(input.Context); err == nil {
			rt.contextJSON = string(ctxBytes)
		}
	}
	return rt
}

func (rt *runtimeInput) env() map[string]interface{} {
	env := map[string]interface{}{
		"body":              rt.bodyValue,
		"current":           rt.Current,
		"path":              rt.Path,
		"ctx":               rt.Context,
		"req":               rt.requestObject(),
		"request":           rt.requestObject(),
		"response":          rt.contextValue("response"),
		"upstream_response": rt.contextValue("upstream_response"),
		"stream":            rt.contextValue("stream"),
		"get":               rt.get,
		"exists":            rt.exists,
		"has":               rt.exists,
		"header":            rt.requestHeader,
		"reqHeader":         rt.requestHeader,
		"respHeader":        rt.responseHeader,
		"upstreamHeader":    rt.upstreamHeader,
		"str":               toString,
		"num":               toFloat,
		"bool":              toBool,
		"json":              common.GetJsonString,
		"contains":          containsValue,
		"starts_with":       startsWithValue,
		"ends_with":         endsWithValue,
		"startsWith":        startsWithValue,
		"endsWith":          endsWithValue,
		"lower":             func(v interface{}) string { return strings.ToLower(toString(v)) },
		"upper":             func(v interface{}) string { return strings.ToUpper(toString(v)) },
		"max":               math.Max,
		"min":               math.Min,
		"abs":               math.Abs,
		"ceil":              math.Ceil,
		"floor":             math.Floor,
	}
	for key, value := range rt.Context {
		if _, exists := env[key]; !exists {
			env[key] = value
		}
	}
	return env
}

func installJSRuntime(vm *goja.Runtime, rt *runtimeInput) error {
	env := rt.env()
	for key, value := range env {
		if err := vm.Set(key, value); err != nil {
			return err
		}
	}
	_ = vm.Set("eval", goja.Undefined())
	_ = vm.Set("Function", goja.Undefined())
	_ = vm.Set("console", map[string]interface{}{
		"log":   func(...interface{}) {},
		"warn":  func(...interface{}) {},
		"error": func(...interface{}) {},
	})
	return nil
}

func (rt *runtimeInput) requestObject() map[string]interface{} {
	requestBody := rt.contextValue("request_body")
	if requestBody == nil {
		requestBody = rt.bodyValue
	}
	return map[string]interface{}{
		"body":    requestBody,
		"headers": rt.contextValue("request_headers"),
		"query":   rt.contextValue("request_query"),
		"path":    rt.contextValue("request_path"),
		"method":  rt.contextValue("request_method"),
	}
}

func (rt *runtimeInput) get(path string) interface{} {
	value, exists := rt.resolvePath(path)
	if !exists {
		return nil
	}
	return value
}

func (rt *runtimeInput) exists(path string) bool {
	_, exists := rt.resolvePath(path)
	return exists
}

func (rt *runtimeInput) resolvePath(path string) (interface{}, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, false
	}
	if value, exists := rt.resolveHeaderPath(path); exists {
		return value, true
	}
	if requestBodyPath, ok := requestBodyPathAlias(path); ok {
		if requestBodyPath == "" {
			if value, exists := rt.contextPathValue("request_body"); exists {
				return value, true
			}
			return rt.bodyValue, true
		}
		if value, exists := rt.contextPathValue("request_body." + requestBodyPath); exists {
			return value, true
		}
		return rt.bodyPathValue(requestBodyPath)
	}
	if bodyPath, ok := currentBodyPathAlias(path); ok {
		if bodyPath == "" {
			return rt.bodyValue, true
		}
		return rt.bodyPathValue(bodyPath)
	}
	if contextPath, ok := contextPathAlias(path); ok {
		return rt.contextPathValue(contextPath)
	}
	if value, exists := rt.bodyPathValue(path); exists {
		return value, true
	}
	return rt.contextPathValue(path)
}

func (rt *runtimeInput) resolveHeaderPath(path string) (interface{}, bool) {
	lower := strings.ToLower(path)
	switch {
	case strings.HasPrefix(lower, "req.header."):
		return rt.requestHeader(path[len("req.header."):]), true
	case strings.HasPrefix(lower, "req.headers."):
		return rt.requestHeader(path[len("req.headers."):]), true
	case strings.HasPrefix(lower, "request.header."):
		return rt.requestHeader(path[len("request.header."):]), true
	case strings.HasPrefix(lower, "request.headers."):
		return rt.requestHeader(path[len("request.headers."):]), true
	case strings.HasPrefix(lower, "resp.header."):
		return rt.responseHeader(path[len("resp.header."):]), true
	case strings.HasPrefix(lower, "resp.headers."):
		return rt.responseHeader(path[len("resp.headers."):]), true
	case strings.HasPrefix(lower, "response.header."):
		return rt.responseHeader(path[len("response.header."):]), true
	case strings.HasPrefix(lower, "response.headers."):
		return rt.responseHeader(path[len("response.headers."):]), true
	case strings.HasPrefix(lower, "upstream.header."):
		return rt.upstreamHeader(path[len("upstream.header."):]), true
	case strings.HasPrefix(lower, "upstream.headers."):
		return rt.upstreamHeader(path[len("upstream.headers."):]), true
	case strings.HasPrefix(lower, "upstream_response.header."):
		return rt.upstreamHeader(path[len("upstream_response.header."):]), true
	case strings.HasPrefix(lower, "upstream_response.headers."):
		return rt.upstreamHeader(path[len("upstream_response.headers."):]), true
	default:
		return nil, false
	}
}

func requestBodyPathAlias(path string) (string, bool) {
	lower := strings.ToLower(path)
	for _, prefix := range []string{"req.body.", "request.body."} {
		if strings.HasPrefix(lower, prefix) {
			return path[len(prefix):], true
		}
	}
	if lower == "req.body" || lower == "request.body" {
		return "", true
	}
	return "", false
}

func currentBodyPathAlias(path string) (string, bool) {
	lower := strings.ToLower(path)
	if strings.HasPrefix(lower, "body.") {
		return path[len("body."):], true
	}
	if lower == "body" {
		return "", true
	}
	return "", false
}

func contextPathAlias(path string) (string, bool) {
	lower := strings.ToLower(path)
	switch {
	case lower == "request.path" || lower == "req.path":
		return "request_path", true
	case lower == "request.method" || lower == "req.method":
		return "request_method", true
	case strings.HasPrefix(lower, "request.query."):
		return "request_query." + path[len("request.query."):], true
	case strings.HasPrefix(lower, "req.query."):
		return "request_query." + path[len("req.query."):], true
	}
	for _, prefix := range []string{"ctx.", "context."} {
		if strings.HasPrefix(lower, prefix) {
			return path[len(prefix):], true
		}
	}
	switch {
	case strings.HasPrefix(lower, "response."):
		return path, true
	case strings.HasPrefix(lower, "upstream_response."):
		return path, true
	case strings.HasPrefix(lower, "stream."):
		return path, true
	case strings.HasPrefix(lower, "request."):
		return path, true
	default:
		return "", false
	}
}

func (rt *runtimeInput) bodyPathValue(path string) (interface{}, bool) {
	result := gjson.GetBytes(rt.Body, path)
	if !result.Exists() {
		return nil, false
	}
	return gjsonValue(result), true
}

func (rt *runtimeInput) contextPathValue(path string) (interface{}, bool) {
	if rt.contextJSON == "" {
		return nil, false
	}
	result := gjson.Get(rt.contextJSON, path)
	if !result.Exists() {
		return nil, false
	}
	return gjsonValue(result), true
}

func (rt *runtimeInput) contextValue(path string) interface{} {
	value, _ := rt.contextPathValue(path)
	return value
}

func (rt *runtimeInput) requestHeader(name string) string {
	if value, ok := headerFromContext(rt.Context, "request_headers", name); ok {
		return value
	}
	return ""
}

func (rt *runtimeInput) responseHeader(name string) string {
	if value, ok := headerFromContext(rt.Context, "response.headers", name); ok {
		return value
	}
	if value, ok := headerFromContext(rt.Context, "header_override", name); ok {
		return value
	}
	return ""
}

func (rt *runtimeInput) upstreamHeader(name string) string {
	if value, ok := headerFromContext(rt.Context, "upstream_response.headers", name); ok {
		return value
	}
	return ""
}

func headerFromContext(context map[string]interface{}, sourcePath string, name string) (string, bool) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "", false
	}
	ctxBytes, err := common.Marshal(context)
	if err != nil {
		return "", false
	}
	result := gjson.GetBytes(ctxBytes, sourcePath+"."+name)
	if !result.Exists() {
		return "", false
	}
	value := strings.TrimSpace(result.String())
	return value, value != ""
}

func parseJSONValue(data []byte) interface{} {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return map[string]interface{}{}
	}
	var value interface{}
	if err := common.Unmarshal([]byte(trimmed), &value); err != nil {
		return trimmed
	}
	return value
}

func gjsonValue(result gjson.Result) interface{} {
	switch result.Type {
	case gjson.String:
		return result.String()
	case gjson.Number:
		return result.Num
	case gjson.True:
		return true
	case gjson.False:
		return false
	case gjson.Null:
		return nil
	case gjson.JSON:
		var value interface{}
		if err := common.UnmarshalJsonStr(result.Raw, &value); err == nil {
			return value
		}
		return result.Raw
	default:
		return result.Value()
	}
}

func toString(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
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

func toFloat(value interface{}) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case uint:
		return float64(typed)
	case uint64:
		return float64(typed)
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed
	default:
		return 0
	}
}

func toBool(value interface{}) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		parsed, _ := strconv.ParseBool(strings.TrimSpace(typed))
		return parsed
	case float64:
		return typed != 0
	case int:
		return typed != 0
	default:
		return value != nil
	}
}

func containsValue(source interface{}, needle interface{}) bool {
	switch typed := source.(type) {
	case string:
		return strings.Contains(typed, toString(needle))
	case []interface{}:
		for _, item := range typed {
			if compareLoose(item, needle) {
				return true
			}
		}
	case []string:
		for _, item := range typed {
			if compareLoose(item, needle) {
				return true
			}
		}
	default:
		return strings.Contains(toString(source), toString(needle))
	}
	return false
}

func startsWithValue(source interface{}, prefix interface{}) bool {
	return strings.HasPrefix(toString(source), toString(prefix))
}

func endsWithValue(source interface{}, suffix interface{}) bool {
	return strings.HasSuffix(toString(source), toString(suffix))
}

func compareLoose(a interface{}, b interface{}) bool {
	switch typed := a.(type) {
	case bool:
		return typed == toBool(b)
	case float64, float32, int, int64, uint, uint64:
		return math.Abs(toFloat(a)-toFloat(b)) < 1e-9
	default:
		return toString(a) == toString(b)
	}
}
