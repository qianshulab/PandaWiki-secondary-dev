# PandaWiki 二开版本迭代记录


## 2026-06-09 - 前台文档贡献编辑入口修复

### 变更内容

- 修复 Wiki 前台文档贡献入口打开 `/editor` 或 `/editor/{文档ID}` 时，在配置了路径前缀的访问场景下可能命中 Next.js 未匹配路由，出现 `404 Not Found` 或 `500` 的问题。
- 将前台编辑器页面加入 App 端 Proxy 匹配范围，确保子路径访问时会先剥离 Wiki basePath，再进入真实编辑器路由。
- 同步补齐前台独立反馈页 `/feedback` 和 H5 问答页 `/h5-chat` 的子路径匹配，避免同类漏配。
- 不改变文档内容、贡献提交接口、后台配置和现有 Wiki 访问地址生成逻辑。

### 验收命令

- `cd web/app && pnpm build`

## 2026-06-09 - Markdown 附件压缩包导入

### 变更内容

- 离线文件导入支持上传 `.zip` 格式的 Markdown 附件压缩包。
- 自动识别压缩包内的 Markdown 文件、图片和附件目录，上传被引用的附件并把 Markdown 中的相对路径替换为 `/static-file/...` 访问地址。
- 兼容中文文件名、中文目录名和常见 Windows 压缩包文件名编码。
- 保留原有单文件导入、平台压缩包导入和 anydoc 转换链路，不改变既有导入类型行为。

### 验收命令

- `cd web/admin && pnpm build`

## 2026-06-09 - 外网 Wiki 访问域名选择优化

### 变更内容

- 后台“访问 Wiki 网站”按钮增加外网域名场景判断：后台通过域名访问时，优先打开门户网站中配置的“外网 Wiki 访问域名”。
- 后台通过内网 IP、localhost 或 IPv6 地址访问时，继续按服务监听配置生成访问地址，不影响原有内网使用方式。
- 服务监听方式、端口、证书、Caddy/Nginx 发布逻辑均保持不变，仅调整后台跳转地址选择逻辑。

### 验收命令

- `cd web/admin && pnpm build`

## 2026-06-09 - 智能问答回答版权信息生效修复

### 变更内容

- 修复 Wiki 前台智能问答在回答后仍显示默认 AI 生成提示，未优先读取“智能问答版权信息”配置的问题。
- 前台问答弹窗、网页挂件和 H5 问答页统一按自定义版权配置展示回答后的版权/提示文案。
- 当版权信息设置为隐藏时，回答后的版权/提示文案同步隐藏。
- 保留原“免责声明”配置作为兼容回退：未填写自定义版权文字时继续使用原免责声明内容。

### 验收命令

- `cd web/app && pnpm build`

## 2026-06-06 - 生产后台刷新异常修复

### 变更内容

- 修复 Admin 生产镜像中构建产物权限过窄，导致 Nginx worker 读取 `/panda-wiki.css`、`/logo.png`、`/echarts/*` 等静态资源时返回 `403 Forbidden` 的问题。
- 修复统计、问答反馈、会话列表等页面读取访问 IP 归属地时，`ip2region` 查询在特定公网 IP 上 panic，进而导致后台接口返回 `502 Bad Gateway` 的问题。
- IP 归属地查询增加串行保护与 panic 兜底，异常 IP 只降级为“未知地址”，不再影响业务接口。

### 验收命令

- `cd backend && go test ./store/ipdb ./repo/ipdb ./usecase ./handler/v1 ./repo/pg`

## 2026-06-05 - Wiki 默认问题触发问答修复

### 变更内容

- Wiki 前台 Banner 热门问题、问题卡片、Header 搜索触发 AI 问答时，改为通过前台全局待提问状态传递问题，不再依赖 `sessionStorage` 触发首次提问。
- 兼容旧的 `sessionStorage` / URL `ask` 入口，避免影响已有链接唤起问答。
- 问答弹窗和网页挂件内的默认推荐问题点击统一做空值过滤、清理候选态，并以新会话方式发起提问。

### 验收命令

- `cd web/app && pnpm build`

## 2026-06-05 - 前台样式个性化保存一致性修复

### 变更内容

- 修复前台网站样式个性化弹窗中，文本类配置使用防抖更新预览数据时，用户立即点击保存可能提交旧预览数据的问题。
- 保存前会强制刷新未落库的预览配置，再按最新配置提交。
- 切换编辑组件或关闭配置面板前会刷新待提交预览数据，避免最后一次输入被防抖取消。
- 门户网站设置页本地状态更新改为函数式合并，避免多个设置卡片连续保存时互相覆盖本地缓存。

### 验收命令

- `cd web/admin && pnpm build`

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
