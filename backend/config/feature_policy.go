package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
)

// FeaturePolicyConfig is the secondary-development feature switch used by the
// open-source build. It provides a clean local policy layer without depending on
// the commercial license verifier that exists in the private edition.
type FeaturePolicyConfig struct {
	Enabled                       bool   `mapstructure:"enabled"`
	Edition                       string `mapstructure:"edition"`
	MaxKB                         int    `mapstructure:"max_kb"`
	MaxNode                       int    `mapstructure:"max_node"`
	MaxSSOUser                    int    `mapstructure:"max_sso_users"`
	MaxAdmin                      int64  `mapstructure:"max_admin"`
	AllowAdminPerm                bool   `mapstructure:"allow_admin_perm"`
	AllowCustomCopyright          bool   `mapstructure:"allow_custom_copyright"`
	AllowCommentAudit             bool   `mapstructure:"allow_comment_audit"`
	AllowAdvancedBot              bool   `mapstructure:"allow_advanced_bot"`
	AllowWatermark                bool   `mapstructure:"allow_watermark"`
	AllowCopyProtection           bool   `mapstructure:"allow_copy_protection"`
	AllowOpenAIBotSettings        bool   `mapstructure:"allow_open_ai_bot_settings"`
	AllowMCPServer                bool   `mapstructure:"allow_mcp_server"`
	AllowNodeStats                bool   `mapstructure:"allow_node_stats"`
	AllowDocHistory               bool   `mapstructure:"allow_doc_history"`
	AllowContribution             bool   `mapstructure:"allow_contribution"`
	AllowVisitorPermissionControl bool   `mapstructure:"allow_visitor_permission_control"`
}

func DefaultFeaturePolicyConfig() FeaturePolicyConfig {
	return FeaturePolicyConfig{
		Enabled:                       true,
		Edition:                       "profession",
		MaxKB:                         10,
		MaxNode:                       10000,
		MaxSSOUser:                    0,
		MaxAdmin:                      20,
		AllowAdminPerm:                true,
		AllowCustomCopyright:          true,
		AllowCommentAudit:             true,
		AllowAdvancedBot:              true,
		AllowWatermark:                true,
		AllowCopyProtection:           true,
		AllowOpenAIBotSettings:        true,
		AllowMCPServer:                true,
		AllowNodeStats:                true,
		AllowDocHistory:               true,
		AllowContribution:             true,
		AllowVisitorPermissionControl: true,
	}
}

func (f FeaturePolicyConfig) EffectiveEdition() consts.LicenseEdition {
	if !f.Enabled {
		return consts.LicenseEditionFree
	}
	switch strings.ToLower(strings.TrimSpace(f.Edition)) {
	case "1", "pro", "profession", "professional":
		return consts.LicenseEditionProfession
	case "2", "enterprise":
		return consts.LicenseEditionEnterprise
	case "3", "business", "commercial":
		return consts.LicenseEditionBusiness
	default:
		return consts.LicenseEditionFree
	}
}

func (f FeaturePolicyConfig) Limitation() domain.BaseEditionLimitation {
	if !f.Enabled {
		return domain.BaseEditionLimitation{
			MaxKb:    1,
			MaxNode:  300,
			MaxAdmin: 1,
		}
	}

	return domain.BaseEditionLimitation{
		MaxKb:                         f.MaxKB,
		MaxNode:                       f.MaxNode,
		MaxSSOUser:                    f.MaxSSOUser,
		MaxAdmin:                      f.MaxAdmin,
		AllowAdminPerm:                f.AllowAdminPerm,
		AllowCustomCopyright:          f.AllowCustomCopyright,
		AllowCommentAudit:             f.AllowCommentAudit,
		AllowAdvancedBot:              f.AllowAdvancedBot,
		AllowWatermark:                f.AllowWatermark,
		AllowCopyProtection:           f.AllowCopyProtection,
		AllowOpenAIBotSettings:        f.AllowOpenAIBotSettings,
		AllowMCPServer:                f.AllowMCPServer,
		AllowNodeStats:                f.AllowNodeStats,
		AllowDocHistory:               f.AllowDocHistory,
		AllowContribution:             f.AllowContribution,
		AllowVisitorPermissionControl: f.AllowVisitorPermissionControl,
	}
}

func (f *FeaturePolicyConfig) OverrideWithEnv() {
	setBoolFromEnv("FEATURE_POLICY_ENABLED", &f.Enabled)
	setStringFromEnv("FEATURE_POLICY_EDITION", &f.Edition)
	setIntFromEnv("FEATURE_POLICY_MAX_KB", &f.MaxKB)
	setIntFromEnv("FEATURE_POLICY_MAX_NODE", &f.MaxNode)
	setIntFromEnv("FEATURE_POLICY_MAX_SSO_USERS", &f.MaxSSOUser)
	setIntFromEnv("FEATURE_POLICY_MAX_SSO_USER", &f.MaxSSOUser)
	setInt64FromEnv("FEATURE_POLICY_MAX_ADMIN", &f.MaxAdmin)

	setBoolFromEnv("FEATURE_POLICY_ALLOW_ADMIN_PERM", &f.AllowAdminPerm)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_CUSTOM_COPYRIGHT", &f.AllowCustomCopyright)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_COMMENT_AUDIT", &f.AllowCommentAudit)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_ADVANCED_BOT", &f.AllowAdvancedBot)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_WATERMARK", &f.AllowWatermark)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_COPY_PROTECTION", &f.AllowCopyProtection)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_OPENAI_BOT_SETTINGS", &f.AllowOpenAIBotSettings)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_OPEN_AI_BOT_SETTINGS", &f.AllowOpenAIBotSettings)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_MCP_SERVER", &f.AllowMCPServer)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_NODE_STATS", &f.AllowNodeStats)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_DOC_HISTORY", &f.AllowDocHistory)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_CONTRIBUTION", &f.AllowContribution)
	setBoolFromEnv("FEATURE_POLICY_ALLOW_VISITOR_PERMISSION_CONTROL", &f.AllowVisitorPermissionControl)
}

func setStringFromEnv(key string, dst *string) {
	if v := os.Getenv(key); v != "" {
		*dst = v
	}
}

func setBoolFromEnv(key string, dst *bool) {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return
	}
	switch v {
	case "1", "t", "true", "y", "yes", "on":
		*dst = true
	case "0", "f", "false", "n", "no", "off":
		*dst = false
	default:
		fmt.Fprintf(os.Stderr, "Invalid bool env %s=%s\n", key, v)
	}
}

func setIntFromEnv(key string, dst *int) {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			*dst = i
		} else {
			fmt.Fprintf(os.Stderr, "Invalid int env %s=%s with err: %s\n", key, v, err)
		}
	}
}

func setInt64FromEnv(key string, dst *int64) {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			*dst = i
		} else {
			fmt.Fprintf(os.Stderr, "Invalid int64 env %s=%s with err: %s\n", key, v, err)
		}
	}
}
