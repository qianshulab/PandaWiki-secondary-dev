# PandaWiki 二开版生产部署说明（官方手动部署流程对齐）

更新时间：2026-06-05 Asia/Shanghai

本部署只允许一个部署差异：官方应用镜像改为当前二开源码本地构建。除二开应用服务构建来源外，生产 `docker-compose.yml` 的服务拓扑、容器名、网络、数据目录、环境变量字段均按官方手动部署 compose 对齐。

## 1. 环境要求

与官方安装文档一致：

- 操作系统：Linux
- CPU 架构：`x86_64` / `aarch64`
- Docker：`20.10.14+`
- Docker Compose：`2.0.0+`
- 推荐配置：2 核 CPU / 4 GB 内存 / 40 GB 磁盘

检查命令：

```bash
docker version
docker compose version
```

如果没有 `docker compose`，但有 `docker-compose` 且版本号为 `2.0.0+`，部署脚本也会使用该命令。

## 2. 和官方手动安装流程的对应关系

官方手动安装流程是：

1. 创建安装目录；
2. 下载官方 `docker-compose.yml`；
3. 创建 `.env`；
4. 执行 `docker compose up -d`。

本二开版本对应为：

1. 拉取/上传当前二开项目目录；
2. 使用项目内 `deploy/production/docker-compose.yml`；
3. 首次安装自动生成 `deploy/production/.env`；
4. 执行 `docker compose up -d --build`，其中 `--build` 是为了构建当前二开源码。

## 3. 一键安装

在项目根目录执行：

```bash
sudo bash manager.sh install
```

安装完成后输出格式与官方一致：

```text
SUCCESS  控制台信息:
SUCCESS    访问地址(内网): https://服务器IP:2443
SUCCESS    访问地址(外网): https://服务器IP:2443
SUCCESS    用户名: admin
SUCCESS    密码: 自动生成的 ADMIN_PASSWORD
```

## 4. `.env` 字段

首次安装会生成：

```text
TIMEZONE=Asia/Shanghai
SUBNET_PREFIX=169.254.15
POSTGRES_PASSWORD=<随机密码>
NATS_PASSWORD=<随机密码>
JWT_SECRET=<随机密码>
S3_SECRET_KEY=<随机密码>
QDRANT_API_KEY=<随机密码>
REDIS_PASSWORD=<随机密码>
ADMIN_PASSWORD=<随机密码>
ADMIN_PORT=2443
```

如果你之前运行过旧部署脚本，`manager.sh install` 会检测既有 `.env` 是否缺少上述官方字段；如缺失，会先备份原文件为 `.env.bak.<时间戳>`，再只补齐缺失字段，不覆盖已有密码。

这些字段与官方手动安装说明保持一致。后台管理员账号固定为：

```text
admin
```

后台密码为 `.env` 中的：

```text
ADMIN_PASSWORD
```

## 5. 服务拓扑

服务名和容器名保持官方命名：

| Compose 服务 | 容器名 | 来源 |
| --- | --- | --- |
| `caddy` | `panda-wiki-caddy` | 官方镜像 |
| `nginx` | `panda-wiki-nginx` | 当前二开源码 `web/admin` 构建 |
| `app` | `panda-wiki-app` | 当前二开源码 `web/app` 构建 |
| `api` | `panda-wiki-api` | 当前二开源码 `backend` 构建 |
| `consumer` | `panda-wiki-consumer` | 当前二开源码 `backend` 构建 |
| `postgres` | `panda-wiki-postgres` | 官方镜像 |
| `redis` | `panda-wiki-redis` | 官方镜像 |
| `minio` | `panda-wiki-minio` | 官方镜像 |
| `nats` | `panda-wiki-nats` | 官方镜像 |
| `qdrant` | `panda-wiki-qdrant` | 官方镜像 |
| `crawler` | `panda-wiki-crawler` | 官方镜像 |
| `raglite` | `panda-wiki-raglite` | 官方镜像 |

数据目录与官方一致，位于：

```text
deploy/production/data/
```

## 6. 常用命令

```bash
# 查看状态
sudo bash manager.sh status

# 查看日志
sudo bash manager.sh logs
sudo bash manager.sh logs api
sudo bash manager.sh logs nginx

# 重启/停止
sudo bash manager.sh restart
sudo bash manager.sh stop

# 更新当前分支并重建
sudo bash manager.sh update

# 卸载，默认保留数据目录
sudo bash manager.sh uninstall
```

也可以直接进入生产目录执行官方风格命令：

```bash
cd deploy/production
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down
```

生产环境的标准更新、备份、验收和回滚流程请以 [二开版更新与回滚手册](SECONDARY_DEV_UPDATE_GUIDE.md) 为准。常规更新不要重新生成 `.env`，不要执行 `docker compose down -v`。

## 7. 验收检查

```bash
cd deploy/production
docker compose ps
curl -k https://127.0.0.1:${ADMIN_PORT:-2443}
docker logs panda-wiki-api --tail=100
```

后台访问：

```text
https://服务器IP:2443
```

前台 Wiki 访问方式与官方一致：在后台创建/配置 Wiki 站点后，按站点配置的域名或端口访问。

## 8. 注意事项

- 不要把 `deploy/production/.env` 提交到仓库；
- 不要随意删除 `deploy/production/data/`，这是生产数据目录；
- 如果修改 `.env` 中间件密码，通常需要同时清理旧数据或保持原有数据密码一致；
- 生产部署不再使用本地验收用 fake 服务。

## 9. 公网域名接入 CDN / EdgeOne / 边缘加速

PandaWiki 前台问答使用 `text/event-stream` 流式响应。公网域名如果接入腾讯云 EdgeOne、CDN、WAF 或其他边缘加速服务，需要把问答接口按“动态长连接”处理，否则可能出现：

- 前台提问提示 `network error`；
- 点击默认问题异常，但直接输入问题偶现正常；
- 回答中出现 `nonce is required`；
- 浏览器 Network 中 `/share/v1/chat/message` 或 `/share/v1/chat/widget` 请求被边缘节点提前断开。

推荐在边缘加速控制台增加高优先级规则：

| 路径 | 建议配置 |
| --- | --- |
| `/share/v1/chat/message` | 不缓存；允许 `POST`；允许 `text/event-stream` 流式响应；关闭页面优化、HTML 改写、响应体改写；回源响应超时设置为平台允许的较大值，建议不少于 300 秒 |
| `/share/v1/chat/widget` | 同上 |
| `/share/v1/chat/search` | 不缓存；允许 `POST` |
| `/share/v1/captcha/*` | 不缓存；允许 `POST`；不要叠加 Bot/JS 二次挑战 |
| `/share/v1/common/file/upload*` | 不缓存；允许上传请求体 |
| `/share/v1/*` | 不确定具体规则时，先统一按动态接口不缓存处理 |

同时检查：

- 回源地址、回源协议和回源端口必须指向 PandaWiki 前台站点对应的入口，不要只指向后台控制台端口；
- 不要对 `/share/v1/chat/*` 做缓存、压缩合并、页面优化、HTML 改写或响应体改写；
- WAF / Bot 管理先放行 `/share/v1/chat/*`、`/share/v1/captcha/*`，确认问答正常后再按需收紧；
- 保留 `Host`、`X-Forwarded-For`、`X-Real-IP` 等回源请求头；
- 如果 NAS / 服务器内网 IP 访问问答正常，但公网域名异常，优先排查边缘加速规则、回源超时、WAF/Bot 挑战和缓存策略。

`nonce is required` 的常见触发链路是：后端首次问答通过 SSE 返回 `conversation_id` 和 `nonce`，边缘层异常中断后前端只收到 `conversation_id`、没有收到 `nonce`，下一次续问携带了不完整会话身份，后端安全校验会拒绝该请求。二开版前台已经增加容错：只有 `conversation_id` 与 `nonce` 同时存在才续接会话；如果只存在 `conversation_id`，会自动清理会话身份并新开会话。但公网域名的 `network error` 仍需要在边缘加速层放通动态 SSE 请求。
