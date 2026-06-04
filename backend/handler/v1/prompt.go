package v1

import (
	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/handler"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/middleware"
	"github.com/chaitin/panda-wiki/usecase"
)

type PromptHandler struct {
	*handler.BaseHandler
	logger  *log.Logger
	auth    middleware.AuthMiddleware
	usecase *usecase.PromptUsecase
}

func NewPromptHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, auth middleware.AuthMiddleware, usecase *usecase.PromptUsecase) *PromptHandler {
	h := &PromptHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.v1.prompt"),
		auth:        auth,
		usecase:     usecase,
	}

	group := e.Group("/api/pro/v1/prompt", h.auth.Authorize, h.auth.ValidateKBUserPerm(consts.UserKBPermissionFullControl))
	group.GET("", h.GetPrompt)
	group.PUT("", h.UpdatePrompt)

	return h
}

func (h *PromptHandler) GetPrompt(c echo.Context) error {
	var req domain.GetPromptReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}

	prompt, err := h.usecase.GetPrompt(c.Request().Context(), req.KBID)
	if err != nil {
		return h.NewResponseWithError(c, "failed to get prompt", err)
	}
	return h.NewResponseWithData(c, prompt)
}

func (h *PromptHandler) UpdatePrompt(c echo.Context) error {
	var req domain.UpdatePromptReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}

	prompt, err := h.usecase.UpdatePrompt(c.Request().Context(), &req)
	if err != nil {
		return h.NewResponseWithError(c, "failed to update prompt", err)
	}
	return h.NewResponseWithData(c, prompt)
}
