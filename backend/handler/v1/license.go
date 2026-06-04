package v1

import (
	"time"

	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/config"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/handler"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/middleware"
)

type LicenseHandler struct {
	*handler.BaseHandler
	logger *log.Logger
	auth   middleware.AuthMiddleware
	config *config.Config
}

func NewLicenseHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, auth middleware.AuthMiddleware, config *config.Config) *LicenseHandler {
	h := &LicenseHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.v1.license"),
		auth:        auth,
		config:      config,
	}

	group := e.Group("/api/v1/license", h.auth.Authorize)
	group.GET("", h.GetLicense)
	group.POST("", h.SetLicense)
	group.DELETE("", h.DeleteLicense)

	return h
}

func (h *LicenseHandler) GetLicense(c echo.Context) error {
	return h.NewResponseWithData(c, h.currentLicense())
}

func (h *LicenseHandler) SetLicense(c echo.Context) error {
	// The open-source secondary-development build uses feature_policy config
	// instead of importing or validating commercial license files.
	return h.NewResponseWithData(c, h.currentLicense())
}

func (h *LicenseHandler) DeleteLicense(c echo.Context) error {
	return h.NewResponseWithData(c, h.currentLicense())
}

func (h *LicenseHandler) currentLicense() domain.LicenseResp {
	now := time.Now()
	return domain.LicenseResp{
		Edition:    h.config.FeaturePolicy.EffectiveEdition(),
		StartedAt:  now.AddDate(-1, 0, 0).Unix(),
		ExpiredAt:  now.AddDate(100, 0, 0).Unix(),
		State:      1,
		Limitation: h.config.FeaturePolicy.Limitation(),
	}
}
