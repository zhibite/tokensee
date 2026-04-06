# 1Panel 部署指南 — TokenSee

> 本文档专为使用 1Panel 管理面板的服务器编写，域名 `tokensee.com`，服务器 IP `217.216.79.175`。

---

## 整体架构

```
用户请求
    │
    ▼
1Panel (Nginx) + SSL
    │
    ├── https://tokensee.com        → Next.js 前端  (:8081)
    │                                   /api/v1/*     → 后端 API  (:8080)
    │
    ▼
Docker 容器
    ├── tokensee_postgres  (PostgreSQL 16, :5432)
    └── tokensee_redis      (Redis 7, :6379)
    │
    ▼
PM2 进程管理
    ├── tokensee-api       (Node.js 后端, :8080)
    └── tokensee-web       (Next.js 前端, :8081)
```

---

## 第一阶段：服务器准备

### 步骤 1.1：登录 1Panel

在浏览器打开 `http://217.216.79.175:8888`（1Panel 默认端口），用安装时设置的账号密码登录。

### 步骤 1.2：检查环境

进入 1Panel 左侧菜单 → **主机** → **终端**，打开 Web Terminal。

```bash
# 检查 Docker 是否已安装
docker --version

# 检查 Node.js
node -v
npm -v
```

如果 Docker 未安装，通过 1Panel **应用商店**搜索 Docker 并一键安装。

---

## 第二阶段：解析域名

### 步骤 2.1：在域名服务商添加 DNS 记录

登录你的域名管理后台（阿里云 / 腾讯云 / Cloudflare 等），添加以下两条 A 记录：

| 记录类型 | 主机记录 | 记录值 | 说明 |
|---|---|---|---|
| A | `@` | `217.216.79.175` | 主站：tokensee.com |
| A | `api` | `217.216.79.175` | API：api.tokensee.com |

> 如果只需要一个域名，前端和 API 可以共用，下面的 Nginx 配置合并即可。

等待 2-5 分钟生效，可通过以下命令验证：

```bash
ping tokensee.com
ping api.tokensee.com
```

---

## 第三阶段：上传项目代码

### 步骤 3.1：在本地打包

在本地项目根目录执行：

```bash
# 排除 node_modules、构建产物、.git 等
tar -czvf tokensee.tar.gz \
  --exclude='node_modules' \
  --exclude='web/node_modules' \
  --exclude='.git' \
  --exclude='web/.next' \
  --exclude='dist' \
  --exclude='web/.next' \
  .
```

### 步骤 3.2：上传到服务器

用任意 SFTP 工具上传 `tokensee.tar.gz` 到服务器：

| 工具 | 连接信息 |
|---|---|
| **WinSCP** | 协议：SFTP，主机：217.216.79.175，端口：22，用户/密码同 SSH |
| **FileZilla** | 主机：sftp://217.216.79.175 |
| **1Panel 文件管理** | 左侧菜单 → **文件** → 上传 |

### 步骤 3.3：在服务器解压

在 1Panel **终端**中：

```bash
# 创建目录
mkdir -p /opt/tokensee

# 解压（如果上传到了 root 目录）
cd /opt && tar -xzvf /root/tokensee.tar.gz -C /opt/tokensee

# 确认解压成功
ls /opt/tokensee
```

---

## 第四阶段：安装 Node.js 和 PM2

### 步骤 4.1：安装 Node.js 20

1Panel 应用商店中搜索 **Node.js**，选择版本 20 LTS 安装（或者用以下命令）：

```bash
# 在 1Panel 终端执行
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 验证
node -v   # 应显示 v20.x.x
npm -v
```

### 步骤 4.2：安装 PM2

```bash
npm install -g pm2
pm2 --version
```

---

## 第五阶段：部署 PostgreSQL 和 Redis（Docker）

### 步骤 5.1：通过 1Panel 创建 Docker 网络

1Panel 左侧 → **容器** → **Docker** → **网络** → **创建网络**，命名为 `tokensee_net`（bridge 类型）。

### 步骤 5.2：创建 PostgreSQL 容器

1Panel → **容器** → **编排** → **创建 Compose**，或在终端执行：

```bash
docker run -d \
  --name tokensee_postgres \
  --network tokensee_net \
  -e POSTGRES_USER=tokensee \
  -e POSTGRES_PASSWORD=tokensee_prod_password \
  -e POSTGRES_DB=tokensee \
  -p 5432:5432 \
  -v /opt/tokensee/postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine

# 验证
docker exec tokensee_postgres pg_isready -U tokensee
```

### 步骤 5.3：创建 Redis 容器

```bash
docker run -d \
  --name tokensee_redis \
  --network tokensee_net \
  -p 6379:6379 \
  -v /opt/tokensee/redis_data:/data \
  redis:7-alpine redis-server --appendonly yes

# 验证
docker exec tokensee_redis redis-cli ping
```

> **重要**：生产环境请务必将 `tokensee_prod_password` 替换为强随机密码：
> ```bash
> openssl rand -hex 24
> ```

---

## 第六阶段：配置生产环境变量

```bash
cd /opt/tokensee
cp .env.example .env.production
nano .env.production
```

以下是需要修改的关键配置：

```bash
# ── 基础 ──────────────────────────────
NODE_ENV=production
PORT=8080
FRONTEND_URL=https://tokensee.com          # 务必配置，否则 CORS 报错

# ── 数据库（密码改成上一步生成的） ─────
DATABASE_URL=postgresql://tokensee:tokensee_prod_password@localhost:5432/tokensee

# ── Redis ─────────────────────────────
REDIS_URL=redis://localhost:6379

# ── RPC（Alchemy 必填，申请: https://dashboard.alchemy.com）──
ALCHEMY_API_KEY=your_alchemy_api_key_here
# L2 链可留空使用公共 RPC（省钱）
ALCHEMY_ARBITRUM_URL=
ALCHEMY_POLYGON_URL=
ALCHEMY_BASE_URL=
ALCHEMY_OPTIMISM_URL=
ALCHEMY_AVALANCHE_URL=

# ── API 盐值（务必修改） ──────────────
API_KEY_SALT=替换为强随机字符串至少32位
# 生成方式: openssl rand -hex 32
```

---

## 第七阶段：安装依赖与数据库迁移

```bash
cd /opt/tokensee

# 安装后端依赖
npm install

# 执行数据库迁移
npm run migrate
```

---

## 第八阶段：编译并启动后端

```bash
# 编译 TypeScript
npm run build
```

创建 PM2 配置文件 `/opt/tokensee/tokensee-api.cjs`（注意后缀必须是 `.cjs`，因为项目 `package.json` 声明了 `"type": "module"`，普通 `.js` 会被当作 ESM，导致 `module.exports` 报错）：

```bash
cd /opt/tokensee
set -a && source .env.production && set +a

cat > tokensee-api.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'tokensee-api',
    script: 'dist/index.js',
    cwd: '/opt/tokensee',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: ${PORT:-8080},
      DATABASE_URL: '${DATABASE_URL}',
      REDIS_URL: '${REDIS_URL}',
      ALCHEMY_API_KEY: '${ALCHEMY_API_KEY:-}',
      API_KEY_SALT: '${API_KEY_SALT}',
      FRONTEND_URL: '${FRONTEND_URL}',
      WHALE_USD_THRESHOLD: ${WHALE_USD_THRESHOLD:-1000000},
      ALLOW_PRIVATE_WEBHOOK_URLS: ${ALLOW_PRIVATE_WEBHOOK_URLS:-false},
    },
    env: {
      NODE_ENV: 'development',
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/error.log',
    out_file: '/var/log/tokensee/out.log',
  }],
};
EOF
```

> **重要**：必须先 `source .env.production` 再生成文件，否则变量是空的。`env_production` 里的所有变量都会在 `pm2 start --env production` 时注入到进程中。

```bash
# 创建日志目录
mkdir -p /var/log/tokensee

# 启动
pm2 start tokensee-api.cjs --env production

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
# 按提示输出执行命令（复制粘贴即可）
```

---

## 第九阶段：构建并启动前端

```bash
cd /opt/tokensee/web

# 安装依赖
npm install

# 设置后端 API 地址
export API_PROXY_TARGET=http://127.0.0.1:8080

# 生产构建
npm run build
```

创建前端 PM2 配置（从 `.env.production` 读取变量）：

```bash
cd /opt/tokensee
set -a && source .env.production && set +a

cat > tokensee-web.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'tokensee-web',
    script: 'node_modules/.bin/next',
    args: 'start --port 8081',
    cwd: '/opt/tokensee/web',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      API_PROXY_TARGET: 'http://127.0.0.1:8080',
      FRONTEND_URL: '${FRONTEND_URL}',
    },
    env: {
      NODE_ENV: 'development',
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/web-error.log',
    out_file: '/var/log/tokensee/web-out.log',
  }],
};
EOF

# 启动
pm2 start tokensee-web.cjs --env production
pm2 save
```

---

## 第十阶段：通过 1Panel 配置 Nginx 和 SSL

### 步骤 10.1：创建反向代理网站

1Panel → **网站** → **创建网站** → **反向代理**：

**网站 1 — 前端（tokensee.com）：**

| 配置项 | 值 |
|---|---|
| 主域名 | `tokensee.com` |
| 代理名称 | `tokensee-web` |
| 代理地址 | `http://127.0.0.1:8081` |
| 额外配置 | 勾选"记录日志" |

**网站 2 — API（api.tokensee.com）：**

| 配置项 | 值 |
|---|---|
| 主域名 | `api.tokensee.com` |
| 代理名称 | `tokensee-api` |
| 代理地址 | `http://127.0.0.1:8080` |
| 额外配置 | 勾选"记录日志" |

### 步骤 10.2：申请 SSL 证书

在 1Panel → **网站** → 找到刚创建的两个网站 → **SSL** → **Let's Encrypt 申请**：

- tokensee.com — 勾选域名，申请免费证书
- api.tokensee.com — 同上

申请成功后，1Panel 会自动配置 HTTPS 并设置续期。

### 步骤 10.3：手动编辑 Nginx 配置（如需）

如果需要精细调整，1Panel → **网站** → 找到网站 → **配置** → **伪静态** 或 **配置文件**。

---

## 第十一阶段：验证部署

### 11.1 检查进程状态

在 1Panel **主机** → **进程管理**，或终端执行：

```bash
pm2 list
```

应看到 `tokensee-api` 和 `tokensee-web` 两个进程，状态为 `online`。

### 11.2 检查日志

```bash
pm2 logs tokensee-api --lines 50
pm2 logs tokensee-web --lines 50
```

### 11.3 浏览器访问测试

```bash
# 前端
https://tokensee.com

# API 健康检查
https://api.tokensee.com/health

# 交易解码测试（用真实交易哈希替换）
curl -X POST https://api.tokensee.com/v1/tx/decode \
  -H "Content-Type: application/json" \
  -d '{"hash": "0x...your_tx_hash...", "chain": "ethereum"}'
```

---

## 第十二阶段：防火墙设置

在 1Panel → **主机** → **防火墙**：

| 方向 | 协议 | 端口 | 策略 |
|---|---|---|---|
| 入站 | TCP | 22 | 允许（SSH） |
| 入站 | TCP | 80 | 允许（HTTP） |
| 入站 | TCP | 443 | 允许（HTTPS） |
| 入站 | TCP | 8888 | 仅内网（如不需要远程管理可关闭） |

---

## 部署完成清单

```
✅ DNS 记录已添加并生效
✅ Docker 容器运行中（PostgreSQL + Redis）
✅ Node.js 20 + PM2 已安装
✅ 项目代码已上传到 /opt/tokensee
✅ .env.production 已正确配置（密码已修改）
✅ 数据库迁移执行成功
✅ 后端 PM2 进程在线 (:8080)
✅ 前端 PM2 进程在线 (:8081)
✅ Nginx 反向代理已配置
✅ SSL 证书申请成功
✅ 浏览器访问 https://tokensee.com 正常
✅ API 健康检查通过
✅ 防火墙已正确设置
```

---

## 日常运维

```bash
# ── 查看日志 ────────────────────────
pm2 logs tokensee-api --lines 100
pm2 logs tokensee-web --lines 100

# ── 重启服务 ────────────────────────
pm2 restart tokensee-api
pm2 restart tokensee-web

# ── 代码更新部署 ─────────────────────
cd /opt/tokensee
git pull   # 或重新上传代码包

# 清理旧进程和配置文件
pm2 delete ecosystem.api 2>/dev/null || true
pm2 delete ecosystem.web 2>/dev/null || true
pm2 delete tokensee-api 2>/dev/null || true
pm2 delete tokensee-web 2>/dev/null || true
rm -f tokensee-api.cjs tokensee-web.cjs ecosystem.api.js ecosystem.web.js

set -a && source .env.production && set +a
npm install
npm run build
pm2 start tokensee-api.cjs --env production

cd web
npm install
npm run build
pm2 start tokensee-web.cjs --env production

# ── 监控面板 ────────────────────────
pm2 monit
```

---

## 常见问题

**Q1: 前端无法访问 API，报 CORS 错误**
→ 确认 `.env.production` 中 `FRONTEND_URL=https://tokensee.com` 已设置，并重启后端 `pm2 restart tokensee-api`。

**Q2: PM2 进程退出了（errored / stopped）**
→ `pm2 logs tokensee-api` 查看具体错误，常见原因：数据库密码错误、API Key 未填写、端口被占用。

**Q3: SSL 证书申请失败**
→ 确认域名已正确解析到服务器 IP：`nslookup tokensee.com`，确保 80 端口未被占用。

**Q4: 数据库连接失败**
→ `docker ps` 确认 PostgreSQL 容器运行中，`docker logs tokensee_postgres` 查看错误。
