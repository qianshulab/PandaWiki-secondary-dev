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

type BlockWordHandler struct {
	*handler.BaseHandler
	logger  *log.Logger
	auth    middleware.AuthMiddleware
	usecase *usecase.BlockWordUsecase
}

func NewBlockWordHandler(e *echo.Echo, baseHandler *handler.BaseHandler, logger *log.Logger, auth middleware.AuthMiddleware, usecase *usecase.BlockWordUsecase) *BlockWordHandler {
	h := &BlockWordHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.v1.block_word"),
		auth:        auth,
		usecase:     usecase,
	}

	group := e.Group("/api/pro/v1/block", h.auth.Authorize, h.auth.ValidateKBUserPerm(consts.UserKBPermissionFullControl))
	group.GET("", h.GetBlockWords)
	group.POST("", h.SetBlockWords)

	return h
}

func (h *BlockWordHandler) GetBlockWords(c echo.Context) error {
	var req domain.GetBlockWordsReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}

	words, err := h.usecase.GetBlockWords(c.Request().Context(), req.KBID)
	if err != nil {
		return h.NewResponseWithError(c, "failed to get block words", err)
	}
	return h.NewResponseWithData(c, words)
}

func (h *BlockWordHandler) SetBlockWords(c echo.Context) error {
	var req domain.CreateBlockWordsReq
	if err := c.Bind(&req); err != nil {
		return h.NewResponseWithError(c, "bind request", err)
	}
	if err := c.Validate(&req); err != nil {
		return h.NewResponseWithError(c, "invalid request", err)
	}

	if err := h.usecase.UpsertBlockWords(c.Request().Context(), &req); err != nil {
		return h.NewResponseWithError(c, "failed to set block words", err)
	}
	return h.NewResponseWithData(c, nil)
}
