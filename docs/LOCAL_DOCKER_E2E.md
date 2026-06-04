# PandaWiki 本地 Docker / WSL 端到端验收说明

本文档记录本次为了做第一阶段二开验收，在本机完成的 Docker、WSL、Go、Node/pnpm 安装配置，以及如何复现端到端验收。

## 1. 已安装/配置的本机环境

### WSL：Ubuntu-22.04

在 `Ubuntu-22.04` 的 root 环境中安装/配置：

| 类别 | 内容 |
| --- | --- |
| Docker | `docker.io`，当前验证版本：`Docker version 29.1.3` |
| Docker Compose | `docker-compose`，当前验证版本：`1.29.2` |
| Go | `go1.24.3 linux/amd64`，安装目录：`/usr/local/go` |
| Node.js | `v25.9.0`，安装目录：`/usr/local/node` |
| pnpm | `10.12.1` |
| Playwright | Chromium 浏览器验收运行器，安装目录：`.e2e-runtime/ui-runner` |
| 其他工具 | `curl`、`ca-certificates`、`xz-utils`、`python3`、`python3-pip`、`jq`、`lsof`、`net-tools` |

PATH 配置文件：

- `/etc/profile.d/pandawiki-go.sh`
- `/etc/profile.d/pandawiki-node.sh`

可复用安装脚本：

```bash
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/install_wsl_tooling.sh"
```

### Windows

在 Windows 全局安装：

```powershell
npm install -g pnpm@10.12.1
```

用于验证 `web/admin` 的 Vite 构建。

## 2. 新增的本地验收文件

| 文件 | 作用 |
| --- | --- |
| `deploy/e2e/docker-compose.yml` | 本地依赖服务：Postgres、Redis、NATS、MinIO |
| `scripts/e2e/run_e2e_wsl.sh` | 一键启动依赖、迁移数据库、启动后端 API、执行 E2E 验收 |
| `scripts/e2e/e2e_acceptance.py` | 第一阶段 API 验收用例 |
| `scripts/e2e/fake_rag.py` | 本地 fake RAGLite 服务，避免依赖真实 RAG 服务 |
| `scripts/e2e/fake_caddy.py` | 本地 fake Caddy Admin Socket |
| `scripts/e2e/build_frontend_wsl.sh` | Linux/WSL 下隔离构建 `web/app`，也可通过环境变量构建 admin/all |
| `scripts/e2e/admin_static_proxy.py` | Admin 静态资源服务 + API 反向代理，用于录制验收 |
| `scripts/e2e/ui_record_e2e.js` | Playwright UI 录制验收用例，输出截图、trace、视频 |
| `scripts/e2e/run_ui_record_e2e_wsl.sh` | 一键运行 API E2E、Admin 构建、UI 录制验收 |
| `scripts/e2e/start_local_preview_wsl.sh` | 启动可人工访问的本地预览环境，不跑 UI 录制 |
| `scripts/e2e/stop_e2e_wsl.sh` | 停止本地 E2E 服务 |
| `reports/e2e-first-stage-report.json` | 最近一次 E2E 验收报告 |
| `reports/ui-e2e-report.json` | 最近一次 UI 录制验收报告 |

## 3. 一键运行端到端验收

默认会重建 E2E 数据卷，所以每次是干净数据。

```powershell
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/run_e2e_wsl.sh"
```

保留上次数据运行：

```powershell
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_E2E_RESET=0 /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/run_e2e_wsl.sh"
```

默认管理员：

- 账号：`admin`
- 密码：`PandaWiki_E2E_123456`

## 4. 一键运行自动化录制验收

该脚本会按顺序执行：

1. 校验/安装 Playwright Chromium；
2. 重置 Docker 依赖并跑第一阶段 API E2E；
3. 在 `/tmp/pandawiki-frontend-build-<uid>` 隔离构建 `web/admin`；
4. 启动 `http://127.0.0.1:5173` Admin 静态代理；
5. 运行 Playwright UI 验收并生成截图、trace、视频。

```powershell
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/run_ui_record_e2e_wsl.sh"
```

### 4.1 启动人工预览环境

如果只想启动服务让浏览器人工访问，不需要重新跑 UI 录制，可以执行：

```powershell
wsl -d Ubuntu-22.04 -- bash -lc "cd '/mnt/d/AI WorkSpace/PandaWiki' && ./scripts/e2e/start_local_preview_wsl.sh"
```

访问地址：Admin `http://127.0.0.1:5173/login`，Wiki `http://127.0.0.1:3010/node`，账号 `admin`，密码 `PandaWiki_E2E_123456`。Windows 侧访问 MCP/API 建议使用 `http://localhost:8000/mcp`。

如需要重新安装 Playwright Linux 系统依赖：

```powershell
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_UI_INSTALL_PLAYWRIGHT_DEPS=1 /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/run_ui_record_e2e_wsl.sh"
```

## 5. 本地 E2E 服务端口

| 服务 | 地址/端口 |
| --- | --- |
| Backend API（WSL 内） | `http://127.0.0.1:8000` |
| Backend API（Windows 侧） | `http://localhost:8000` 或 `http://[::1]:8000` |
| Admin UI 验收代理 | `http://127.0.0.1:5173` |
| Wiki 站点预览 | `http://127.0.0.1:3010/node` |
| Postgres | `127.0.0.1:5432` |
| Redis | `127.0.0.1:6379` |
| NATS | `127.0.0.1:4222` |
| MinIO API | `127.0.0.1:9000` |
| MinIO Console | `127.0.0.1:9001` |
| fake RAG | `http://127.0.0.1:5050` |
| fake Caddy Admin | `/tmp/pandawiki-caddy-admin-<uid>.sock` |

## 6. 二开功能开关与回滚点

当前二开通过后端 `FeaturePolicy` 统一输出开源二开版能力，并在 E2E 中通过环境变量显式开启：

```bash
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

当前已保存的回滚点：

```powershell
git reset --hard checkpoint/first-stage-accepted-20260604-1011
```

```powershell
git reset --hard checkpoint/secondary-dev-phase2-e2e-pass-20260604-1100
```

```powershell
git reset --hard checkpoint/secondary-dev-phase3-start-20260604-continue
```

## 7. API E2E 验收项

最近一次 API 验收时间：`2026-06-04 14:10 Asia/Shanghai`

结果：`16 PASS / 0 FAIL`

已覆盖：

1. license / feature policy 返回专业版能力。
2. 超过免费版管理员数量限制。
3. 超过免费版知识库数量限制，并验证子管理员权限拆分。
4. 超过免费版 300 个文档节点限制。
5. 自定义 Prompt 读写。
6. 内容合规屏蔽词读写。
7. API Token 创建、查询、更新、删除。
8. 评论审核接口可调用。
9. 7 日统计接口权限可用。
10. 水印、内容复制保护、贡献开关、问答机器人 API、MCP Server 设置读写。
11. 文档历史版本列表/详情接口。
12. 文档历史版本恢复到草稿闭环。
13. OpenAI API 兼容接口 CORS/鉴权错误码。
14. MCP Server JSON-RPC `tools/list` / `tools/call` 与认证。
15. 访客权限控制 partial ACL。
16. 贡献提交、列表、详情、审核采纳（新增/编辑）闭环。

报告文件：

```text
reports/e2e-first-stage-report.json
```

## 8. UI 录制验收项

最近一次 UI 录制验收时间：`2026-06-04 14:10 Asia/Shanghai`

结果：`15 PASS / 0 FAIL`，并确认 `network_errors=[]`、`console_errors=[]`。

已覆盖：

1. Admin 登录与专业版状态展示。
2. 超过免费版知识库数量限制，知识库切换可见。
3. 超过免费版 300 个文档节点限制，文档列表正常展示。
4. 统计页近 7 天周期可点击。
5. 自定义 Prompt 前端读写展示。
6. 内容合规屏蔽词前端展示。
7. 评论审核设置前端可见。
8. 子管理员权限拆分前端展示。
9. API Token 前端创建并展示。
10. 水印与内容复制保护设置前端展示。
11. 问答机器人 API 设置前端展示。
12. MCP Server 设置前端展示。
13. 文档历史版本前端展示。
14. 贡献审核列表前端展示。
15. 浏览器端无 JS 异常、无 API 5xx。

报告与录制产物：

```text
reports/ui-e2e-report.json
reports/ui-e2e-screenshots/
reports/ui-e2e-trace/ui-e2e-trace.zip
reports/ui-e2e-video/page@4a48614ba0dfa4d8959629eb6b3ba026.webm
```

## 9. 前端构建验收

### Admin 构建

```powershell
cd "D:\AI WorkSpace\PandaWiki\web"
pnpm --filter panda-wiki-admin build
```

已验证通过。

### App 构建

`web/app` 使用 Next.js `output: standalone`，在当前 Windows 文件系统下直接构建曾出现 symlink `EPERM`。已改为通过 WSL/Linux 隔离目录构建验收，并补充 `postcss` 到 `web/app/package.json` 的 devDependencies，消除 Next standalone 外部依赖解析告警。

脚本默认会把 `web` 复制到 `/tmp/pandawiki-frontend-build-<uid>/web` 后构建，避免 WSL 的 `pnpm install` 覆盖当前 Windows 工作区的 `node_modules/.bin`。

```powershell
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/build_frontend_wsl.sh"
```

已验证通过。

可选参数：

```powershell
# 只构建 app，默认值
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_FRONTEND_TARGET=app /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/build_frontend_wsl.sh"

# 构建 admin。注意：在 /mnt/d 这类 Windows 挂载盘上，Vite 构建比 Windows 原生构建慢很多。
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_FRONTEND_TARGET=admin /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/build_frontend_wsl.sh"

# 构建全部
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_FRONTEND_TARGET=all /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/build_frontend_wsl.sh"

# 如确实要在当前工作区原地构建，可关闭隔离；一般不建议 Windows/WSL 混用同一个 node_modules。
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_FRONTEND_ISOLATED=0 /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/build_frontend_wsl.sh"
```

## 10. 停止/清理

只停止服务，保留 Docker 数据卷：

```powershell
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/stop_e2e_wsl.sh"
```

停止服务并删除 E2E 数据卷：

```powershell
wsl -d Ubuntu-22.04 -u root -- env PANDAWIKI_E2E_DROP_VOLUMES=1 /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/stop_e2e_wsl.sh"
```

## 11. 已修复的验收失败/风险项

- `web/app` Windows standalone 构建的 symlink `EPERM`：通过 WSL/Linux 构建脚本验收。
- Next standalone `postcss` 外部依赖告警：已在 `web/app/package.json` 增加 `postcss: 8.5.6`。
- Admin 侧 API Token、内容合规屏蔽词仍按商业版 gating 的问题：已改为专业版可用。
- 文档历史版本“还原”只覆盖正文的问题：已新增服务端恢复接口，统一恢复标题、正文、摘要、emoji/content_type 等元数据。
- MCP Server 只有配置入口的问题：已新增 `/mcp` JSON-RPC 服务端、Tool 列表/调用、口令鉴权、发布文档检索。
- OpenAI API 兼容接口 CORS 缺少 `Authorization`、错误码不标准、流式缺少 `[DONE]` 的问题：已修复。
- 运行期新增屏蔽词后 DFA 未初始化导致 RAG-only 检索空指针的问题：已增加兜底初始化。
- Go 本地迁移相对路径问题：E2E 脚本从 `backend/store/pg` 启动迁移和 API，匹配当前源码中的 `file://migration`。
- 统计页空数据时浏览器报 `Cannot read properties of null (reading 'sort')`：已修复后端空切片返回与前端空值兼容，UI 录制复验无 JS 异常。
- 文档数 UI 录制期望固定 `301`：贡献审核会新增文档，已改为校验 `>=301`，避免新增功能影响旧验收。
- 水印/MCP 等输入值不出现在 `body.innerText`：UI 录制已改为读取输入框 value，避免误报。
- 文档历史版本与编辑页历史入口残留商业版判断：已切换为 `allow_doc_history` 功能开关。
- 问答机器人 API、内容复制保护前端残留商业版遮罩：已切换为对应功能开关。
- Node 权限编辑在部分字段缺省时可能误触发空指针：已增加安全处理。
- E2E fake Caddy Socket 使用固定 `/tmp` 路径时跨用户残留会导致清理失败：已改为按 UID 隔离的 `/tmp/pandawiki-caddy-admin-<uid>.sock`，并容错清理。
- E2E 前端隔离构建目录使用固定 `/tmp/pandawiki-frontend-build` 时跨用户残留会导致清理失败：已改为按 UID 隔离的 `/tmp/pandawiki-frontend-build-<uid>`。
- OpenAI API / MCP RAG 检索默认机器人认证按 source_type 全局匹配可能跨知识库串权：已优先按 `kb_id + source_type` 解析，保留旧数据兼容兜底。
