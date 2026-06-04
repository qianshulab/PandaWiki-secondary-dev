# PandaWiki 二开版配置与使用手册

更新时间：2026-06-04 14:30 Asia/Shanghai

本文档用于说明当前二开版本的本地预览、生产配置要点、核心功能使用方式、MCP/OpenAI API 调用方式和回滚方法。

## 1. 当前版本状态

- 当前提交：`3fdb6880 feat: add mcp server and restore workflow`
- 已验收回滚点：`checkpoint/secondary-dev-phase3-e2e-pass-20260604-1410`
- API 验收：`16 PASS / 0 FAIL`
- UI 录制验收：`15 PASS / 0 FAIL`
- 后端测试：`go test ./... -run '^$'` 通过
- 前端构建：`web/admin`、`web/app` 均通过

## 2. 本地预览启动

适用于在本机快速访问 Admin 页面、接口和 MCP 服务。该预览环境会使用 Docker/WSL 启动 Postgres、Redis、NATS、MinIO，并使用 fake RAG/fake Caddy 方便本地验证。

### 2.1 启动

在 PowerShell 中执行：

```powershell
wsl -d Ubuntu-22.04 -- bash -lc "cd '/mnt/d/AI WorkSpace/PandaWiki' && ./scripts/e2e/start_local_preview_wsl.sh"
```

脚本会自动完成：

1. 启动 Docker 依赖；
2. 执行数据库迁移；
3. 启动后端 API；
4. 跑一轮 API smoke/E2E 检查；
5. 隔离构建 Admin 前端；
6. 启动 Admin 静态代理。

### 2.2 访问地址

| 项目 | 地址/账号 |
| --- | --- |
| Admin 登录页 | `http://127.0.0.1:5173/login` |
| Wiki 站点预览 | `http://127.0.0.1:3010/node` |
| Wiki 首页预览 | `http://127.0.0.1:3010/home` |
| 后端 API（WSL 内/代理使用） | `http://127.0.0.1:8000` |
| 后端 API（Windows 浏览器/客户端） | `http://localhost:8000` 或 `http://[::1]:8000` |
| MCP Endpoint（Windows 浏览器/客户端） | `http://localhost:8000/mcp` 或 `http://[::1]:8000/mcp` |
| 管理员账号 | `admin` |
| 管理员密码 | `PandaWiki_E2E_123456` |

启动成功后也可以查看：

注意：WSL 有时只将后端 `8000` 端口映射到 Windows IPv6 localhost；如果 `http://127.0.0.1:8000` 访问失败，请使用 `http://localhost:8000` 或 `http://[::1]:8000`。Admin 页面仍使用 `http://127.0.0.1:5173/login`，Wiki 站点预览使用 `http://127.0.0.1:3010/node`。

```text
.e2e-runtime/preview.env
```

### 2.3 停止

保留 Docker 数据卷：

```powershell
wsl -d Ubuntu-22.04 -- bash -lc "cd '/mnt/d/AI WorkSpace/PandaWiki' && ./scripts/e2e/stop_e2e_wsl.sh"
```

停止并删除 E2E 数据卷：

```powershell
wsl -d Ubuntu-22.04 -- env PANDAWIKI_E2E_DROP_VOLUMES=1 bash -lc "cd '/mnt/d/AI WorkSpace/PandaWiki' && ./scripts/e2e/stop_e2e_wsl.sh"
```

## 3. 生产配置要点

生产环境上线前建议按正式环境替换以下配置：

| 配置项 | 建议 |
| --- | --- |
| 域名/HTTPS | 使用正式域名和 HTTPS 反向代理 |
| 数据库 | 生产 Postgres，提前备份 |
| Redis/NATS/MinIO | 使用稳定实例，开启持久化 |
| RAG 服务 | 替换本地 fake RAG 为真实 RAGLite/向量检索服务 |
| 模型配置 | 配置真实 LLM/Embedding 模型 |
| Admin 密码 | 修改默认密码 |
| MCP Token | 使用高强度随机密钥 |
| OpenAI API Secret | 使用高强度随机密钥 |

二开能力开关由后端 FeaturePolicy 统一控制。E2E 使用的专业版能力环境变量包括：

```text
FEATURE_POLICY_ENABLED=true
FEATURE_POLICY_EDITION=profession
FEATURE_POLICY_MAX_KB=10
FEATURE_POLICY_MAX_NODE=10000
FEATURE_POLICY_MAX_ADMIN=20
FEATURE_POLICY_ALLOW_ADMIN_PERM=true
FEATURE_POLICY_ALLOW_CUSTOM_COPYRIGHT=true
FEATURE_POLICY_ALLOW_COMMENT_AUDIT=true
FEATURE_POLICY_ALLOW_ADVANCED_BOT=true
FEATURE_POLICY_ALLOW_WATERMARK=true
FEATURE_POLICY_ALLOW_COPY_PROTECTION=true
FEATURE_POLICY_ALLOW_OPEN_AI_BOT_SETTINGS=true
FEATURE_POLICY_ALLOW_MCP_SERVER=true
FEATURE_POLICY_ALLOW_NODE_STATS=true
FEATURE_POLICY_ALLOW_DOC_HISTORY=true
FEATURE_POLICY_ALLOW_CONTRIBUTION=true
FEATURE_POLICY_ALLOW_VISITOR_PERMISSION_CONTROL=true
```

## 4. 已实现功能使用入口

| 功能 | 使用入口/说明 |
| --- | --- |
| 知识库/文档/管理员数量放开 | 后端 FeaturePolicy 控制，Admin 中直接使用 |
| 自定义 Prompt | Admin 设置页对应 Prompt 配置 |
| 内容合规屏蔽词 | Admin 设置页内容合规配置 |
| API Token | Admin 设置页 API Token 管理 |
| 评论审核 | Admin 反馈/评论审核相关页面 |
| 统计周期 | Admin 统计页，支持近 7 天等周期 |
| 水印 | Admin 设置页水印配置 |
| 内容复制保护 | Admin 设置页复制保护配置 |
| 访客权限控制 | 文档/节点权限设置 |
| 文档历史版本 | 文档编辑页历史入口，支持列表、详情、还原 |
| 贡献投稿/审核 | 前台贡献入口 + Admin 贡献审核列表 |
| OpenAI API Bot | Admin 机器人/API 设置 |
| MCP Server | Admin MCP Server 设置 + `/mcp` 接口 |

### 4.1 发布后访问 Wiki 站点

文档发布后，Wiki 站点由前台 `web/app` 提供访问。

- 本地预览：`http://127.0.0.1:3010/node`
- 首页预览：`http://127.0.0.1:3010/home`
- 生产环境：访问知识库配置的正式域名/端口；如果配置了 `base_url`，以该地址为准。

在 Admin 中发布文档后，打开上面的 Wiki 地址即可看到已发布内容。访问 `/node` 会自动跳转到当前知识库的首篇可访问文档；单篇文档地址格式为：

```text
http://<wiki-domain>/node/<node_id>
```

## 5. MCP Server 使用

当前 MCP 是只读检索能力，适合让外部 AI 客户端查询 PandaWiki 知识库。它不会创建、修改或发布文档。

### 5.1 Endpoint

```text
POST http://127.0.0.1:8000/mcp
GET  http://127.0.0.1:8000/mcp
```

### 5.2 必要参数

知识库 ID 二选一：

```http
X-KB-ID: <kb_id>
```

或：

```text
/mcp?kb_id=<kb_id>
```

如开启 Sample Auth，Token 三选一：

```http
Authorization: Bearer <token>
X-MCP-Token: <token>
```

或：

```text
/mcp?token=<token>
```

### 5.3 initialize 示例

```bash
curl -sS http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' \
  -H 'X-KB-ID: <kb_id>' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 5.4 tools/list 示例

```bash
curl -sS http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' \
  -H 'X-KB-ID: <kb_id>' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### 5.5 tools/call 检索文档示例

```bash
curl -sS http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' \
  -H 'X-KB-ID: <kb_id>' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_docs",
      "arguments": {
        "query": "如何部署 PandaWiki？",
        "limit": 5
      }
    }
  }'
```

## 6. OpenAI API 兼容接口

用于外部系统以 OpenAI Chat Completions 形式调用 PandaWiki 问答。

```text
POST /share/v1/chat/completions
```

请求头：

```http
Authorization: Bearer <openai_api_secret>
X-KB-ID: <kb_id>
```

或用 query 传知识库：

```text
/share/v1/chat/completions?kb_id=<kb_id>
```

示例：

```bash
curl -sS http://127.0.0.1:8000/share/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <openai_api_secret>' \
  -H 'X-KB-ID: <kb_id>' \
  -d '{
    "model": "panda-wiki",
    "messages": [
      {"role": "user", "content": "请总结知识库中的部署流程"}
    ],
    "stream": false
  }'
```

## 7. 回滚

如果需要回到本轮通过验收的版本：

```powershell
git reset --hard checkpoint/secondary-dev-phase3-e2e-pass-20260604-1410
```

如果需要回到本轮开发开始前：

```powershell
git reset --hard checkpoint/secondary-dev-phase3-start-20260604-continue
```

## 8. 注意事项

- 当前 MCP 只支持只读检索，不支持自动创建/发布文档。
- 本地预览脚本会重置 E2E 数据，不能用于保存生产数据。
- 生产上线前必须换成真实 RAG/模型服务，并完成正式域名/HTTPS/权限/密钥检查。
- 上线前建议先备份数据库，再进行灰度验证。
