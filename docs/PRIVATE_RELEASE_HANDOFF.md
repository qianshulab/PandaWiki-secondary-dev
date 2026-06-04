# PandaWiki 二开私有交付说明与配置参考

更新时间：2026-06-05 Asia/Shanghai

本文档用于交付当前已验收的 PandaWiki 二开版本，说明私有 GitHub 仓库、部署方式、配置项、功能入口、验收记录、回滚方式，以及如何在官方原版基础上继续调整。

## 1. 私有仓库与版本

- 私有仓库：`https://github.com/qianshulab/PandaWiki-secondary-dev`
- 交付分支：`secondary-dev-analysis`
- 当前验收提交：以私有仓库 `secondary-dev-analysis` 分支最新 HEAD 为准
- 当前验收标签：`checkpoint/remove-official-community-links-20260605`
- 上游原版远端建议保留为：`upstream=https://github.com/chaitin/PandaWiki.git`

> 注意：该仓库必须保持 `Private`。不要把二开分支推送到官方 `chaitin/PandaWiki` 或任何 Public 仓库。

## 2. 快速部署

### 2.1 克隆私有仓库

```bash
git clone https://github.com/qianshulab/PandaWiki-secondary-dev.git
cd PandaWiki-secondary-dev
git checkout secondary-dev-analysis
```

### 2.2 生产级 Docker 启动

推荐在 WSL/Linux 中执行：

```bash
docker compose -f deploy/production/docker-compose.yml up -d --build
```

当前 WSL 环境如果使用旧版 Compose：

```bash
docker-compose -f deploy/production/docker-compose.yml up -d --build
```

Windows PowerShell + WSL 示例：

```powershell
wsl -d Ubuntu-22.04 -u root -- bash -lc "cd '/mnt/d/AI WorkSpace/PandaWiki' && docker-compose -f deploy/production/docker-compose.yml up -d --build"
```

### 2.3 默认访问入口

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Admin 控制台 | `https://127.0.0.1:2443/login` | 后台管理入口，自签证书需浏览器确认继续 |
| API | `http://127.0.0.1:8000` | 后端 API 与 MCP 服务 |
| MCP | `http://127.0.0.1:8000/mcp` | JSON-RPC 2.0 MCP endpoint |
| Wiki 示例端口 | `http://127.0.0.1:8011/` | 本机生产验收中已使用的 Wiki 端口示例 |
| Wiki 自定义端口 | `http://127.0.0.1:8010-8099` | 生产 compose 已发布该范围用于本地验收 |

默认管理员：

```text
账号：admin
密码：PandaWiki_Production_Password_Replace_Me
```

生产环境务必通过环境变量覆盖默认密码：

```bash
ADMIN_PASSWORD='your-strong-password' \
JWT_SECRET='your-random-jwt-secret' \
docker compose -f deploy/production/docker-compose.yml up -d --build
```

## 3. 关键配置项

### 3.1 基础服务配置

| 配置 | 当前默认 | 说明 |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `panda-wiki-secret` | PostgreSQL 密码，生产建议修改 |
| `NATS_PASSWORD` | `panda-wiki-secret` | NATS 密码，生产建议修改 |
| `S3_SECRET_KEY` | `panda-wiki-secret` | MinIO Secret，生产建议修改 |
| `JWT_SECRET` | `panda-wiki-jwt-secret-change-me` | JWT 签名密钥，生产必须修改 |
| `ADMIN_PASSWORD` | `PandaWiki_Production_Password_Replace_Me` | 管理员密码，生产必须修改 |
| `SUBNET_PREFIX` | `172.30.0` | 生产 compose 内网静态 IP 前缀 |
| `RAG_CT_RAG_BASE_URL` | `http://172.30.0.18:5050` | API/Consumer 调用 RAGLite |
| `CADDY_API` | `/app/run/caddy-admin.sock` | API/Consumer 通过 Unix socket 同步 Wiki 路由 |

### 3.2 二开功能策略配置

默认开启专业版二开能力，由 `backend/config/feature_policy.go` 统一输出给后端和 Admin 前端。

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `FEATURE_POLICY_ENABLED` | `true` | 是否启用二开策略；设为 `false` 会回到开源版限制 |
| `FEATURE_POLICY_EDITION` | `profession` | 默认显示专业版 |
| `FEATURE_POLICY_MAX_KB` | `10` | Wiki 数量上限 |
| `FEATURE_POLICY_MAX_NODE` | `10000` | 单 Wiki 文档上限 |
| `FEATURE_POLICY_MAX_ADMIN` | `20` | 管理员上限 |
| `FEATURE_POLICY_ALLOW_CUSTOM_COPYRIGHT` | `true` | 自定义版权 |
| `FEATURE_POLICY_ALLOW_ADVANCED_BOT` | `true` | 高级机器人配置 |
| `FEATURE_POLICY_ALLOW_WATERMARK` | `true` | 页面水印 |
| `FEATURE_POLICY_ALLOW_COPY_PROTECTION` | `true` | 内容复制保护 |
| `FEATURE_POLICY_ALLOW_OPEN_AI_BOT_SETTINGS` | `true` | OpenAI 兼容问答 API |
| `FEATURE_POLICY_ALLOW_MCP_SERVER` | `true` | MCP Server |
| `FEATURE_POLICY_ALLOW_DOC_HISTORY` | `true` | 文档历史 |
| `FEATURE_POLICY_ALLOW_CONTRIBUTION` | `true` | 文档贡献 |
| `FEATURE_POLICY_ALLOW_VISITOR_PERMISSION_CONTROL` | `true` | 访客权限控制 |

示例：只关闭水印但保留 MCP：

```bash
FEATURE_POLICY_ALLOW_WATERMARK=false \
FEATURE_POLICY_ALLOW_MCP_SERVER=true \
docker compose -f deploy/production/docker-compose.yml up -d --build
```

## 4. 二开能力入口

| 能力 | Admin 入口 | 当前验收状态 |
| --- | --- | --- |
| 自定义版权 / Footer | `设置 -> 门户网站 -> 定制 Footer`、`设置 -> 门户网站 -> 智能问答版权信息` | 已显示、无商业遮罩 |
| 自定义 AI Prompt | `设置 -> 问答设置 -> 智能问答提示词` | 已显示、可编辑 |
| 高级机器人配置 | `设置 -> AI 机器人` | 已显示 |
| OpenAI 兼容问答 API | `设置 -> AI 机器人 -> 问答机器人 API` | 已显示、无商业遮罩 |
| MCP Server | `设置 -> MCP 设置` | 已显示、无商业遮罩 |
| API Token | `设置 -> 访问控制 -> API Token` | 已显示、可创建/更新/删除 |
| 页面水印 / 复制保护 | `设置 -> 安全设置` | 已显示、选项可点击、无“商业版可用”遮罩 |

## 5. 当前生产验收记录

本机生产容器已验证：

- `pandawiki-prod-api`：健康；
- `pandawiki-prod-admin`：`https://127.0.0.1:2443` 可访问；
- `pandawiki-prod-caddy`：已发布 `80/443/8010-8099`；
- `pandawiki-prod-app`：`3010` 正常；
- `pandawiki-prod-raglite` / `pandawiki-prod-qdrant` / `pandawiki-prod-crawler`：真实服务链路已启动；
- 示例 Wiki：`http://127.0.0.1:8011/` 返回 200；
- Admin 安全设置页面：`商业版可用` 数量为 0，水印/复制保护选项均未 disabled；
- Admin 资源缓存：`index.html` 已 `no-store`，避免前端容器更新后仍加载旧商业遮罩资源。
- 官方/社区外链清理：Admin 侧边栏、版本区域、新建 Wiki 默认内容、导入/机器人/MCP/访问认证配置卡片、Wiki Footer 默认资源、公共 Footer 技术支持链接均已去除官方 GitHub、官方文档、微信交流群、官方论坛、商务咨询和官方远程 Logo/Sentry 上报入口；已有 Wiki 历史配置也会在前台运行时过滤。
- 官方/社区外链生产验收脚本：`scripts/e2e/verify_no_official_links.cjs`，当前结果 `ok: true`。

机器可读验收报告：

- `reports/prod-paid-features-report.json`
- `reports/e2e-first-stage-report.json`
- `reports/ui-e2e-report.json`

## 6. 在官方原版基础上继续调整

### 6.1 推荐远端结构

```bash
git remote -v
# origin   https://github.com/qianshulab/PandaWiki-secondary-dev.git
# upstream https://github.com/chaitin/PandaWiki.git
```

若从官方原版重新开始：

```bash
git clone https://github.com/chaitin/PandaWiki.git PandaWiki-custom
cd PandaWiki-custom
git remote rename origin upstream
git remote add origin https://github.com/qianshulab/PandaWiki-secondary-dev.git
git fetch origin secondary-dev-analysis --tags
git checkout -b secondary-dev-analysis origin/secondary-dev-analysis
```

后续拉取官方更新并合并：

```bash
git fetch upstream
git checkout secondary-dev-analysis
git merge upstream/main
# 如有冲突，优先保留本二开功能策略、MCP/API Token、生产 compose、Admin Docker 构建修复。
```

### 6.2 重点二开文件区域

| 区域 | 说明 |
| --- | --- |
| `backend/config/feature_policy.go` | 二开功能策略默认值与环境变量覆盖 |
| `backend/handler/v1/license.go` / 相关 domain | License/edition/limitation 输出 |
| `backend/handler/v1/api_token.go` | API Token CRUD |
| `backend/handler/v1/mcp.go` 等 MCP 相关文件 | MCP JSON-RPC 服务端 |
| `backend/usecase/app.go` / bot auth 相关 | OpenAI API Bot、MCP 认证与 KB 绑定 |
| `web/admin/src/hooks/useVersionFeature.ts` | Admin 前端按后端 feature policy 判断功能可用性 |
| `web/admin/src/pages/setting/component/*` | 设置页各商业能力入口与遮罩控制 |
| `deploy/production/docker-compose.yml` | 生产 Docker 服务编排、端口、真实 RAG/Caddy 链路 |
| `web/admin/Dockerfile` | Admin 生产镜像内构建 dist，避免旧前端资源 |
| `web/admin/server.conf` | Admin 缓存策略与 API 代理 |

## 7. 回滚与恢复

当前关键回滚点：

```bash
git tag --list 'checkpoint/*'
```

回滚到本次 Admin 资源修复验收点：

```bash
git checkout checkpoint/admin-production-asset-cache-fix-20260604-2355
```

回滚到 Wiki 本地端口发布修复点：

```bash
git checkout checkpoint/local-wiki-port-range-20260604-2315
```

如果要恢复服务到回滚源码：

```bash
docker compose -f deploy/production/docker-compose.yml up -d --build
```

## 8. 维护注意事项

- 私有仓库不要改为 Public；
- 生产部署必须替换默认 `ADMIN_PASSWORD`、`JWT_SECRET` 和数据库/对象存储密码；
- 修改 Admin 前端后必须重新构建 Admin 镜像，不要手工拷贝旧 `dist`；
- 新增页面入口时不要重新引入官方 GitHub、微信交流群、官方论坛、官方文档、商务咨询等外链；如需帮助文档，建议使用企业自有文档地址或站内文档；
- 新增/修改 feature policy 后，应同时验证 `/api/v1/license` 输出和 Admin 页面遮罩状态；
- Wiki 自定义端口在本地验收建议使用 `8010-8099`，该范围已在生产 compose 暴露；
- MCP 当前定位为只读检索能力，不用于自动创建/发布 Wiki 文档。

