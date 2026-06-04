package middleware

import (
	"context"
	"encoding/json"

	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/config"
	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
)

type FeaturePolicyMiddleware struct {
	config *config.Config
	logger *log.Logger
}

func NewFeaturePolicyMiddleware(config *config.Config, logger *log.Logger) *FeaturePolicyMiddleware {
	return &FeaturePolicyMiddleware{
		config: config,
		logger: logger.WithModule("middleware.feature_policy"),
	}
}

func (m *FeaturePolicyMiddleware) Apply(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		edition := m.config.FeaturePolicy.EffectiveEdition()
		limitation := m.config.FeaturePolicy.Limitation()

		c.Set("edition", edition)
		c.Set(string(consts.ContextKeyEdition), edition)

		limitationBytes, err := json.Marshal(limitation)
		if err != nil {
			m.logger.Error("marshal feature policy limitation failed", log.Error(err))
			return next(c)
		}

		ctx := context.WithValue(c.Request().Context(), domain.ContextKeyEditionLimitation, limitationBytes)
		ctx = context.WithValue(ctx, consts.ContextKeyEdition, edition)
		c.SetRequest(c.Request().WithContext(ctx))

		return next(c)
	}
}
