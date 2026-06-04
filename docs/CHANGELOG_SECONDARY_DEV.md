# PandaWiki 二开版本迭代记录

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

