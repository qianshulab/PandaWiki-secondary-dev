# PandaWiki 二开版配置与使用手册

更新时间：2026-06-04 15:28 Asia/Shanghai

本文档用于说明当前二开版本的本地预览、生产配置要点、核心功能使用方式、MCP/OpenAI API 调用方式和回滚方法。

## 1. 当前版本状态

- 当前分支：`secondary-dev-analysis`（具体提交以 `git log -1 --oneline` 为准）
- 已验收回滚点：`checkpoint/secondary-dev-phase3-e2e-pass-20260604-1410`
- API 验收：`16 PASS / 0 FAIL`
- UI 录制验收：`15 PASS / 0 FAIL`
- 后端测试：`go test ./... -run '^$'` 通过
- 前端构建：`web/admin`、`web/app` 均通过
- 本地预览补充：fake Caddy 已从“只模拟 Admin Socket”调整为“Admin Socket + 轻量反向代理”，用于模拟生产 Caddy 的 host/port -> `X-KB-ID` 链路，不改动开源版基础业务代码。

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
| Wiki 直连预览（默认演示 KB） | `http://127.0.0.1:3010/node` |
| Wiki 首页直连预览 | `http://127.0.0.1:3010/home` |
| Wiki Caddy 链路预览 | 知识库配置的 host/port，例如 `http://127.0.0.1:18081` |
| 后端 API（WSL 内/代理使用） | `http://127.0.0.1:8000` |
| 后端 API（Windows 浏览器/客户端） | `http://localhost:8000` 或 `http://[::1]:8000` |
| MCP Endpoint（Windows 浏览器/客户端） | `http://localhost:8000/mcp` 或 `http://[::1]:8000/mcp` |
| 管理员账号 | `admin` |
| 管理员密码 | `PandaWiki_E2E_123456` |

启动成功后也可以查看：

注意：WSL 有时只将后端 `8000` 端口映射到 Windows IPv6 localhost；如果 `http://127.0.0.1:8000` 访问失败，请使用 `http://localhost:8000` 或 `http://[::1]:8000`。Admin 页面仍使用 `http://127.0.0.1:5173/login`。Wiki 直连预览使用 `http://127.0.0.1:3010/node`；新建/修改知识库配置的独立 host/port 需要通过 fake Caddy/生产 Caddy 链路访问。

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

### 4.0 Markdown 附件压缩包导入

后台进入“文档 / 导入文档 / 通过离线文件导入”，可上传 `.zip` 格式的 Markdown 附件压缩包。压缩包中可以包含 Markdown 文件和图片/附件目录，例如：

```text
文档包.zip
├── iOS端frida工具配置优化.md
└── assets/
    ├── 截图 1.png
    └── 配置示例.jpg
```

导入时会自动读取 Markdown，上传被 Markdown 引用的本地附件，并将相对路径替换为 `/static-file/...` 地址。中文文件名和中文目录名可正常处理。

### 4.1 发布后访问 Wiki 站点

文档发布后，Wiki 站点由前台 `web/app` 提供访问。生产链路为 Caddy/反向代理按知识库 host/port 注入 `X-KB-ID` 后转发到 `web/app`；本地预览使用 fake Caddy 模拟这条链路。

- 本地直连预览：`http://127.0.0.1:3010/node`，用于默认演示知识库。
- 本地 Caddy 链路预览：访问知识库配置的 host/port，例如 `http://127.0.0.1:18081`；该方式最接近生产访问。
- 生产环境：访问知识库配置的正式域名/端口；如后台通过公网域名访问，可在“门户网站 / 网站基本信息 / 外网 Wiki 访问域名”中配置公网 Wiki 地址。

在 Admin 中发布文档后，打开上面的 Wiki 地址即可看到已发布内容。访问 `/node` 会自动跳转到当前知识库的首篇可访问文档；单篇文档地址格式为：

```text
http://<wiki-domain>/node/<node_id>
```

Admin 顶部“访问 Wiki 网站”按钮按后台访问方式选择跳转地址：

- 后台通过域名访问：优先打开“外网 Wiki 访问域名”（知识库 `access_settings.base_url`）。
- 后台通过内网 IP、localhost 或 IPv6 地址访问：继续按服务监听的 host/port 生成内网访问地址。

“外网 Wiki 访问域名”只影响后台按钮跳转地址，不改变服务监听方式、端口、证书和反向代理配置。若手工创建/修改知识库并配置了独立 host/port，内网访问后台时仍会打开该 host/port。

如果后台修改设置后前台未体现，先确认访问的是该知识库自己的 Caddy/base_url 地址，而不是固定的 3010 直连默认预览；固定 3010 在本地开发中只适合默认演示知识库。

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
