package share

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/handler"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/usecase"
)

type ShareContributeHandler struct {
	*handler.BaseHandler
	logger  *log.Logger
	usecase *usecase.ContributeUsecase
}

func NewShareContributeHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, contributeUsecase *usecase.ContributeUsecase) *ShareContributeHandler {
	h := &ShareContributeHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.share.contribute"),
		usecase:     contributeUsecase,
	}

	share := e.Group("share/pro/v1/contribute",
		func(next echo.HandlerFunc) echo.HandlerFunc {
			return func(c echo.Context) error {
				c.Response().Header().Set("Access-Control-Allow-Origin", "*")
				c.Response().Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type, Origin, Accept, X-KB-ID")
				if c.Request().Method == "OPTIONS" {
					return c.NoContent(http.StatusOK)
				}
				return next(c)
			}
		}, h.ShareAuthMiddleware.Authorize)
	share.POST("/submit", h.Submit)

	return h
}

func (h *ShareContributeHandler) Submit(c echo.Context) error {
	ctx := c.Request().Context()
	kbID := c.Request().Header.Get("X-KB-ID")
	if kbID == "" {
		return h.NewResponseWithError(c, "kb_id is required", nil)
	}

	var req domain.SubmitContributeReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := c.Validate(req); err != nil {
		return h.NewResponseWithError(c, "validate request body failed", err)
	}
	if !h.Captcha.ValidateToken(ctx, req.CaptchaToken) {
		return h.NewResponseWithError(c, "failed to validate captcha token", nil)
	}

	resp, err := h.usecase.Submit(ctx, kbID, &req, domain.GetAuthID(c), c.RealIP())
	if err != nil {
		if errors.Is(err, domain.ErrPermissionDenied) {
			return h.NewResponseWithErrCode(c, domain.ErrCodePermissionDenied)
		}
		return h.NewResponseWithError(c, "submit contribution failed", err)
	}
	return h.NewResponseWithData(c, resp)
}
