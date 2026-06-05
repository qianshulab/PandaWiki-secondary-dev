# 绿联 NAS 最保险部署 PandaWiki 二开版指南

更新时间：2026-06-05

本文面向绿联 NAS / UGOS / UGOS Pro 环境，目标是：**尽量不改 NAS 系统环境，只在 PandaWiki 项目目录内完成部署、备份、更新和回滚**。

> 核心原则：除了 Docker 已有能力外，不在 NAS 上随意安装系统包、不修改系统源、不重装 Docker、不改全局 Docker 配置。

---

## 1. 推荐部署方式

推荐优先级：

1. **SSH + `manager.sh` 部署**：最稳，适合首次安装和后续更新；
2. **SSH 生成 `.env` + 绿联 Docker 图形界面导入 Compose**：可选，适合想尽量用图形界面管理；
3. **图形界面逐个容器创建**：不推荐，PandaWiki 是多容器系统，容易配错网络、环境变量和挂载目录。

---

## 2. 部署前准备

### 2.1 在绿联后台开启能力

在 UGOS / UGOS Pro 后台确认：

- 已安装并启用 Docker；
- 已开启 SSH；
- NAS 有固定内网 IP，例如：`192.168.1.50`；
- NAS 可访问互联网或已配置可信镜像源；
- 磁盘剩余空间建议至少 40GB。

### 2.2 SSH 登录 NAS

在电脑终端连接：

```bash
ssh 你的NAS用户名@NAS-IP
```

切换 root：

```bash
sudo -i
```

### 2.3 只做检查，不改系统

执行：

```bash
uname -m
docker version
docker compose version || docker-compose version
```

要求：

```text
CPU 架构：x86_64 或 aarch64
Docker：20.10.14+
Docker Compose：2.0.0+
```

如果 Docker / Compose 不满足要求，建议优先在绿联后台或官方 Docker 应用里处理，不建议直接在 NAS 上随意执行 `yum install`、`apt install`、`curl get.docker.com` 等系统级操作。

---

## 3. 放置项目目录

建议把项目放在 NAS 的 Docker 数据目录下，例如：

```bash
mkdir -p /volume1/docker
cd /volume1/docker
```

如果你的绿联 NAS 实际共享目录不是 `/volume1/docker`，例如 `/volume2/docker` 或其他路径，请以下文命令中的 `/volume1/docker` 为模板，整体替换成你的真实 Docker 数据目录。

拉取项目：

```bash
git clone -b secondary-dev-analysis https://github.com/qianshulab/PandaWiki-secondary-dev.git pandawiki
cd /volume1/docker/pandawiki
```

如果 NAS 没有 git，可以在电脑下载项目压缩包后上传并解压到：

```text
/volume1/docker/pandawiki
```

目录结构应类似：

```text
/volume1/docker/pandawiki/
  backend/
  web/
  deploy/production/docker-compose.yml
  manager.sh
  scripts/setup_production.sh
```

---

## 4. 最保险首次部署流程

### 4.1 先只生成配置，不启动服务

这一步只会在项目目录内生成：

```text
deploy/production/.env
```

执行：

```bash
cd /volume1/docker/pandawiki
sudo bash scripts/setup_production.sh --auto --no-start
```

查看配置：

```bash
cat deploy/production/.env
```

重点记录：

```text
ADMIN_PASSWORD=xxxx
ADMIN_PORT=2443
```

如果 `2443` 端口被占用，可以修改：

```bash
vi deploy/production/.env
```

例如改为：

```text
ADMIN_PORT=2444
```

### 4.2 备份初始配置

```bash
cp deploy/production/.env deploy/production/.env.init.$(date +%Y%m%d-%H%M%S)
```

### 4.3 启动服务

```bash
sudo bash manager.sh install
```

安装完成后会输出：

```text
SUCCESS  控制台信息:
SUCCESS    访问地址(内网): https://NAS-IP:2443
SUCCESS    访问地址(外网): https://NAS-IP:2443
SUCCESS    用户名: admin
SUCCESS    密码: xxxxxxxx
```

访问后台：

```text
https://NAS-IP:2443
```

浏览器提示证书风险时，选择继续访问即可。

---

## 5. 状态检查与日志

查看容器状态：

```bash
cd /volume1/docker/pandawiki
sudo bash manager.sh status
```

查看全部日志：

```bash
sudo bash manager.sh logs
```

查看某个服务日志：

```bash
sudo bash manager.sh logs api
sudo bash manager.sh logs nginx
sudo bash manager.sh logs app
```

也可以直接使用 Compose：

```bash
cd /volume1/docker/pandawiki/deploy/production
docker compose ps
docker compose logs -f api
```

---

## 6. 数据目录说明

最重要的两个位置：

```text
/volume1/docker/pandawiki/deploy/production/.env
/volume1/docker/pandawiki/deploy/production/data/
```

说明：

- `.env`：保存后台密码、数据库密码、对象存储密码等；
- `data/`：保存数据库、对象存储、向量库、Caddy/Nginx 数据等。

不要删除：

```text
deploy/production/data/
```

否则会丢失生产数据。

---

## 7. 备份流程

### 7.1 停机备份，最稳

```bash
cd /volume1/docker/pandawiki
sudo bash manager.sh stop
```

创建备份目录：

```bash
mkdir -p /volume1/docker/pandawiki-backups
```

备份 `.env`：

```bash
cp deploy/production/.env /volume1/docker/pandawiki-backups/.env.$(date +%Y%m%d-%H%M%S)
```

备份数据目录：

```bash
tar -czf /volume1/docker/pandawiki-backups/data.$(date +%Y%m%d-%H%M%S).tar.gz -C deploy/production data
```

备份当前代码版本号：

```bash
git rev-parse HEAD > /volume1/docker/pandawiki-backups/git-commit.$(date +%Y%m%d-%H%M%S).txt
```

备份后重新启动：

```bash
sudo bash manager.sh install
```

### 7.2 在线备份，非最稳但可用

如果不想停机，也可以直接备份：

```bash
cd /volume1/docker/pandawiki
mkdir -p /volume1/docker/pandawiki-backups
cp deploy/production/.env /volume1/docker/pandawiki-backups/.env.$(date +%Y%m%d-%H%M%S)
tar -czf /volume1/docker/pandawiki-backups/data.$(date +%Y%m%d-%H%M%S).tar.gz -C deploy/production data
```

但数据库运行中备份一致性不如停机备份。

---

## 8. 更新流程

### 8.1 更新前必须备份

```bash
cd /volume1/docker/pandawiki
sudo bash manager.sh stop
mkdir -p /volume1/docker/pandawiki-backups
cp deploy/production/.env /volume1/docker/pandawiki-backups/.env.before-update.$(date +%Y%m%d-%H%M%S)
tar -czf /volume1/docker/pandawiki-backups/data.before-update.$(date +%Y%m%d-%H%M%S).tar.gz -C deploy/production data
git rev-parse HEAD > /volume1/docker/pandawiki-backups/git-commit.before-update.$(date +%Y%m%d-%H%M%S).txt
```

### 8.2 拉取新版本

```bash
git pull origin secondary-dev-analysis
```

### 8.3 重建并启动

```bash
sudo bash manager.sh install
```

或：

```bash
sudo bash manager.sh update
```

### 8.4 更新后验证

```bash
sudo bash manager.sh status
sudo bash manager.sh logs api
```

访问：

```text
https://NAS-IP:2443
```

确认：

- 后台可登录；
- 原有知识库存在；
- Wiki 站点可访问；
- 模型配置仍在；
- 文档导入 / 搜索 / 问答功能正常。

---

## 9. 回滚流程

如果更新后异常，按下面回滚。

### 9.1 停止服务

```bash
cd /volume1/docker/pandawiki
sudo bash manager.sh stop
```

### 9.2 回滚代码

查看备份的旧 commit：

```bash
cat /volume1/docker/pandawiki-backups/git-commit.before-update.*.txt
```

切回旧版本，例如：

```bash
git checkout <旧commit>
```

### 9.3 恢复数据

先移走当前数据目录：

```bash
mv deploy/production/data deploy/production/data.bad.$(date +%Y%m%d-%H%M%S)
```

恢复备份：

```bash
tar -xzf /volume1/docker/pandawiki-backups/data.before-update.YYYYMMDD-HHMMSS.tar.gz -C deploy/production
```

恢复 `.env`：

```bash
cp /volume1/docker/pandawiki-backups/.env.before-update.YYYYMMDD-HHMMSS deploy/production/.env
```

### 9.4 重新启动

```bash
sudo bash manager.sh install
```

验证：

```bash
sudo bash manager.sh status
sudo bash manager.sh logs api
```

---

## 10. 图形化 Docker 界面部署方式，可选

如果你担心 SSH 启动服务，可以采用折中方式：

1. SSH 只生成 `.env`：

```bash
cd /volume1/docker/pandawiki
sudo bash scripts/setup_production.sh --auto --no-start
```

2. 打开绿联 Docker 图形界面；
3. 进入“项目 / Compose / 创建项目”；
4. 选择 Compose 文件：

```text
/volume1/docker/pandawiki/deploy/production/docker-compose.yml
```

5. 项目目录 / 工作目录选择：

```text
/volume1/docker/pandawiki/deploy/production
```

6. 确保 `.env` 文件同目录存在：

```text
/volume1/docker/pandawiki/deploy/production/.env
```

注意：图形界面必须支持本地 `build.context`，因为二开版需要构建：

```text
../../backend
../../web
```

如果图形界面不支持本地构建，请改用 SSH 的 `manager.sh install`。

---

## 11. 不建议执行的操作

为避免影响 NAS 环境，不建议随意执行：

```bash
yum install docker-compose
apt install docker-compose
curl -fsSL https://get.docker.com | sh
systemctl restart docker
修改 /etc/docker/daemon.json
删除 deploy/production/data
```

除非你确认自己知道这些操作的影响。

---

## 12. 常见问题

### 12.1 Docker Hub 拉镜像超时

二开版需要构建本地源码镜像，可能会拉取基础镜像：

```text
node:22-alpine
golang:1.24.3-alpine
alpine:3.21
nginx:alpine
```

如果 NAS 访问 Docker Hub 慢，可能需要使用可信镜像源或内部镜像仓库。生产环境不建议长期依赖未知公共加速器。

### 12.2 `go mod download` 超时

如果构建 API 镜像时报类似错误：

```text
RUN go mod download
Get "https://proxy.golang.org/...": i/o timeout
```

这是 NAS 到 Go 官方模块代理 `proxy.golang.org` 网络不稳定导致的源码构建依赖下载失败，不是 PandaWiki 运行时报错。

二开版已在源码构建阶段默认使用更适合国内网络的 Go 模块代理：

```text
GOPROXY=https://goproxy.cn,direct
GOSUMDB=sum.golang.google.cn
```

如果你使用的是旧版本代码，请先更新后重试：

```bash
cd /volume1/docker/pandawiki
git pull origin secondary-dev-analysis
sudo bash manager.sh install
```

如果你的内网生产环境有自建 Go 模块代理，也可以在启动前写入 `.env` 覆盖：

```bash
cd /volume1/docker/pandawiki
cat >> deploy/production/.env <<'EOF'
GOPROXY=https://你的内部Go代理,direct
GOSUMDB=sum.golang.google.cn
EOF
sudo bash manager.sh install
```

### 12.3 端口被占用

修改：

```bash
vi deploy/production/.env
```

把：

```text
ADMIN_PORT=2443
```

改成其他端口，例如：

```text
ADMIN_PORT=2444
```

然后重启：

```bash
sudo bash manager.sh install
```

### 12.4 忘记后台密码

查看：

```bash
grep ADMIN_PASSWORD deploy/production/.env
```

账号固定为：

```text
admin
```

### 12.5 只想停服务，不删数据

```bash
sudo bash manager.sh stop
```

或：

```bash
cd deploy/production
docker compose down
```

不要加 `-v`，否则可能删除数据卷。当前部署主要使用 `deploy/production/data/` 目录保存数据，也不要手动删除该目录。

---

## 13. 参考来源

- PandaWiki 官方安装文档：<https://pandawiki.docs.baizhi.cloud/node/01971602-bb4e-7c90-99df-6d3c38cfd6d5>
- PandaWiki 官方生产 Compose 文件：<https://release.baizhi.cloud/panda-wiki/docker-compose.yml>
- 绿联 NAS Docker / Docker Compose 说明：<https://nas.ugreen.com/blogs/knowledge/docker-docker-compose-ugreen-nas>

本文档的部署命令以本项目二开版源码为准；除本地源码构建二开服务外，生产 Compose 拓扑、数据目录和运维习惯尽量贴近 PandaWiki 官方手动部署方式。

