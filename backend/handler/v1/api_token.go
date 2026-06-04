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

type APITokenHandler struct {
	*handler.BaseHandler
	logger  *log.Logger
	auth    middleware.AuthMiddleware
	usecase *usecase.APITokenUsecase
}

func NewAPITokenHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, auth middleware.AuthMiddleware, usecase *usecase.APITokenUsecase) *APITokenHandler {
	h := &APITokenHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.v1.api_token"),
		auth:        auth,
		usecase:     usecase,
	}

	group := e.Group("/api/pro/v1/token", h.auth.Authorize, h.auth.ValidateKBUserPerm(consts.UserKBPermissionFullControl))
	group.POST("/create", h.Create)
	group.GET("/list", h.List)
	group.PATCH("/update", h.Update)
	group.DELETE("/delete", h.Delete)

	return h
}

func (h *APITokenHandler) Create(c echo.Context) error {
	var req domain.CreateAPITokenReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := h.usecase.Create(c.Request().Context(), &req); err != nil {
		return h.NewResponseWithError(c, "failed to create api token", err)
	}
	return h.NewResponseWithData(c, nil)
}

func (h *APITokenHandler) List(c echo.Context) error {
	var req domain.ListAPITokenReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	tokens, err := h.usecase.List(c.Request().Context(), &req)
	if err != nil {
		return h.NewResponseWithError(c, "failed to list api tokens", err)
	}
	return h.NewResponseWithData(c, tokens)
}

func (h *APITokenHandler) Update(c echo.Context) error {
	var req domain.UpdateAPITokenReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := h.usecase.Update(c.Request().Context(), &req); err != nil {
		return h.NewResponseWithError(c, "failed to update api token", err)
	}
	return h.NewResponseWithData(c, nil)
}

func (h *APITokenHandler) Delete(c echo.Context) error {
	var req domain.DeleteAPITokenReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := h.usecase.Delete(c.Request().Context(), &req); err != nil {
		return h.NewResponseWithError(c, "failed to delete api token", err)
	}
	return h.NewResponseWithData(c, nil)
}
