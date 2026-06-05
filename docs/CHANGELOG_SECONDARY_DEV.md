# PandaWiki 二开版本迭代记录

## 2026-06-05 - 更新与回滚文档规范化

### 变更内容

- 新增 [二开版更新与回滚手册](SECONDARY_DEV_UPDATE_GUIDE.md)。
- 明确二开版本升级入口为当前项目根目录 `manager.sh`，不要使用官方远程升级脚本覆盖二开部署。
- 补充生产更新前检查、停机备份、快进拉取、重建启动、更新后验收、回滚和常见问题处理流程。
- 更新 `README.md`、生产部署说明和绿联 NAS 部署指南中的更新文档入口。

### 验证要求

- 更新前必须备份 `deploy/production/.env`、`deploy/production/data/` 和当前 commit。
- 更新后必须验证后台登录、Wiki 站点访问、模型配置、搜索 / 问答和关键二开功能。

## 2026-06-05 - 统计长周期功能放开

### 变更内容

- 统计页近 7 天、近 30 天、近 90 天改为优先读取二开功能策略 `allow_node_stats`。
- 二开默认 `allow_node_stats=true` 时，不再显示商业版可用标识，不再禁用近 30 天和近 90 天。
- 后端统计接口同步按 `allow_node_stats` 放开长周期查询，并保留官方授权逻辑作为回退。

### 验收命令

- `cd backend && go test ./handler/v1 ./usecase`
- `cd web/admin && pnpm build`

## 2026-06-05 - 全量回归与文档页别名修复

### 变更内容

- 新增生产环境全量回归脚本：`scripts/e2e/verify_full_regression.cjs`。
- 修复 Admin 直访 `/doc` 时被误判为子路径 basename，导致接口走 `/doc/api/...`、版本短暂/持续显示“开源版”的问题：
  - Admin 路由增加 `/doc` 文档页别名。
  - 侧边栏把 `/doc` 识别为“文档”菜单。
  - basename 解析白名单增加 `/doc`。
- 回归脚本新增校验：
  - Admin 登录、主导航、文档/统计/贡献/问答/反馈/发布/设置页加载。
  - 专业版授权策略与必要功能开关。
  - 自定义标题设置写入、Wiki 前台生效、再自动恢复。
  - 安全设置、API Token、MCP Server、AI Prompt、高级机器人等专业版功能无遮罩。
  - Wiki 站点无 Hydration/React 关键运行时错误。
  - 官方文档/GitHub/微信群/Sentry 等官方外链无残留、无外发请求。

### 验收命令

- Admin 构建：`cd web/admin && pnpm build`
- App 构建：`cd web/app && pnpm build`
- 生产全量回归：`node scripts/e2e/verify_full_regression.cjs`
- 官方外链专项回归：`node scripts/e2e/verify_no_official_links.cjs`

## 2026-06-05 - 官方/社区外链清理

### 变更内容

- 删除 Admin 侧边栏中的官方入口：
  - 帮助文档
  - GitHub
  - 在线支持
  - 企业微信交流群二维码弹窗
  - 官方论坛跳转
- 删除版本区域对官方发布地址的在线检查：
  - 不再请求 `release.baizhi.cloud`
  - 不再显示“立即更新”和“商务咨询”官方跳转
- 清理新建 Wiki 的默认初始化内容：
  - 删除官方 GitHub、微信交流群、社区论坛按钮
  - 删除默认文档里的官方文档、Demo、交流群二维码和论坛链接
  - 删除默认 Footer 的官方产品/公司/开源协议外链
- 清理 Admin 内其他显式官方帮助链接：
  - 模型配置提示不再跳转官方文档
  - 文档导入弹窗不再显示官方“使用方法”链接
  - 访问认证、MCP、机器人配置卡片不再显示官方“使用方法”链接
  - 自动模型配置不再显示百智云 API Key 获取跳转
- 清理 Wiki 前台/预览默认官方资源：
  - Footer 默认 Logo 改为本地资源
  - 页面装修预览默认 Logo 改为本地资源
  - UI 公共 Footer 不再把 “PandaWiki” 技术支持文字链接到官方文档
  - 对已有 Wiki 数据中的历史官方按钮/Footer/FAQ/社交账号链接进行运行时过滤，避免旧库仍显示 GitHub、官方文档或交流群入口
  - 删除未使用的 GitHub/微信群二维码初始化图片
- 关闭前台官方 Sentry 上报文件，避免生产前台向官方域名发送客户端异常数据。

### 验证要求

- `web/admin/src` 与 `web/app/src` 中不再包含以下官方/社区入口：
  - `pandawiki.docs.baizhi.cloud`
  - `release.baizhi.cloud`
  - `sentry.baizhi.cloud`
  - `baizhi.cloud/consult`
  - `bbs.baizhi.cloud`
  - `qa.baizhi.cloud`
  - `github.com/chaitin/PandaWiki`
  - `微信交流群`、`企业微信交流群`、`在线支持`、`帮助文档`、`社区论坛`、`官方论坛`
- Admin 构建必须通过。
- App 构建必须通过。
- 生产容器需要重新构建 Admin/App 镜像后再验收页面，避免旧前端缓存残留。
- 生产验收脚本：`scripts/e2e/verify_no_official_links.cjs`。
