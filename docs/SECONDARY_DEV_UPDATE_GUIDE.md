# PandaWiki 二开版更新与回滚手册

更新时间：2026-06-05  
适用范围：`secondary-dev-analysis` 分支、Docker Compose 生产部署、绿联 NAS / 普通 Linux 服务器部署。

本文档用于规范二开版本的后续更新、备份、验证和回滚流程。生产环境更新应优先使用本文档流程。

---

## 1. 与官方升级流程的对应关系

PandaWiki 官方升级文档的核心流程是：

1. 升级前可先备份数据；
2. 备份时先停止服务，再复制整个安装目录，随后重新启动；
3. 使用 `root` 权限执行官方管理脚本；
4. 在脚本菜单中选择“升级”；
5. 升级过程中服务会短暂中断。

二开版本保持相同的运维思路，但升级入口不同：

| 项目 | 官方版本 | 二开版本 |
| --- | --- | --- |
| 代码 / 镜像来源 | 官方发布镜像 | 当前二开源码本地构建 |
| 更新入口 | 官方远程 `manager.sh` | 当前项目根目录 `manager.sh` |
| 数据目录 | 安装目录下的数据目录 | `deploy/production/data/` |
| 配置文件 | 安装目录 `.env` | `deploy/production/.env` |
| Compose 拓扑 | 官方生产 Compose | 与官方生产 Compose 对齐，应用服务改为本地构建 |

> 二开部署不要使用官方远程升级命令覆盖更新，否则会切回官方发布镜像，二开功能不会保留。

---

## 2. 更新原则

1. **先备份，再更新。** 生产环境每次更新前至少备份 `.env`、`deploy/production/data/` 和当前 Git commit。
2. **只更新代码和镜像，不重置生产密钥。** 已上线环境不要随意重新生成 `.env`，否则数据库、对象存储、NATS、Qdrant 等密码可能与已有数据不匹配。
3. **不删除数据卷。** 不执行 `docker compose down -v`，不手动删除 `deploy/production/data/`。
4. **优先快进更新。** 使用 `git pull --ff-only`，避免生产环境出现未确认的合并提交。
5. **更新后必须验收。** 至少检查容器状态、后台登录、知识库、Wiki 站点访问、模型配置、搜索 / 问答、关键二开功能。

---

## 3. 更新前检查

进入安装目录：

```bash
cd /volume1/docker/pandawiki
```

普通 Linux 服务器如果安装目录不同，请替换为实际目录。

检查当前版本：

```bash
git branch --show-current
git rev-parse --short HEAD
git status --short
```

检查 Docker / Compose：

```bash
docker version
docker compose version || docker-compose version
```

检查磁盘空间：

```bash
df -h .
```

查看服务状态：

```bash
sudo bash manager.sh status
```

如果 `git status --short` 有输出，需要先判断是否为生产环境手工改动：

- 如果只是临时改动且不需要保留，先还原；
- 如果是需要保留的本地改动，先提交到分支或备份补丁；
- 不建议在工作区有未确认改动时直接更新。

常见还原命令：

```bash
git checkout -- backend/Dockerfile.api backend/Dockerfile.consumer
```

如需保存本地改动补丁：

```bash
git diff > /volume1/docker/pandawiki-local-changes.$(date +%Y%m%d-%H%M%S).patch
```

---

## 4. 标准更新流程

### 4.1 创建更新备份

创建备份目录：

```bash
mkdir -p /volume1/docker/pandawiki-backups
```

记录当前版本：

```bash
git rev-parse HEAD > /volume1/docker/pandawiki-backups/git-commit.before-update.$(date +%Y%m%d-%H%M%S).txt
```

停止服务：

```bash
sudo bash manager.sh stop
```

备份生产配置：

```bash
cp deploy/production/.env /volume1/docker/pandawiki-backups/.env.before-update.$(date +%Y%m%d-%H%M%S)
```

备份生产数据：

```bash
tar -czf /volume1/docker/pandawiki-backups/data.before-update.$(date +%Y%m%d-%H%M%S).tar.gz -C deploy/production data
```

### 4.2 拉取二开版本代码

```bash
git fetch origin secondary-dev-analysis
git merge --ff-only FETCH_HEAD
```

确认更新后的版本：

```bash
git rev-parse --short HEAD
```

### 4.3 重建并启动

```bash
sudo bash manager.sh install
```

`manager.sh install` 会使用当前源码重新构建二开的 `nginx`、`app`、`api`、`consumer` 服务，并启动整套生产服务。

也可以使用菜单式更新：

```bash
sudo bash manager.sh update
```

`manager.sh update` 会提示是否执行 `git pull --ff-only`，确认后会重新构建并启动服务。

---

## 5. 快速更新流程

适用于已经完成备份、且确认工作区干净的场景：

```bash
cd /volume1/docker/pandawiki
git status --short
sudo bash manager.sh update
```

当脚本询问是否拉取最新代码时，输入 `y`。

快速流程仍然会重建应用服务镜像。更新期间后台和 Wiki 站点可能短暂不可用。

---

## 6. 更新后验收

### 6.1 容器状态

```bash
sudo bash manager.sh status
```

所有核心服务应处于运行状态，重点关注：

- `panda-wiki-nginx`
- `panda-wiki-app`
- `panda-wiki-api`
- `panda-wiki-consumer`
- `panda-wiki-postgres`
- `panda-wiki-caddy`
- `panda-wiki-qdrant`
- `panda-wiki-raglite`

### 6.2 日志检查

```bash
sudo bash manager.sh logs api
sudo bash manager.sh logs consumer
sudo bash manager.sh logs nginx
sudo bash manager.sh logs app
```

最近日志中不应持续出现启动失败、数据库连接失败、Caddy 配置加载失败、RAG 服务连接失败等错误。

### 6.3 后台访问

默认后台地址：

```text
https://服务器IP:2443
```

检查项：

- `admin` 账号可以登录；
- 原有知识库仍存在；
- 系统设置可以正常保存；
- 模型配置仍保留；
- 文档列表、编辑器、发布页可以正常打开；
- 统计页可正常切换近 24 小时、近 7 天、近 30 天、近 90 天。

### 6.4 Wiki 站点访问

在后台进入目标知识库，点击访问 Wiki 站点，或直接访问创建 Wiki 时配置的域名 / IP / 端口。

检查项：

- 首页可以打开；
- 文档详情页可以打开；
- 站点设置、版权、水印、访问控制等配置按预期生效；
- AI 搜索 / AI 问答可以正常返回；
- OpenAI 兼容问答 API、MCP Server、API Token 等二开功能按需验证。

### 6.5 版本记录

建议每次生产更新后记录：

```text
更新时间：
更新前 commit：
更新后 commit：
执行人：
备份文件：
验证结果：
异常记录：
```

---

## 7. 回滚流程

如果更新后出现无法接受的问题，按更新前备份回滚。

### 7.1 停止当前服务

```bash
cd /volume1/docker/pandawiki
sudo bash manager.sh stop
```

### 7.2 回滚代码

查看更新前记录的 commit：

```bash
cat /volume1/docker/pandawiki-backups/git-commit.before-update.*.txt
```

切回指定版本：

```bash
git reset --hard <更新前commit>
```

### 7.3 恢复配置和数据

移动当前数据目录：

```bash
mv deploy/production/data deploy/production/data.bad.$(date +%Y%m%d-%H%M%S)
```

恢复备份数据：

```bash
tar -xzf /volume1/docker/pandawiki-backups/data.before-update.YYYYMMDD-HHMMSS.tar.gz -C deploy/production
```

恢复 `.env`：

```bash
cp /volume1/docker/pandawiki-backups/.env.before-update.YYYYMMDD-HHMMSS deploy/production/.env
```

### 7.4 重建并启动旧版本

```bash
sudo bash manager.sh install
sudo bash manager.sh status
```

回滚后按“更新后验收”重新检查。

> 如果新版本已经执行了数据库迁移，回滚代码时必须同时恢复更新前的数据备份，避免旧代码读取新结构数据导致异常。

---

## 8. 只重启、不更新

配置未变更、代码未变更时，只需要重启：

```bash
sudo bash manager.sh restart
```

只重启单个服务：

```bash
cd deploy/production
docker compose restart api
docker compose restart nginx
```

---

## 9. 重新生成配置的限制

已有数据的生产环境不建议执行：

```bash
sudo bash manager.sh config
sudo bash manager.sh config-auto
```

这两个命令会重新生成或调整 `deploy/production/.env`。如果确实需要轮换密码，应先制定数据库、对象存储、NATS、Qdrant、Redis 等组件的完整密码轮换方案，并安排停机窗口。

---

## 10. 发布方版本维护流程

二开版本发布前建议执行以下流程：

1. 从官方仓库同步最新代码到独立集成分支；
2. 保留二开功能补丁，处理冲突；
3. 对比官方生产 Compose，确认除应用服务本地构建外，服务拓扑、网络、数据目录、环境变量字段仍保持一致；
4. 更新 `docs/CHANGELOG_SECONDARY_DEV.md`；
5. 执行后端测试、前端构建、生产 Compose 构建；
6. 创建 Git tag 或记录发布 commit；
7. 推送到二开仓库；
8. 在生产环境按本文档更新。

官方生产 Compose 对比参考：

```bash
curl -fsSL https://release.baizhi.cloud/panda-wiki/docker-compose.yml -o /tmp/pandawiki-official-compose.yml
diff -u /tmp/pandawiki-official-compose.yml deploy/production/docker-compose.yml
```

对比时允许的差异：

- 官方应用镜像改为当前二开源码 `build`；
- 构建参数中包含适配源码构建的 Go 模块代理配置；
- 其他基础服务、数据目录、网络和 Caddy 管理方式应保持一致。

---

## 11. 常见问题

### 11.1 `git pull` 提示本地文件会被覆盖

先查看改动：

```bash
git status --short
git diff
```

如果确认不需要保留本地改动：

```bash
git checkout -- <文件路径>
git pull --ff-only origin secondary-dev-analysis
```

如果需要保留：

```bash
git diff > /volume1/docker/pandawiki-local-changes.$(date +%Y%m%d-%H%M%S).patch
git checkout -- <文件路径>
git pull --ff-only origin secondary-dev-analysis
```

### 11.2 构建时访问 Docker Hub 或 Go 模块超时

这是服务器网络到外部镜像仓库或模块代理不稳定导致。处理顺序：

1. 确认 Docker 镜像加速器配置；
2. 重新执行 `sudo bash manager.sh install`；
3. 如仍失败，检查 NAS / 服务器 DNS、代理、防火墙和外网连通性。

二开版源码构建默认使用国内 Go 模块代理：

```text
GOPROXY=https://goproxy.cn,direct
GOSUMDB=sum.golang.google.cn
```

### 11.3 更新后后台密码是否变化

正常更新不会改变后台密码。后台密码来自 `deploy/production/.env` 中的 `ADMIN_PASSWORD`。只要不重新生成 `.env`，密码不会变化。

### 11.4 更新后 API Key 是否会被打包

不会。模型 API Key、站点配置、知识库数据存储在生产数据和数据库中，不写入 Git 仓库，也不会被镜像构建打包到代码仓库。

---

## 12. 参考来源

- PandaWiki 官方安装文档：<https://pandawiki.docs.baizhi.cloud/node/01971602-bb4e-7c90-99df-6d3c38cfd6d5>
- PandaWiki 官方升级文档：<https://pandawiki.docs.baizhi.cloud/node/01971611-965d-7e4f-acc6-19f63570af1e>
- PandaWiki 官方生产 Compose：<https://release.baizhi.cloud/panda-wiki/docker-compose.yml>

