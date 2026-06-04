package share

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/handler"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/usecase"
)

const (
	defaultMCPToolName = "get_docs"
	defaultMCPToolDesc = "为解决用户的问题从知识库中检索文档"
)

type ShareMCPHandler struct {
	*handler.BaseHandler
	logger      *log.Logger
	appUsecase  *usecase.AppUsecase
	chatUsecase *usecase.ChatUsecase
}

func NewShareMCPHandler(
	e *echo.Echo,
	baseHandler *handler.BaseHandler,
	logger *log.Logger,
	appUsecase *usecase.AppUsecase,
	chatUsecase *usecase.ChatUsecase,
) *ShareMCPHandler {
	h := &ShareMCPHandler{
		BaseHandler: baseHandler,
		logger:      logger.WithModule("handler.share.mcp"),
		appUsecase:  appUsecase,
		chatUsecase: chatUsecase,
	}

	e.OPTIONS("/mcp", h.Options)
	e.POST("/mcp", h.Handle)
	e.GET("/mcp", h.Info)
	return h
}

func (h *ShareMCPHandler) Options(c echo.Context) error {
	h.setCORS(c)
	return c.NoContent(http.StatusOK)
}

func (h *ShareMCPHandler) Info(c echo.Context) error {
	h.setCORS(c)
	return c.JSON(http.StatusOK, map[string]any{
		"name":     "PandaWiki MCP Server",
		"endpoint": "/mcp",
		"protocol": "jsonrpc-2.0",
		"methods":  []string{"initialize", "tools/list", "tools/call", "ping"},
	})
}

func (h *ShareMCPHandler) Handle(c echo.Context) error {
	h.setCORS(c)

	var raw json.RawMessage
	if err := json.NewDecoder(c.Request().Body).Decode(&raw); err != nil {
		return c.JSON(http.StatusOK, domain.MCPJSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &domain.MCPRPCError{Code: -32700, Message: "parse error"},
		})
	}

	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "[") {
		var reqs []mcpRPCRequest
		if err := json.Unmarshal(raw, &reqs); err != nil {
			return c.JSON(http.StatusOK, domain.MCPJSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &domain.MCPRPCError{Code: -32600, Message: "invalid request"},
			})
		}
		responses := make([]domain.MCPJSONRPCResponse, 0, len(reqs))
		for _, req := range reqs {
			resp, shouldWrite, status := h.handleOne(c, req)
			if status != http.StatusOK {
				return c.JSON(status, resp)
			}
			if shouldWrite {
				responses = append(responses, resp)
			}
		}
		if len(responses) == 0 {
			return c.NoContent(http.StatusAccepted)
		}
		return c.JSON(http.StatusOK, responses)
	}

	var req mcpRPCRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return c.JSON(http.StatusOK, domain.MCPJSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &domain.MCPRPCError{Code: -32600, Message: "invalid request"},
		})
	}
	resp, shouldWrite, status := h.handleOne(c, req)
	if !shouldWrite {
		return c.NoContent(http.StatusAccepted)
	}
	return c.JSON(status, resp)
}

type mcpRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

func (h *ShareMCPHandler) handleOne(c echo.Context, req mcpRPCRequest) (domain.MCPJSONRPCResponse, bool, int) {
	id := rawID(req.ID)
	resp := domain.MCPJSONRPCResponse{JSONRPC: "2.0", ID: id}
	if len(req.ID) == 0 && strings.HasPrefix(req.Method, "notifications/") {
		return resp, false, http.StatusOK
	}
	if req.JSONRPC != "" && req.JSONRPC != "2.0" {
		resp.Error = &domain.MCPRPCError{Code: -32600, Message: "jsonrpc must be 2.0"}
		return resp, true, http.StatusOK
	}

	kbID := h.getKBID(c)
	if kbID == "" && req.Method != "ping" {
		resp.Error = &domain.MCPRPCError{Code: -32602, Message: "X-KB-ID header or kb_id query is required"}
		return resp, true, http.StatusOK
	}

	settings, err := h.getEnabledSettings(c, kbID)
	if err != nil && req.Method != "ping" {
		status := http.StatusOK
		if errors.Is(err, errMCPUnauthorized) {
			status = http.StatusUnauthorized
		}
		resp.Error = mcpErrFromError(err)
		return resp, true, status
	}

	switch req.Method {
	case "initialize":
		resp.Result = domain.MCPInitializeResult{
			ProtocolVersion: "2024-11-05",
			Capabilities: domain.MCPServerCapabilities{
				Tools: map[string]any{},
			},
			ServerInfo: domain.MCPServerInfo{
				Name:    "PandaWiki MCP Server",
				Version: "1.0.0",
			},
		}
	case "ping":
		resp.Result = map[string]any{}
	case "tools/list":
		resp.Result = domain.MCPToolListResult{Tools: []domain.MCPTool{h.toolFromSettings(settings)}}
	case "tools/call":
		result, err := h.callTool(c, kbID, settings, req.Params)
		if err != nil {
			resp.Error = &domain.MCPRPCError{Code: -32602, Message: err.Error()}
			return resp, true, http.StatusOK
		}
		resp.Result = result
	default:
		resp.Error = &domain.MCPRPCError{Code: -32601, Message: fmt.Sprintf("method %s not found", req.Method)}
	}
	return resp, true, http.StatusOK
}

func (h *ShareMCPHandler) callTool(c echo.Context, kbID string, settings domain.MCPServerSettings, rawParams json.RawMessage) (*domain.MCPToolCallResult, error) {
	var params domain.MCPToolCallParams
	if len(rawParams) > 0 {
		if err := json.Unmarshal(rawParams, &params); err != nil {
			return nil, fmt.Errorf("invalid tool call params")
		}
	}
	tool := h.toolFromSettings(settings)
	if params.Name != tool.Name {
		return nil, fmt.Errorf("unknown tool %q", params.Name)
	}

	query, _ := params.Arguments["query"].(string)
	if query == "" {
		query, _ = params.Arguments["question"].(string)
	}
	if query == "" {
		query, _ = params.Arguments["input"].(string)
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	limit := 5
	if rawLimit, ok := params.Arguments["limit"]; ok {
		switch v := rawLimit.(type) {
		case float64:
			limit = int(v)
		case int:
			limit = v
		case string:
			if parsed, err := strconv.Atoi(v); err == nil {
				limit = parsed
			}
		}
	}

	docs, err := h.chatUsecase.RetrieveDocsForMCP(c.Request().Context(), kbID, query, limit)
	if err != nil {
		h.logger.Error("mcp retrieve docs failed", log.Error(err), log.String("kb_id", kbID))
		return &domain.MCPToolCallResult{
			IsError: true,
			Content: []domain.MCPContent{{
				Type: "text",
				Text: "检索文档失败：" + err.Error(),
			}},
		}, nil
	}
	return &domain.MCPToolCallResult{
		Content: []domain.MCPContent{{
			Type: "text",
			Text: docs,
		}},
	}, nil
}

func (h *ShareMCPHandler) getEnabledSettings(c echo.Context, kbID string) (domain.MCPServerSettings, error) {
	app, err := h.appUsecase.GetMCPServerAppInfo(c.Request().Context(), kbID)
	if err != nil {
		return domain.MCPServerSettings{}, err
	}
	settings := app.Settings.MCPServerSettings
	if !settings.IsEnabled {
		return settings, errMCPDisabled
	}
	if settings.SampleAuth.Enabled && settings.SampleAuth.Password != "" {
		token := bearerToken(c.Request().Header.Get("Authorization"))
		if token == "" {
			token = c.Request().Header.Get("X-MCP-Token")
		}
		if token == "" {
			token = c.QueryParam("token")
		}
		if token != settings.SampleAuth.Password {
			return settings, errMCPUnauthorized
		}
	}
	return settings, nil
}

func (h *ShareMCPHandler) toolFromSettings(settings domain.MCPServerSettings) domain.MCPTool {
	name := strings.TrimSpace(settings.DocsToolSettings.Name)
	if name == "" {
		name = defaultMCPToolName
	}
	desc := strings.TrimSpace(settings.DocsToolSettings.Desc)
	if desc == "" {
		desc = defaultMCPToolDesc
	}
	return domain.MCPTool{
		Name:        name,
		Description: desc,
		InputSchema: domain.MCPInputSchema{
			Type: "object",
			Properties: map[string]domain.MCPProperty{
				"query": {
					Type:        "string",
					Description: "要检索的用户问题或关键词",
				},
				"limit": {
					Type:        "number",
					Description: "最多返回的文档数量，范围 1-20",
					Default:     5,
				},
			},
			Required: []string{"query"},
		},
	}
}

func (h *ShareMCPHandler) getKBID(c echo.Context) string {
	if kbID := c.Request().Header.Get("X-KB-ID"); kbID != "" {
		return kbID
	}
	return c.QueryParam("kb_id")
}

func (h *ShareMCPHandler) setCORS(c echo.Context) {
	c.Response().Header().Set("Access-Control-Allow-Origin", "*")
	c.Response().Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type, Origin, Accept, Authorization, X-KB-ID, X-MCP-Token")
}

func rawID(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func bearerToken(header string) string {
	if token, ok := strings.CutPrefix(header, "Bearer "); ok {
		return strings.TrimSpace(token)
	}
	return ""
}

var (
	errMCPDisabled     = errors.New("MCP Server is not enabled")
	errMCPUnauthorized = errors.New("MCP authorization failed")
)

func mcpErrFromError(err error) *domain.MCPRPCError {
	switch {
	case errors.Is(err, errMCPDisabled):
		return &domain.MCPRPCError{Code: -32002, Message: err.Error()}
	case errors.Is(err, errMCPUnauthorized):
		return &domain.MCPRPCError{Code: -32001, Message: err.Error()}
	default:
		return &domain.MCPRPCError{Code: -32000, Message: err.Error()}
	}
}
