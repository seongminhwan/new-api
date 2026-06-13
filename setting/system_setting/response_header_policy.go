package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type ResponseHeaderPolicySetting struct {
	Whitelist []string `json:"whitelist"`
	Blacklist []string `json:"blacklist"`
}

var responseHeaderPolicySetting = ResponseHeaderPolicySetting{
	Whitelist: []string{},
	Blacklist: []string{},
}

func init() {
	config.GlobalConfig.Register("response_header_policy", &responseHeaderPolicySetting)
}

func GetResponseHeaderPolicySetting() *ResponseHeaderPolicySetting {
	return &responseHeaderPolicySetting
}
