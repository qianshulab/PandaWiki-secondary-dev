# PandaWiki 开源版二开功能拆分与源码限制点分析

> 基线：`chaitin/PandaWiki`，当前提交 `43bf2d4d`（2026-06-02）。  
> 说明：本计划按 AGPL-3.0 开源版做清洁二开，不包含破解/伪造商业 License 或复制私有 `PandaWikiPro` 代码。

## 0. 本轮落地状态（已实现）

- 已新增开源二开 `feature_policy` 策略层，用配置/环境变量替代商业 License 上下文缺失导致的硬限制。
- 已默认启用“专业版级”本地策略：10 个 Wiki、单库 10000 文档、20 管理员、管理员分权、自定义版权、自定义 Prompt、评论审核、高级机器人配置、文档统计。
- 已补齐开源后端可独立实现的 Pro 兼容接口：
  - `GET/POST/DELETE /api/v1/license`
  - `GET/PUT /api/pro/v1/prompt`
  - `GET/POST /api/pro/v1/block`
  - `POST /api/pro/v1/comment_moderate`
  - `POST/GET/PATCH/DELETE /api/pro/v1/token/*`
- 已将 Wiki/文档/管理员/SSO 数量限制改为 `<=0` 表示不限，便于私有化部署按需配置。
- 已通过 `go test ./cmd/api` 与 `go test ./... -run '^$'` 编译验证；完整 `go test ./...` 因上游 `pkg/bot/discord/TestDiscord` 内置无限阻塞测试超时，非本次改动导致。

### feature_policy 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FEATURE_POLICY_ENABLED` | `true` | 是否启用二开策略；关闭后回到开源版默认限制 |
| `FEATURE_POLICY_EDITION` | `profession` | 前端识别版本：`free`/`profession`/`enterprise`/`business` 或 `0/1/2/3` |
| `FEATURE_POLICY_MAX_KB` | `10` | Wiki 数量，`0` 表示不限 |
| `FEATURE_POLICY_MAX_NODE` | `10000` | 单 Wiki 文档数量，`0` 表示不限 |
| `FEATURE_POLICY_MAX_ADMIN` | `20` | 管理员数量，`0` 表示不限 |
| `FEATURE_POLICY_MAX_SSO_USERS` | `0` | SSO 用户数量，`0` 表示不限 |
| `FEATURE_POLICY_ALLOW_*` | 见 `backend/config/feature_policy.go` | 按功能单独启停 |

## 1. 官方版本差异摘要

官网“型号对比”给出 4 个型号：开源版、专业版、商业版、企业版。开源版主要限制：

| 功能 | 开源版 | 专业/商业/企业版差异 |
| --- | --- | --- |
| Wiki 站点数量 | 1 个 | 专业/商业 10 个，企业更多 |
| 每个 Wiki 文档数量 | 300 个 | 专业/商业 10000 个，企业更多 |
| 管理员数量 | 1 个 | 专业 20，商业 50，企业更多 |
| 管理员分权 | 不支持 | 专业起支持 |
| 多语言 | 不支持 | 专业起支持 |
| 自定义版权 | 不支持 | 专业起支持 |
| 自定义 AI 提示词 | 不支持 | 专业起支持 |
| 前台编辑贡献 | 不支持 | 专业起支持 |
| 前台文档浏览量 | 不支持 | 专业起支持 |
| 评论审核 | 不支持审核 | 专业起支持审核 |
| 访问流量分析 | 基础分析 | 专业/商业高级分析 |
| SEO 配置 | 基础配置 | 专业/商业高级配置 |
| 机器人 | 基础配置 | 专业/商业高级配置 |
| MCP Server | 不支持 | 商业起支持 |
| 问答机器人 API | 不支持 | 商业起支持 |
| SSO 登录 | 不支持 | 商业 2000 用户，企业更多 |
| 访客权限控制 | 不支持 | 商业起支持 |
| 页面水印/不可复制/敏感内容过滤 | 不支持 | 商业起支持 |
| 文档历史版本管理 | 不支持 | 商业起支持 |
| API Token 调用 | 不支持 | 商业起支持 |

## 2. 源码结构与商业版边界

### 2.1 私有 Pro 子模块

- `.gitmodules` 指向 `backend/pro -> git@github.com:chaitin/PandaWikiPro.git`。
- 当前环境无法拉取该私有子模块，`git submodule update --init --recursive` 失败。
- 开源仓库包含大量 `web/*/src/request/pro/*` 生成客户端，但对应后端 `/api/pro/v1/*`、`/share/pro/v1/*` 路由多数不在开源后端中。

### 2.2 开源版限制中心

- 版本枚举：`backend/consts/license.go`
- 限制默认值：`backend/domain/license.go`
  - `MaxKb: 1`
  - `MaxAdmin: 1`
  - `MaxNode: 300`
  - 其他 Allow* 默认 false
- 前端版本功能表：`web/admin/src/constant/version.ts`
- 前端遮罩：`web/admin/src/components/VersionMask/index.tsx`

> 关键判断：很多能力并非“简单前端遮罩”，后端也有 `GetBaseEditionLimitation(ctx)` 与 `consts.GetLicenseEdition(c)` 校验；仅改前端无法完整启用。

## 3. 限制点源码映射

| 功能/限制 | 后端限制点 | 前端限制点 | 二开策略 |
| --- | --- | --- | --- |
| Wiki 数量 | `handler/v1/knowledge_base.go` 设置 `req.MaxKB`；`repo/pg/knowledge_base.go` 创建时检查 | 创建弹窗、版本表 | 引入自定义 `FeaturePolicy`，替代硬编码 license 限制 |
| 文档数量 | `handler/v1/node.go` 设置 `req.MaxNode`；`repo/pg/node.go` 检查数量 | 版本表 | 配置化最大值；保留可观测错误信息 |
| 管理员数量 | `repo/pg/user.go` 检查 `MaxAdmin` | 系统成员 UI | 配置化管理员数；明确 role/KB perm 边界 |
| 管理员分权 | `handler/v1/kb_user.go` 检查 `AllowAdminPerm` | `MemberAdd.tsx`, `AddRole.tsx` | 已有 `KBUsers.Perm` 模型，补齐 UI/策略即可 |
| 自定义版权 | `usecase/app.go` 检查/回写默认版权 | 多个 Card/Widget 页面 | 将版权设置改为可配置开源功能 |
| 评论审核 | `repo/pg/comment.go` 基于 `AllowCommentAudit` 过滤/状态 | `feedback/Comments.tsx` | 已有状态字段；补齐审核接口或复用 pro 客户端接口 |
| 高级统计 | `usecase/stat.go` 限制 7/30/90 天 | `stat/Statistic/index.tsx` | 开放统计周期并增加聚合索引/清理策略 |
| 水印/复制保护 | `usecase/app.go` 检查 `AllowWatermark`/`AllowCopyProtection` | `CardSecurity.tsx` | 后端允许保存，前台渲染已有字段可扩展 |
| OpenAI API 机器人 | `usecase/app.go` 检查 `AllowOpenAIBotSettings`；`share/chat.go` 已有 `/share/v1/chat/completions` 实现 | `CardRobotApi.tsx` | 后端已有核心 completions 逻辑，补齐密钥/开关管理接口 |
| MCP Server | `usecase/app.go` 检查 `AllowMCPServer`；迁移有 `mcp_calls` | `CardMCP.tsx` | 后端缺完整路由/服务，需实现 `/mcp` server handler |
| SSO/访客权限 | `repo/pg/auth.go`, `usecase/node.go`；基础 OAuth/GitHub 有部分逻辑 | `CardAuth.tsx`, `UserGroup` | 实现开源 SSO provider、AuthGroup 管理、节点权限组 |
| 文档历史版本 | `node_releases`, `kb_release_*`, `node_release_backup` 表已存在 | `request/pro/Node.ts`, 编辑 Header | 开源已有发布模型；补齐版本详情/列表/回滚接口 |
| API Token | `domain/api_token.go`, `repo/pg/ap_token.go`, JWT middleware 支持 token | `request/pro/ApiToken.ts` | 补齐 token CRUD 接口，接入 KB 权限 |
| 自定义 Prompt | `repo/pg/prompt.go`, `LLMUsecase` 已读取 settings prompt | `CardAI.tsx` 调 `/api/pro/v1/prompt` | 补齐开源 prompt GET/PUT 接口 |
| 敏感词过滤 | `domain.SettingBlockWords`, `BlockWordRepo`, `ChatUsecase` 已用 | `request/pro/Block.ts` | 补齐敏感词 GET/POST 接口和导入导出 |
| 前台贡献 | `domain/contribute.go`, 迁移 `contributes` 已存在 | `request/pro/Contribute.ts`, `editor` | 补齐 submit/audit/list/detail 接口，接入发布流 |
| 前台文件上传 | 普通 `/share/v1/common/file` + pro `ShareFile.ts` | 前台编辑器 | 复用现有 share upload，增加权限与审核 |

## 4. 推荐二开路线

### P0：本地开发与构建基线

1. 安装 Go 1.24.3、pnpm、Docker/Compose。
2. 先跑通后端单元/编译：`cd backend && go test ./...`。
3. 前端：`cd web && pnpm install && pnpm --filter panda-wiki-admin build && pnpm --filter panda-wiki-app build`。
4. 建议新增 `backend/domain/feature_policy.go`，把限制从 license 语义拆成“本地配置策略”。

### P1：投入小、收益高的开源增强

1. **自定义 Prompt**：补 `/api/v1/prompt` 或 `/api/community/v1/prompt`，复用 `PromptRepo`。
2. **API Token CRUD**：补 token 创建/列表/更新/删除，复用 `APITokenRepo` 和现有 JWT middleware。
3. **评论审核**：补 moderation 接口，已有 `CommentStatus`。
4. **自定义版权/水印/复制保护**：改 `AppUsecase.ValidateUpdateApp` 使用自定义策略。
5. **统计周期开放**：修改 `ValidateStatDay` 走策略，并确保数据库聚合任务正常。

### P2：中等复杂度

1. **管理员分权**：已有 KB 权限模型；补前端解锁与后端策略即可。
2. **文档历史版本**：已有发布/备份表；补版本列表、详情、恢复接口。
3. **敏感词过滤配置**：补 block words 管理接口，接入 Chat/搜索/评论。
4. **前台贡献**：补 submit/audit/list/detail 与发布流转换。

### P3：复杂/企业场景

1. **SSO + 用户组 + 节点权限组**：需要统一 session、Auth、AuthGroup、NodeAuthGroup 语义。
2. **MCP Server**：需要完整 MCP handler、鉴权、工具定义、调用审计。
3. **多语言**：需要内容模型、路由、索引、RAG 多语策略、前端切换全链路。

## 5. 合规限制处理建议

不建议做“伪造商业版 License/绕过授权”。推荐做法：

- 保留官方 AGPL 项目来源与协议；
- 将二开功能命名为 `CommunityEnhanced` 或企业自用 `InternalEdition`；
- 新增自有 `FeaturePolicy` 配置，例如：

```yaml
feature_policy:
  max_kb: 20
  max_node: 10000
  max_admin: 50
  allow_admin_perm: true
  allow_custom_copyright: true
  allow_comment_audit: true
  allow_advanced_bot: true
  allow_watermark: true
  allow_copy_protection: true
  allow_open_ai_bot_settings: true
  allow_mcp_server: false
  allow_node_stats: true
```

这样是“开源二开实现同类能力”，而不是绕过商业授权。

## 6. 建议优先实施清单

| 优先级 | 功能 | 预估 | 备注 |
| --- | --- | --- | --- |
| P0 | FeaturePolicy 配置化限制 | 0.5-1 天 | 后续所有功能基础 |
| P1 | Prompt 管理接口 | 0.5 天 | 后端已有 Repo/LLM 消费 |
| P1 | API Token CRUD | 1 天 | 后端鉴权已支持 token |
| P1 | 评论审核 | 0.5-1 天 | 数据模型已具备 |
| P1 | 自定义版权/水印/复制保护 | 1 天 | 前后端字段已有 |
| P2 | 统计高级周期 | 0.5 天 | 注意聚合数据清理 |
| P2 | 管理员分权 | 1-2 天 | 需确认 UX 与权限矩阵 |
| P2 | 文档历史版本 | 2-3 天 | 已有 release/backup 表 |
| P2 | 敏感词过滤管理 | 1 天 | 补接口和 UI |
| P3 | SSO + 用户组权限 | 4-7 天 | 涉及认证全链路 |
| P3 | MCP Server | 3-5 天 | 需实现 server handler |
| P3 | 多语言 | 1-2 周 | 数据模型和 RAG 改动大 |

## 7. 第一阶段落地与验收状态

截至 `2026-06-04 10:11 Asia/Shanghai`：

- 已完成第一阶段后端功能策略化与接口补齐：FeaturePolicy、License 状态、Prompt、屏蔽词、API Token、评论审核、统计周期、知识库/节点/管理员数量策略。
- 已修复 Admin 前端中 API Token、内容合规屏蔽词仍按商业版 gating 的问题，改为专业版能力。
- 已修复统计页空数据时可能触发的 `Cannot read properties of null (reading 'sort')` 前端异常：后端空列表统一返回 `[]`，前端同时增加空值兼容。
- 已补齐本地 Docker/WSL E2E 验收环境和脚本，详见 `docs/LOCAL_DOCKER_E2E.md`。
- API 自动化验收结果：`reports/e2e-first-stage-report.json`，`9 PASS / 0 FAIL`。
- UI 录制验收结果：`reports/ui-e2e-report.json`，`10 PASS / 0 FAIL`，`network_errors=[]`，`console_errors=[]`。
- UI 录制产物：
  - 截图：`reports/ui-e2e-screenshots/`
  - trace：`reports/ui-e2e-trace/ui-e2e-trace.zip`
  - 视频：`reports/ui-e2e-video/page@c4fe3a3cb26591878c228393447fb444.webm`
- 构建验收：
  - `backend`: `go test ./... -run '^$'` 通过。
  - `web/admin`: 通过 WSL 隔离构建脚本 `PANDAWIKI_FRONTEND_TARGET=admin scripts/e2e/build_frontend_wsl.sh` 通过，并已在 UI 录制验收中使用该构建产物。
  - `web/app`: 通过 WSL 隔离构建脚本 `scripts/e2e/build_frontend_wsl.sh` 通过。

## 8. 后续阶段落地与验收状态

截至 `2026-06-04 14:10 Asia/Shanghai`：

- 第二阶段已补齐并验收：水印、内容复制保护、OpenAI API Bot 设置、MCP Server 设置、文档历史版本列表/详情、前台贡献投稿/后台审核、访客 partial ACL。
- 第三阶段本轮已补齐高优能力：
  - MCP Server `/mcp` JSON-RPC 2.0 服务端：`initialize`、`tools/list`、`tools/call`、`ping`，支持口令鉴权和发布文档检索。
  - OpenAI API 兼容增强：Authorization CORS、HTTP 错误码、`kb_id` query 兜底、usage 估算、流式 `[DONE]`。
  - 文档历史版本恢复：新增 `POST /api/pro/v1/node/release/restore`，前端“还原”接入服务端恢复，避免元数据遗漏。
  - 屏蔽词 DFA 运行时兜底初始化，修复新增屏蔽词后 RAG-only 检索可能空指针的问题。
  - OpenAI API / MCP Server bot auth 纳入机器人认证源，避免占用 SSO 用户额度，并优先按 `kb_id + source_type` 解析机器人身份，避免多知识库串权。
- API 自动化验收结果：`reports/e2e-first-stage-report.json`，`16 PASS / 0 FAIL`。
- UI 录制验收结果：`reports/ui-e2e-report.json`，`15 PASS / 0 FAIL`，`network_errors=[]`，`console_errors=[]`。
- E2E 稳定性：fake Caddy Admin Socket 与前端隔离构建目录均已按 UID 隔离并容错清理，避免 WSL 跨用户残留导致复验失败。
- 构建验收：
  - `backend`: `go test ./... -run '^$'` 通过。
  - `web/admin`: 在 UI 录制验收前隔离构建通过。
  - `web/app`: `scripts/e2e/build_frontend_wsl.sh` 通过。
- 回滚点：
  - `checkpoint/secondary-dev-phase2-e2e-pass-20260604-1100`
  - `checkpoint/secondary-dev-phase3-start-20260604-continue`
