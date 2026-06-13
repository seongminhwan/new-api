package service

import (
	"net/http"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

func ApplyGlobalResponseHeaderPolicy(c *gin.Context) {
	if c == nil || c.Writer == nil {
		return
	}
	ApplyGlobalResponseHeaderPolicyToHeader(c.Writer.Header())
}

func ApplyGlobalResponseHeaderPolicyToHeader(headers http.Header) {
	if len(headers) == 0 {
		return
	}
	setting := system_setting.GetResponseHeaderPolicySetting()
	if setting == nil {
		return
	}
	whitelist := normalizeResponseHeaderPatterns(setting.Whitelist)
	blacklist := normalizeResponseHeaderPatterns(setting.Blacklist)
	if len(whitelist) == 0 && len(blacklist) == 0 {
		return
	}
	for name := range headers {
		if len(whitelist) > 0 && !responseHeaderNameMatchesAny(name, whitelist) {
			headers.Del(name)
			continue
		}
		if responseHeaderNameMatchesAny(name, blacklist) {
			headers.Del(name)
		}
	}
}

func normalizeResponseHeaderPatterns(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(values))
	patterns := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		patterns = append(patterns, value)
	}
	return patterns
}

func responseHeaderNameMatchesAny(name string, patterns []string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return false
	}
	for _, patternValue := range patterns {
		if patternValue == "*" || patternValue == name {
			return true
		}
		if strings.Contains(patternValue, "*") {
			if matched, _ := path.Match(patternValue, name); matched {
				return true
			}
		}
	}
	return false
}
