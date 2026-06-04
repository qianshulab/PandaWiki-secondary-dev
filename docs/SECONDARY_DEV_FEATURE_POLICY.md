# PandaWiki 二开功能策略说明

本文档记录当前开源二开版用于替代商业版能力限制的功能策略层，便于后续继续扩展与回滚。

## 1. 核心设计

- 后端通过 `backend/config/feature_policy.go` 定义 `FeaturePolicyConfig`。
- `middleware/feature_policy.go` 将策略写入请求上下文，替代旧商业授权判断。
- `/api/v1/license` 返回 `limitation` 字段，前端通过 `useLicensePolicyFlag` 读取精细开关。
- 默认策略为 `profession`，且本轮二开必要功能默认开启。

## 2. 当前已开放能力

| 开关 | 对应能力 |
| --- | --- |
| `allow_admin_perm` | 子管理员权限拆分 |
| `allow_custom_copyright` | 自定义版权 |
| `allow_comment_audit` | 评论审核 |
| `allow_advanced_bot` | 高级机器人设置 |
| `allow_watermark` | 水印 |
| `allow_copy_protection` | 内容复制保护 |
| `allow_open_ai_bot_settings` | 问答机器人 OpenAI API 兼容配置 |
| `allow_mcp_server` | MCP Server |
| `allow_node_stats` | 文档统计 |
| `allow_doc_history` | 文档历史版本 |
| `allow_contribution` | 用户贡献/投稿审核 |
| `allow_visitor_permission_control` | 访客权限控制 partial ACL |

## 2.1 当前已落地的高优增强

- MCP Server 已从“配置入口”补齐为 `/mcp` JSON-RPC 2.0 服务端，支持 `initialize`、`tools/list`、`tools/call`、`ping`，并支持 `X-KB-ID` / `kb_id` 定位知识库、Bearer / `X-MCP-Token` 访问口令、文档检索 Tool。
- OpenAI 兼容问答接口增强：`/share/v1/chat/completions` 支持 `Authorization` CORS、`kb_id` query 兜底、标准 HTTP 状态码错误、非流式 usage 估算、流式 `[DONE]` 结束帧。
- 文档历史版本补齐服务端恢复接口：`POST /api/pro/v1/node/release/restore`，前端“还原”改为调用该接口，避免只覆盖正文而漏掉标题/摘要/emoji 等元数据。
- 敏感词 DFA 增加运行时兜底初始化，避免运行期新增屏蔽词后问答/RAG-only 检索触发空指针。
- OpenAI API / MCP Server 机器人认证记录纳入 Bot Source，避免占用 SSO 用户额度，并支持启用时自动创建 bot auth。

## 3. 环境变量覆盖

所有开关均支持通过环境变量覆盖，例如：

```bash
FEATURE_POLICY_ALLOW_WATERMARK=false
FEATURE_POLICY_ALLOW_MCP_SERVER=true
FEATURE_POLICY_MAX_NODE=10000
```

E2E 脚本中的默认配置见 `scripts/e2e/run_e2e_wsl.sh`。

## 4. 回滚

第一阶段验收通过后的回滚点：

```powershell
git reset --hard checkpoint/first-stage-accepted-20260604-1011
```

第二阶段验收通过后的回滚点：

```powershell
git reset --hard checkpoint/secondary-dev-phase2-e2e-pass-20260604-1100
```

第三阶段开始前回滚点：

```powershell
git reset --hard checkpoint/secondary-dev-phase3-start-20260604-continue
```

## 5. 验收

完整自动化验收：

```powershell
wsl -d Ubuntu-22.04 -u root -- /bin/bash "/mnt/d/AI WorkSpace/PandaWiki/scripts/e2e/run_ui_record_e2e_wsl.sh"
```

最近一次结果：

- API：`16 PASS / 0 FAIL`
- UI 录制：`15 PASS / 0 FAIL`
- Admin 构建：通过
- App 构建：通过
- Go 编译测试：`go test ./... -run '^$'` 通过
