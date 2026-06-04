package v1

import (
	"errors"

	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/handler"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/middleware"
	"github.com/chaitin/panda-wiki/usecase"
)

type ContributeHandler struct {
	*handler.BaseHandler
	logger  *log.Logger
	auth    middleware.AuthMiddleware
	usecase *usecase.ContributeUsecase
}

func NewContributeHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, auth middleware.AuthMiddleware, contributeUsecase *usecase.ContributeUsecase) *ContributeHandler {
	h := &ContributeHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.v1.contribute"),
		auth:        auth,
		usecase:     contributeUsecase,
	}

	group := e.Group("/api/pro/v1/contribute", h.auth.Authorize, h.auth.ValidateKBUserPerm(consts.UserKBPermissionDocManage))
	group.GET("/list", h.GetList)
	group.GET("/detail", h.GetDetail)
	group.POST("/audit", h.Audit)

	return h
}

func (h *ContributeHandler) GetList(c echo.Context) error {
	var req domain.ContributeListReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := c.Validate(req); err != nil {
		return h.NewResponseWithError(c, "validate request params failed", err)
	}
	resp, err := h.usecase.List(c.Request().Context(), &req)
	if err != nil {
		if errors.Is(err, domain.ErrPermissionDenied) {
			return h.NewResponseWithErrCode(c, domain.ErrCodePermissionDenied)
		}
		return h.NewResponseWithError(c, "get contribution list failed", err)
	}
	return h.NewResponseWithData(c, resp)
}

func (h *ContributeHandler) GetDetail(c echo.Context) error {
	var req domain.ContributeDetailReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := c.Validate(req); err != nil {
		return h.NewResponseWithError(c, "validate request params failed", err)
	}
	resp, err := h.usecase.Detail(c.Request().Context(), &req)
	if err != nil {
		if errors.Is(err, domain.ErrPermissionDenied) {
			return h.NewResponseWithErrCode(c, domain.ErrCodePermissionDenied)
		}
		return h.NewResponseWithError(c, "get contribution detail failed", err)
	}
	return h.NewResponseWithData(c, resp)
}

func (h *ContributeHandler) Audit(c echo.Context) error {
	ctx := c.Request().Context()
	authInfo := domain.GetAuthInfoFromCtx(ctx)
	if authInfo == nil {
		return h.NewResponseWithError(c, "authInfo not found in context", nil)
	}

	var req domain.ContributeAuditReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}
	if err := c.Validate(req); err != nil {
		return h.NewResponseWithError(c, "validate request body failed", err)
	}
	resp, err := h.usecase.Audit(ctx, &req, authInfo.UserId)
	if err != nil {
		if errors.Is(err, domain.ErrPermissionDenied) {
			return h.NewResponseWithErrCode(c, domain.ErrCodePermissionDenied)
		}
		return h.NewResponseWithError(c, "audit contribution failed", err)
	}
	return h.NewResponseWithData(c, resp)
}
