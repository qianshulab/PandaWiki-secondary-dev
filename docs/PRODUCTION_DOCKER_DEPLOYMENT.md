# PandaWiki 生产级 Docker 部署（无 fake 依赖）

更新时间：2026-06-04 23:55 Asia/Shanghai

本部署方案不再使用 `fake_caddy` / `fake_rag`，仅保留真实服务链路（PostgreSQL、Redis、NATS、MinIO、Qdrant、RAGLite、Anydoc Crawler、PandaWiki API、Consumer、Caddy、Admin、App）。

## 1. 目录

- `deploy/production/docker-compose.yml`
- `deploy/production/Caddyfile`
- `web/admin/Dockerfile`
- `web/admin/server.conf`

## 2. 一键启动

### 2.1 推荐：交互式生成生产配置

Windows / PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1
```

Linux / macOS / WSL：

```bash
bash scripts/setup_production.sh
```

脚本会交互式要求输入并二次确认以下生产密码/密钥：

- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `NATS_PASSWORD`
- `S3_SECRET_KEY` / `MINIO_ROOT_PASSWORD`
- `QDRANT_API_KEY`
- `JWT_SECRET`（可直接回车自动生成）

脚本会生成 `deploy/production/.env`。如果该文件已存在，会先自动备份为 `.env.bak.<时间戳>`。

如需生成配置后直接构建并启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1 -Start
```

```bash
bash scripts/setup_production.sh --start
```

### 2.2 手动启动

```bash
cd D:\AI WorkSpace\PandaWiki
docker compose -f deploy/production/docker-compose.yml up -d --build
```

> 当前 WSL 环境同时可使用旧版 `docker-compose`：  
> `docker-compose -f deploy/production/docker-compose.yml up -d --build`

## 3. 服务端口与入口

| 服务 | 外部端口 | 备注 |
| --- | --- | --- |
| Admin（控制台） | `https://127.0.0.1:2443/login` | 直接访问管理后台 |
| API | `http://127.0.0.1:8000` | 后端接口与 MCP |
| MCP | `http://127.0.0.1:8000/mcp` | 与文档一致 |
| Caddy（Wiki 站点） | `http://127.0.0.1:80` | 由 KB 的 `access_settings.port`/`base_url` 决定路由 |
| Caddy（自定义 Wiki 端口） | `http://127.0.0.1:8010-8099` | Windows/WSL 本地验收端口范围；创建 Wiki 时建议选择此范围内端口 |
| MinIO API | `http://127.0.0.1:9000` | 文件存储 |
| MinIO Console | `http://127.0.0.1:9001` | 可选管理 |
| PostgreSQL | `127.0.0.1:5432` | 数据库 |
| Redis | `127.0.0.1:6379` | 缓存/会话 |
| NATS | `127.0.0.1:4222` | MQ |
| Qdrant | 容器内网 `172.30.0.15:6334` | 向量库，RAGLite 使用 |
| RAGLite | 容器内网 `172.30.0.18:5050` | RAG store，API 通过 `RAG_CT_RAG_BASE_URL` 调用 |
| Anydoc Crawler | 容器内网 `172.30.0.17:8080` | URL/Sitemap/RSS/第三方文档导入 |

默认管理员密码：

- 如未显式覆盖，默认：`PandaWiki_Production_Password_Replace_Me`

可用环境变量覆盖（示例）：

```text
POSTGRES_PASSWORD
NATS_PASSWORD
S3_SECRET_KEY
JWT_SECRET
ADMIN_PASSWORD
QDRANT_API_KEY
```

## 4. 核心环境变量（已写死在 compose）

- `SUBNET_PREFIX=172.30.0`
  - 保证后端生成的 Caddy 上游地址与容器静态 IP 对齐：  
    - API：`172.30.0.2:8000`  
    - App：`172.30.0.112:3010`  
    - MinIO：`172.30.0.12:9000`  
    - NATS：`172.30.0.13:4222`
    - Qdrant：`172.30.0.15:6334`
    - Anydoc Crawler：`172.30.0.17:8080`
    - RAGLite：`172.30.0.18:5050`
- `RAG_CT_RAG_BASE_URL=http://172.30.0.18:5050`
  - API/Consumer 同步模型、创建知识库 dataset、文档向量化、AI 搜索/问答均依赖此真实 RAGLite 地址。
- `CADDY_API=/app/run/caddy-admin.sock`
  - 挂载共享卷 `caddy-run`，API/Consumer 均可通过 socket 同步 KB 路由。
  - 代码通过 Unix Socket 调用 Caddy Admin API 时使用 `Host: 127.0.0.1`，避免 Caddy 拒绝 `host not allowed: unix`。
  - 动态下发 Caddy JSON 配置时保留 `admin.listen=unix//app/run/caddy-admin.sock`，避免 `/load` 后 Admin API 回落到 `localhost:2019` 导致后续同步失败。
- `CADDY_ADMIN` 未对外暴露，仅由 API 内网写入。

## 5. 生产启动后的验收清单

### 5.1 容器状态

```bash
docker compose -f deploy/production/docker-compose.yml ps
```

所有容器应显示 `Up`，并且数据库/缓存/MQ 健康检查通过。

### 5.2 API 可用性

```bash
curl -fsS http://127.0.0.1:8000/healthz
```

### 5.3 RAGLite/RAG store 验证

模型保存后，后台会把 embedding / rerank / analysis / chat 模型同步到 RAGLite：

```bash
docker logs pandawiki-prod-api 2>&1 | grep 'successfully updated RAG model'
docker logs pandawiki-prod-raglite 2>&1 | grep '/api/v1/models/upsert'
```

成功时应看到 `POST /api/v1/models/upsert status=200`，不会再出现：

```text
failed to update model in RAG store: embedding
dial tcp 172.30.0.18:5050: connect: no route to host
```

### 5.4 Admin 登录

1. 打开 `https://127.0.0.1:2443/login`
2. 使用 admin 帐号（`admin`）和 `ADMIN_PASSWORD` 登陆。
3. Admin 容器现在会在 Docker 构建阶段执行 `pnpm --filter panda-wiki-admin build`，不再依赖本机残留的 `web/admin/dist`，避免出现后端已放开功能、前端仍显示旧“商业版可用”的问题。
4. `index.html` / SPA 路由响应已设置 `Cache-Control: no-store`；静态 hashed assets 使用 `immutable`。升级后如果浏览器页面一直开着，仍建议执行一次完整刷新（Windows/Chrome：`Ctrl + F5`）或重新登录。

### 5.5 Wiki 站点路由验证

1. 在后台创建知识库（`访问设置 -> 主机地址/端口`）；
2. 建议首次先设置：
   - `domain`：`localhost`
   - `端口`：`8010-8099` 范围内，例如 `8011`
3. 保存并发布任意文档后，使用 `访问 Wiki 网站` 入口或直接访问：
   - `http://127.0.0.1:8011`
   - `/node/<doc_id>` / `/home`

### 5.6 MCP 验证

```bash
curl -sS http://127.0.0.1:8000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

（若服务为授权模式，需要携带 `X-KB-ID`、Token，或把 KB 设置为公开测试。）

### 5.7 二开能力入口核验

登录 Admin 后可按以下位置核验本轮二开能力：

| 能力 | Admin 入口 |
| --- | --- |
| 自定义版权 / Footer | `设置 -> 门户网站 -> 定制 Footer`、`设置 -> 门户网站 -> 智能问答版权信息` |
| 自定义 AI Prompt | `设置 -> 问答设置 -> 智能问答提示词` |
| 高级机器人配置 | `设置 -> AI 机器人` |
| OpenAI 兼容问答 API | `设置 -> AI 机器人 -> 问答机器人 API` |
| MCP Server | `设置 -> MCP 设置` |
| API Token | `设置 -> 访问控制 -> API Token` |
| 页面水印 / 复制保护 | `设置 -> 安全设置` |

当前生产容器验收结果：`安全设置` 页面已无“商业版可用”遮罩，水印与内容复制选项均可点击。

## 6. 与旧 fake 链路的差异

- `fake_caddy.py` / `fake_rag.py` 不再参与生产部署；
- 真实 Wiki 访问由 Caddy 的 Unix Socket Admin API 动态同步；
- 真实 RAG 由 RAGLite + Qdrant + MinIO + NATS 链路完成；
- URL/Sitemap/RSS/第三方文档导入由 Anydoc Crawler 完成；
- Admin 与 Wiki 分离端口（本配置为：Admin `2443`、Wiki `80`）；
- 业务基础功能不改造，仅补齐部署链路。

## 7. 常用维护命令

```bash
# 查看日志
docker compose -f deploy/production/docker-compose.yml logs -f pandawiki-api
docker compose -f deploy/production/docker-compose.yml logs -f pandawiki-raglite
docker compose -f deploy/production/docker-compose.yml logs -f pandawiki-caddy

# 重启某个服务
docker compose -f deploy/production/docker-compose.yml restart pandawiki-api

# 清理环境
docker compose -f deploy/production/docker-compose.yml down -v
```

## 8. 本次 RAG store 报错修复记录

### 现象

配置好模型后切换/应用模型模式，接口返回：

```text
failed to update model in RAG store: embedding
```

API 日志中对应底层错误：

```text
Post "http://172.30.0.18:5050/api/v1/models/upsert": dial tcp 172.30.0.18:5050: connect: no route to host
```

### 根因

生产 compose 里缺少真实 `raglite` / `qdrant` 服务，API 默认按 `SUBNET_PREFIX` 访问 `http://172.30.0.18:5050`，但该地址没有容器监听。

### 修复

- 新增 `pandawiki-raglite`：官方 RAG store；
- 新增 `pandawiki-qdrant`：向量库；
- 新增 `pandawiki-crawler`：生产导入链路；
- 给 API/Consumer 显式配置 `RAG_CT_RAG_BASE_URL=http://172.30.0.18:5050`；
- 删除 PandaWiki API 自行创建 `raglite.>` JetStream 的逻辑，避免和 RAGLite 官方 `raglite_tasks` / `raglite_events` stream 冲突。
