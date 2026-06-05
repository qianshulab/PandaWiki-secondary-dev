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
