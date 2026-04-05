# 生产部署指南

本文档介绍如何将 TokenSee 完整部署到 Linux 生产服务器，包括后端 API、前端、PostgreSQL 和 Redis。

---

## 一、服务器准备

### 1.1 推荐配置

| 配置项 | 推荐规格 | 说明 |
|---|---|---|
| **操作系统** | Ubuntu 22.04 LTS (amd64) | 其他主流 Linux 发行版亦可 |
| **CPU** | 2 核或以上 | 7 条链扫描需要一定算力 |
| **内存** | 4 GB 以上 | PostgreSQL + Redis + Node.js |
| **磁盘** | 40 GB 以上 SSD | 链上数据会持续增长 |
| **公网 IP** | 必需 | 或通过 Cloudflare 等代理 |

### 1.2 域名与 DNS

建议为服务配置域名：

```
API 服务:    api.yourdomain.com  →  服务器公网 IP:8080
前端:        yourdomain.com      →  服务器公网 IP:8081
```

在域名服务商添加 A 记录解析。

### 1.3 系统准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git unzip ufw fail2ban
```

---

## 二、安装运行时依赖

### 2.1 Node.js ≥ 20

推荐使用 nvm 管理 Node.js 版本：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安装并使用 Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node -v   # 应显示 v20.x.x
npm -v
```

### 2.2 Docker + Docker Compose

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker

# 安装 Docker Compose (独立二进制)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker --version
docker-compose --version
```

将当前用户加入 docker 组（避免每次 sudo）：

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2.3 PM2（Node.js 进程管理）

```bash
# 全局安装 PM2
npm install -g pm2

# 验证
pm2 --version
```

---

## 三、获取项目代码

### 3.1 方式一：从 GitHub 拉取

```bash
# 克隆项目（替换为你的仓库地址）
git clone https://github.com/your-username/tokensee.git /opt/tokensee
cd /opt/tokensee
```

### 3.2 方式二：从本机上传

```bash
# 在本地打包（项目根目录执行）
tar -czvf tokensee.tar.gz \
  --exclude='node_modules' \
  --exclude='web/node_modules' \
  --exclude='.git' \
  --exclude='web/.next' \
  --exclude='dist' \
  .

# 上传到服务器（本地执行）
scp tokensee.tar.gz user@your-server:/opt/

# 在服务器解压
ssh user@your-server
tar -xzvf /opt/tokensee.tar.gz -C /opt/tokensee
```

---

## 四、配置生产环境

### 4.1 创建生产环境配置文件

在项目根目录创建 `.env.production`：

```bash
cp .env.example .env.production
```

### 4.2 环境变量详解

以下是需要重点配置的生产参数：

```bash
# ──────────────────────────────────────────────
# 基础配置
# ──────────────────────────────────────────────
NODE_ENV=production
PORT=8080

# 允许前端域名（生产环境务必配置，否则 CORS 会拒绝请求）
FRONTEND_URL=https://yourdomain.com

# 生产环境强制要求 API Key 认证
# 在 development 下默认不强制，这里保持默认即可
# API Key 相关逻辑见 src/api/middleware/apiKey.ts

# ──────────────────────────────────────────────
# 数据库（PostgreSQL — Docker 部署时自动配置）
# ──────────────────────────────────────────────
DATABASE_URL=postgresql://tokensee:CHANGE_THIS_PASSWORD@localhost:5432/tokensee

# ──────────────────────────────────────────────
# 缓存（Redis — Docker 部署时自动配置）
# ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ──────────────────────────────────────────────
# RPC 节点（Alchemy API Key 必填）
# 申请地址: https://dashboard.alchemy.com
# ──────────────────────────────────────────────
ALCHEMY_API_KEY=your_alchemy_api_key_here

# BSC 可选 QuickNode（免费用 Ankr 公共 RPC 即可）
QUICKNODE_BSC_URL=

# L2 链可用 Alchemy 或留空使用 Ankr 公共 RPC（省钱）
ALCHEMY_ARBITRUM_URL=
ALCHEMY_POLYGON_URL=
ALCHEMY_BASE_URL=
ALCHEMY_OPTIMISM_URL=
ALCHEMY_AVALANCHE_URL=

# ──────────────────────────────────────────────
# 外部 API（选填，增强功能）
# ──────────────────────────────────────────────
COINGECKO_API_KEY=
ETHERSCAN_API_KEY=
GITHUB_TOKEN=
GOPLUS_APP_KEY=
GOPLUS_APP_SECRET=
DUNE_API_KEY=
ARKHAM_API_KEY=
THEGRAPH_API_KEY=
DEBANK_API_KEY=

# ──────────────────────────────────────────────
# 安全（API Key 盐值 — 生产务必修改为强随机值）
# ──────────────────────────────────────────────
API_KEY_SALT=generate_a_strong_random_string_at_least_32_chars_here

# ──────────────────────────────────────────────
# 巨鲸监控阈值
# ──────────────────────────────────────────────
WHALE_USD_THRESHOLD=100000
```

**生成强随机盐值：**

```bash
openssl rand -hex 32
```

### 4.3 配置 CORS（重要）

生产环境务必设置 `FRONTEND_URL` 为你的前端域名，否则前端请求会被后端拒绝。

如果使用 Cloudflare 等 CDN/WAF，也需要将 CDN 域名加入 CORS 白名单。

---

## 五、部署基础设施（PostgreSQL + Redis）

### 5.1 启动容器

```bash
# 在项目根目录执行
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 5.2 验证连接

```bash
# PostgreSQL
docker exec tokensee_postgres pg_isready -U tokensee
# 期望输出: accepting connections

# Redis
docker exec tokensee_redis redis-cli ping
# 期望输出: PONG
```

### 5.3 数据持久化

Docker Compose 已配置 named volumes：

```yaml
# docker-compose.yml 中已配置
volumes:
  tokensee_pgdata:      # PostgreSQL 数据
  tokensee_redisdata:   # Redis 数据
```

数据存储在 `/var/lib/docker/volumes/` 下，删除容器不会丢失数据。

---

## 六、数据库迁移

```bash
# 安装依赖
npm install

# 执行迁移
npm run migrate
```

---

## 七、构建并启动后端

### 7.1 编译 TypeScript

```bash
npm run build
```

产物输出到 `dist/` 目录。

### 7.2 使用 PM2 启动（推荐）

PM2 支持进程守护、自动重启、负载均衡日志管理：

```bash
# 使用 ecosystem.config.js 配置启动（见下一节）
pm2 start ecosystem.config.js --env production

# 保存进程列表（服务器重启后自动恢复）
pm2 save

# 设置开机自启
pm2 startup
# 按提示执行输出的命令（如：sudo env PATH=... pm2 startup ...）
```

### 7.3 PM2 配置文件

在项目根目录创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: 'tokensee-api',
      script: 'dist/index.js',
      cwd: '/opt/tokensee',
      instances: 1,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
      },
      env: {
        NODE_ENV: 'development',
      },
      // 读取 .env.production 中的变量
      // pm2 自动从 cwd 中的 .env 读取
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      // 日志
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/tokensee/error.log',
      out_file: '/var/log/tokensee/out.log',
      // 监控
      monitoring: true,
      // 自动重启策略
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

**创建日志目录：**

```bash
sudo mkdir -p /var/log/tokensee
sudo chown $USER:$USER /var/log/tokensee
```

### 7.4 常用 PM2 命令

```bash
pm2 list                      # 查看进程列表
pm2 logs tokensee-api        # 查看实时日志
pm2 restart tokensee-api     # 重启
pm2 stop tokensee-api        # 停止
pm2 delete tokensee-api      # 删除进程
pm2 monit                     # 实时监控面板
pm2 reload tokensee-api      # 零停机重载
```

---

## 八、构建并启动前端

### 8.1 安装依赖并构建

```bash
cd web

# 安装依赖
npm install

# 设置后端 API 地址（生产地址）
export API_PROXY_TARGET=http://127.0.0.1:8080

# 生产构建
npm run build
```

### 8.2 使用 PM2 启动 Next.js

在项目根目录的 `ecosystem.config.js` 中添加 frontend app：

```javascript
module.exports = {
  apps: [
    {
      name: 'tokensee-api',
      // ... 后端配置 ...
    },
    {
      name: 'tokensee-web',
      script: 'node_modules/.bin/next',
      args: 'start --port 8081',
      cwd: '/opt/tokensee/web',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        API_PROXY_TARGET: 'http://127.0.0.1:8080',
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/tokensee/web-error.log',
      out_file: '/var/log/tokensee/web-out.log',
    },
  ],
};
```

然后重启 PM2：

```bash
pm2 restart all
```

**或者使用更简单的启动方式（无需修改 ecosystem）：**

```bash
# 在 web 目录直接用 next start
cd /opt/tokensee/web
API_PROXY_TARGET=http://127.0.0.1:8080 node_modules/.bin/next start --port 8081 &

# 或者用 PM2 单独启动
pm2 start --name tokensee-web node_modules/.bin/next start --port 8081 --cwd /opt/tokensee/web
```

---

## 九、配置 Nginx 反向代理

### 9.1 安装 Nginx

```bash
sudo apt install -y nginx
```

### 9.2 前端反代配置

```bash
sudo nano /etc/nginx/sites-available/tokensee-web
```

写入以下配置：

```nginx
# 前端：yourdomain.com → Next.js :8081
server {
    listen 80;
    server_name yourdomain.com;

    # Next.js 静态文件和 API 代理
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 9.3 API 反代配置

```bash
sudo nano /etc/nginx/sites-available/tokensee-api
```

```nginx
# API: api.yourdomain.com → 后端 :8080
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / WebSocket 支持
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }
}
```

### 9.4 启用站点并重启

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/tokensee-web /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/tokensee-api /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 十、配置 SSL 证书（Let's Encrypt）

### 10.1 安装 Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 10.2 申请证书（两个域名）

```bash
# 为前端域名申请
sudo certbot --nginx -d yourdomain.com

# 为 API 域名申请（会暂停 Nginx，需短暂停）
sudo certbot --nginx -d api.yourdomain.com

# 或者一起申请
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

按提示输入邮箱（用于过期提醒），选择是否强制 HTTPS。

### 10.3 自动续期

Let's Encrypt 证书有效期 90 天，Certbot 自动续期任务已配置：

```bash
# 验证自动续期
sudo certbot renew --dry-run
```

---

## 十一、防火墙配置

```bash
# 查看当前规则
sudo ufw status

# 开放必要端口
sudo ufw allow 22/tcp    # SSH（必需）
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# 阻止其他入站流量
sudo ufw default deny incoming

# 启用防火墙
sudo ufw enable
```

---

## 十二、验证部署

### 12.1 检查服务状态

```bash
# PM2 进程
pm2 list

# Docker 容器
docker-compose ps

# Nginx
sudo systemctl status nginx
```

### 12.2 测试 API

```bash
# 健康检查
curl https://api.yourdomain.com/health

# 交易解码测试（使用已知的交易哈希）
curl -X POST https://api.yourdomain.com/v1/tx/decode \
  -H "Content-Type: application/json" \
  -d '{"hash": "0x...your_tx_hash...", "chain": "ethereum"}'
```

### 12.3 测试前端

浏览器访问 `https://yourdomain.com`，确认页面正常加载。

---

## 十三、安全加固

### 13.1 数据库密码

务必将 `docker-compose.yml` 中的默认密码 `tokensee_dev_password` 改为强随机密码：

```yaml
# docker-compose.yml
environment:
  POSTGRES_PASSWORD: your_strong_production_password_here
```

并同步更新 `.env.production` 中的 `DATABASE_URL`。

### 13.2 API Key 盐值

生产环境务必修改 `API_KEY_SALT`：

```bash
# 生成新盐值
openssl rand -hex 32
```

### 13.3 禁止服务器密码登录

```bash
# 生成本地 SSH 密钥（如果还没有）
ssh-keygen -t ed25519

# 将公钥上传到服务器
ssh-copy-id user@your-server

# 修改 SSH 配置
sudo nano /etc/ssh/sshd_config
```

```nginx
# 禁用密码登录和 Root 登录
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart sshd
```

### 13.4 Fail2ban 防暴力破解

```bash
sudo nano /etc/fail2ban/jail.local
```

```ini
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 3600
findtime = 600
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 13.5 定期备份

创建备份脚本 `/opt/tokensee/backup.sh`：

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups
mkdir -p $BACKUP_DIR

# 数据库备份
docker exec tokensee_postgres pg_dump -U tokensee tokensee > $BACKUP_DIR/db_$DATE.sql

# 备份 .env.production（包含密钥）
cp /opt/tokensee/.env.production $BACKUP_DIR/env_$DATE

# 保留最近 30 天
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "env_*" -mtime +30 -delete

echo "[$(date)] Backup completed: $BACKUP_DIR"
```

```bash
chmod +x /opt/tokensee/backup.sh

# 添加每日定时任务
sudo crontab -e
# 添加行:
# 0 3 * * * /opt/tokensee/backup.sh >> /var/log/tokensee/backup.log 2>&1
```

---

## 十四、运维常用命令

```bash
# ─── 查看日志 ───────────────────────────
pm2 logs tokensee-api --lines 100     # 后端最近 100 行日志
pm2 logs tokensee-web --lines 100     # 前端最近 100 行日志
docker-compose logs -f postgres        # PostgreSQL 日志
docker-compose logs -f redis          # Redis 日志

# ─── 重启服务 ───────────────────────────
pm2 restart tokensee-api              # 重启后端
pm2 restart tokensee-web              # 重启前端
docker-compose restart                # 重启数据库

# ─── 代码更新部署 ───────────────────────
cd /opt/tokensee
git pull                              # 或上传新代码
npm install                           # 更新依赖
npm run build                         # 重新编译
pm2 restart tokensee-api              # 重启后端

# 前端更新
cd web
npm install
npm run build
pm2 restart tokensee-web

# ─── 监控状态 ───────────────────────────
pm2 monit                             # 实时监控面板
docker stats                          # 容器资源占用
htop                                  # 系统资源占用

# ─── 数据库操作 ─────────────────────────
docker exec -it tokensee_postgres psql -U tokensee -d tokensee  # 进入数据库
```

---

## 十五、架构总览（生产环境）

```
                        ┌─────────────────────────────────────┐
                        │            Cloudflare CDN           │
                        │     (HTTPS 加速 / DDoS 防护)          │
                        └──────┬──────────────────────┬──────┘
                               │                      │
                   ┌───────────▼──────────┐ ┌────────▼──────────┐
                   │   Nginx (80/443)     │ │  Nginx (80/443)   │
                   │  api.yourdomain.com  │ │ yourdomain.com    │
                   │   → :8080            │ │  → :8081          │
                   └──────────┬───────────┘ └────────┬──────────┘
                              │                      │
                   ┌──────────▼──────────┐ ┌─────────▼───────────┐
                   │   tokensee-api     │ │   tokensee-web     │
                   │   PM2 (Node.js)     │ │   PM2 (Next.js)    │
                   │   Port: 8080        │ │   Port: 8081      │
                   │   ┌───────────┐      │ └────────────────────┘
                   │   │WhaleMonitor│
                   │   │(Worker)    │
                   │   └───────────┘
                   └──────────┬───────────────────────┬──────────┘
                              │                       │
                   ┌──────────▼──────┐      ┌─────────▼──────────┐
                   │  tokensee_pg    │      │   tokensee_redis  │
                   │  (PostgreSQL 16)│      │   (Redis 7)       │
                   │   Port: 5432    │      │   Port: 6379      │
                   └─────────────────┘      └───────────────────┘
                              │
                   ┌──────────▼──────────────────────────────────┐
                   │              Alchemy / Ankr / QuickNode      │
                   │          (7 条区块链 RPC 节点访问)            │
                   └─────────────────────────────────────────────┘
```

---

## 十六、常见问题

### Q1: PM2 启动报错 `permission denied`

```bash
# 赋予日志目录权限
sudo chown -R $USER:$USER /var/log/tokensee
```

### Q2: Docker 容器无法启动（端口被占用）

```bash
# 检查端口占用
sudo lsof -i :5432
sudo lsof -i :6379

# 如果有其他服务占用，停止它们
sudo systemctl stop postgresql
sudo systemctl disable postgresql
```

### Q3: 前端构建失败（内存不足）

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### Q4: SSL 证书申请失败

确保域名已正确解析到服务器 IP，并开放 80 端口：

```bash
curl -I http://yourdomain.com
```

### Q5: 数据库迁移报错

确认 PostgreSQL 容器已正常运行后再执行迁移：

```bash
docker-compose up -d postgres
npm run migrate
```
