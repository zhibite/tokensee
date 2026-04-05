#!/bin/bash
# ============================================================
# TokenSee 一键部署脚本 (1Panel + Docker + PM2)
# 运行方式: bash deploy.sh
# ============================================================
set -e

# ── 颜色定义 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

separator() {
  echo ""
  echo "════════════════════════════════════════════════════"
  echo " $1"
  echo "════════════════════════════════════════════════════"
}

# ── 前置检查 ──────────────────────────────────────────────
separator "前置检查"

# 是否 root
if [[ $EUID -ne 0 ]]; then
  log_warn "建议以 root 身份运行: sudo bash deploy.sh"
  echo ""
fi

command -v curl >/dev/null 2>&1 || { log_error "curl 未安装"; exit 1; }

# ── 交互式配置 ─────────────────────────────────────────────
separator "配置信息"

# 域名
read -p "前端域名 [tokensee.com]: " DOMAIN
DOMAIN=${DOMAIN:-tokensee.com}

read -p "API 子域名 [api.tokensee.com]: " API_DOMAIN
API_DOMAIN=${API_DOMAIN:-api.tokensee.com}

# GitHub Token（可选，用于私有仓库）
read -p "GitHub Token（私有仓库必填，公开仓库可留空）: " GH_TOKEN

# PostgreSQL 密码
while true; do
  read -sp "PostgreSQL 密码: " PG_PASSWORD
  echo ""
  read -sp "确认密码: " PG_PASSWORD2
  echo ""
  if [[ "$PG_PASSWORD" == "$PG_PASSWORD2" ]]; then
    break
  else
    log_error "两次密码不一致，请重新输入"
  fi
done

# API 盐值
while true; do
  read -sp "API_KEY_SALT（留空自动生成）: " API_SALT
  if [[ -z "$API_SALT" ]]; then
    API_SALT=$(openssl rand -hex 32)
    log_info "已生成盐值: $API_SALT"
    break
  fi
  if [[ ${#API_SALT} -lt 16 ]]; then
    log_error "盐值长度至少 16 位"
    continue
  fi
  break
done

# Alchemy API Key
read -p "Alchemy API Key（留空使用公开 RPC）: " ALCHEMY_KEY

# 安装目录
read -p "安装目录 [/opt/tokensee]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/tokensee}

echo ""
log_ok "配置完成，开始部署..."
echo ""

# ── 第一步：安装依赖 ───────────────────────────────────────
separator "第一步：安装系统依赖"

install_if_missing() {
  local cmd=$1
  local pkg=$2
  if ! command -v "$cmd" &>/dev/null; then
    log_info "安装 $pkg..."
    apt-get update -qq
    apt-get install -y -qq "$pkg" > /dev/null 2>&1
    log_ok "$pkg 安装完成"
  else
    log_ok "$cmd 已安装"
  fi
}

install_if_missing docker docker.io
install_if_missing docker-compose docker-compose

# 启动 Docker
if ! systemctl is-active --quiet docker; then
  log_info "启动 Docker..."
  systemctl start docker
  systemctl enable docker
  log_ok "Docker 已启动"
fi

# ── 第二步：拉取代码 ───────────────────────────────────────
separator "第二步：拉取代码"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_warn "目录已存在，进入更新模式"
  cd "$INSTALL_DIR"
  if [[ -n "$GH_TOKEN" ]]; then
    git remote set-url origin "https://$GH_TOKEN@github.com/zhibite/tokensee.git"
  fi
  log_info "从 GitHub 拉取最新代码..."
  git pull origin master
  log_ok "代码更新完成"
else
  log_info "克隆 GitHub 仓库到 $INSTALL_DIR..."
  if [[ -n "$GH_TOKEN" ]]; then
    git clone "https://$GH_TOKEN@github.com/zhibite/tokensee.git" "$INSTALL_DIR"
  else
    git clone https://github.com/zhibite/tokensee.git "$INSTALL_DIR"
  fi
  log_ok "代码克隆完成"
fi

cd "$INSTALL_DIR"

# ── 第三步：创建 Docker 网络 ────────────────────────────────
separator "第三步：创建 Docker 网络"

if ! docker network inspect tokensee_net &>/dev/null; then
  docker network create tokensee_net
  log_ok "网络 tokensee_net 已创建"
else
  log_ok "网络 tokensee_net 已存在"
fi

# ── 第四步：部署 PostgreSQL ───────────────────────────────
separator "第四步：部署 PostgreSQL"

if docker ps -a --format '{{.Names}}' | grep -q "^tokensee_postgres$"; then
  if docker ps --format '{{.Names}}' | grep -q "^tokensee_postgres$"; then
    log_ok "PostgreSQL 容器已在运行"
  else
    log_warn "PostgreSQL 容器存在但未运行，正在启动..."
    docker start tokensee_postgres
    log_ok "PostgreSQL 已启动"
  fi
else
  log_info "创建 PostgreSQL 容器..."
  docker run -d \
    --name tokensee_postgres \
    --network tokensee_net \
    -e POSTGRES_USER=tokensee \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e POSTGRES_DB=tokensee \
    -p 127.0.0.1:5432:5432 \
    -v tokensee_pg_data:/var/lib/postgresql/data \
    postgres:16-alpine
  log_ok "PostgreSQL 容器已创建并启动"
fi

# 等待 PostgreSQL 就绪
log_info "等待 PostgreSQL 就绪..."
for i in {1..30}; do
  if docker exec tokensee_postgres pg_isready -U tokensee &>/dev/null; then
    log_ok "PostgreSQL 就绪"
    break
  fi
  sleep 1
done

# ── 第五步：部署 Redis ────────────────────────────────────
separator "第五步：部署 Redis"

if docker ps -a --format '{{.Names}}' | grep -q "^tokensee_redis$"; then
  if docker ps --format '{{.Names}}' | grep -q "^tokensee_redis$"; then
    log_ok "Redis 容器已在运行"
  else
    log_warn "Redis 容器存在但未运行，正在启动..."
    docker start tokensee_redis
    log_ok "Redis 已启动"
  fi
else
  log_info "创建 Redis 容器..."
  docker run -d \
    --name tokensee_redis \
    --network tokensee_net \
    -p 127.0.0.1:6379:6379 \
    -v tokensee_redis_data:/data \
    redis:7-alpine redis-server --appendonly yes
  log_ok "Redis 容器已创建并启动"
fi

# ── 第六步：安装 Node.js ──────────────────────────────────
separator "第六步：安装 Node.js 和 PM2"

if ! command -v node &>/dev/null; then
  log_info "安装 Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_ok "Node.js 安装完成: $(node -v)"
else
  log_ok "Node.js 已安装: $(node -v)"
fi

if ! command -v pm2 &>/dev/null; then
  log_info "安装 PM2..."
  npm install -g pm2 > /dev/null 2>&1
  log_ok "PM2 安装完成: $(pm2 --version)"
else
  log_ok "PM2 已安装: $(pm2 --version)"
fi

# PM2 开机自启
pm2 startup 2>/dev/null || log_warn "PM2 startup 命令需要手动执行（已输出提示）"

# ── 第七步：配置环境变量 ───────────────────────────────────
separator "第七步：配置环境变量"

ENV_FILE="$INSTALL_DIR/.env.production"
log_info "创建 $ENV_FILE..."

cat > "$ENV_FILE" << 'ENVEOF'
# ── 基础 ──────────────────────────────
NODE_ENV=production
PORT=8080
FRONTEND_URL=https://DOMAIN_PLACEHOLDER

# ── 数据库 ────────────────────────────
DATABASE_URL=postgresql://tokensee:PG_PASS_PLACEHOLDER@127.0.0.1:5432/tokensee

# ── Redis ─────────────────────────────
REDIS_URL=redis://127.0.0.1:6379

# ── RPC ───────────────────────────────
# 请访问 https://dashboard.alchemy.com 申请 API Key
ALCHEMY_API_KEY=ALCHEMY_PLACEHOLDER

# ── 认证 ──────────────────────────────
API_KEY_SALT=SALT_PLACEHOLDER

# ── 监控 ──────────────────────────────
WHALE_USD_THRESHOLD=1000000
ALLOW_PRIVATE_WEBHOOK_URLS=false
ENVEOF

# 替换占位符
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$ENV_FILE"
sed -i "s|PG_PASS_PLACEHOLDER|$PG_PASSWORD|g" "$ENV_FILE"
sed -i "s|ALCHEMY_PLACEHOLDER|$ALCHEMY_KEY|g" "$ENV_FILE"
sed -i "s|SALT_PLACEHOLDER|$API_SALT|g" "$ENV_FILE"

# 如果 Alchemy Key 为空，注释掉该行
if [[ -z "$ALCHEMY_KEY" ]]; then
  sed -i 's/^ALCHEMY_API_KEY=/# ALCHEMY_API_KEY=/' "$ENV_FILE"
fi

log_ok "环境变量已写入 .env.production"

# ── 第八步：安装依赖 ───────────────────────────────────────
separator "第八步：安装后端依赖"

log_info "安装后端 npm 依赖..."
npm install --prefix "$INSTALL_DIR" 2>&1 | tail -3
log_ok "后端依赖安装完成"

separator "第九步：构建并启动后端"

log_info "编译 TypeScript..."
npm run build --prefix "$INSTALL_DIR" 2>&1 | tail -5

log_info "创建 PM2 进程配置..."
cat > "$INSTALL_DIR/ecosystem.api.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'tokensee-api',
    script: 'dist/index.js',
    cwd: 'PM2DIR_PLACEHOLDER',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/error.log',
    out_file: '/var/log/tokensee/out.log',
    time: true,
  }]
};
PM2EOF

sed -i "s|PM2DIR_PLACEHOLDER|$INSTALL_DIR|g" "$INSTALL_DIR/ecosystem.api.js"

mkdir -p /var/log/tokensee

if pm2 list | grep -q "tokensee-api"; then
  log_info "重启 tokensee-api..."
  pm2 restart tokensee-api --env production
else
  log_info "启动 tokensee-api..."
  pm2 start "$INSTALL_DIR/ecosystem.api.js" --env production
fi
pm2 save

log_ok "后端已启动"
sleep 2
curl -s http://127.0.0.1:8080/health | head -1 && log_ok "后端健康检查通过" || log_warn "后端健康检查未通过，请检查日志"

# ── 第十步：安装前端依赖 ───────────────────────────────────
separator "第十步：构建前端"

cd "$INSTALL_DIR/web"
log_info "安装前端 npm 依赖..."
npm install 2>&1 | tail -3

log_info "构建前端..."
API_PROXY_TARGET=http://127.0.0.1:8080 npm run build 2>&1 | tail -10

cat > "$INSTALL_DIR/ecosystem.web.js" << 'PM2WEBEOF'
module.exports = {
  apps: [{
    name: 'tokensee-web',
    script: 'node_modules/.bin/next',
    args: 'start --port 8081',
    cwd: 'WEBDIR_PLACEHOLDER',
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
    time: true,
  }]
};
PM2WEBEOF

sed -i "s|WEBDIR_PLACEHOLDER|$INSTALL_DIR/web|g" "$INSTALL_DIR/ecosystem.web.js"

if pm2 list | grep -q "tokensee-web"; then
  log_info "重启 tokensee-web..."
  pm2 restart tokensee-web --env production
else
  log_info "启动 tokensee-web..."
  pm2 start "$INSTALL_DIR/ecosystem.web.js" --env production
fi
pm2 save

log_ok "前端已启动"

# ── 第十一步：配置 Nginx ──────────────────────────────────
separator "第十一步：配置 Nginx 反向代理"

if command -v nginx &>/dev/null; then
  log_info "安装 / 更新 Nginx 配置..."

  # 前端配置
  cat > /etc/nginx/sites-available/tokensee-web << 'NGINXWEB'
server {
    listen 80;
    server_name DOMAIN_WEB;

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
        proxy_read_timeout 86400;
    }
}
NGINXWEB
  sed -i "s|DOMAIN_WEB|$DOMAIN|g" /etc/nginx/sites-available/tokensee-web

  # API 配置
  cat > /etc/nginx/sites-available/tokensee-api << 'NGINXAPI'
server {
    listen 80;
    server_name DOMAIN_API;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
NGINXAPI
  sed -i "s|DOMAIN_API|$API_DOMAIN|g" /etc/nginx/sites-available/tokensee-api

  # 启用站点
  ln -sf /etc/nginx/sites-available/tokensee-web /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/tokensee-api /etc/nginx/sites-enabled/

  # 测试并重载
  if nginx -t &>/dev/null; then
    systemctl reload nginx
    log_ok "Nginx 配置已重载"
  else
    log_error "Nginx 配置有误，请检查"
    nginx -t
  fi
else
  log_warn "未检测到 Nginx，请通过 1Panel 图形界面配置反向代理"
fi

# ── 完成 ─────────────────────────────────────────────────
separator "部署完成！"

echo ""
echo -e "  ${GREEN}前端：${NC} https://$DOMAIN"
echo -e "  ${GREEN}API：${NC}  https://$API_DOMAIN"
echo -e "  ${GREEN}后端：${NC} http://127.0.0.1:8080"
echo -e "  ${GREEN}前端：${NC} http://127.0.0.1:8081"
echo ""
echo -e "  ${CYAN}查看日志：${NC}  pm2 logs tokensee-api  /  pm2 logs tokensee-web"
echo -e "  ${CYAN}查看进程：${NC}  pm2 list"
echo -e "  ${CYAN}重启服务：${NC}  pm2 restart tokensee-api && pm2 restart tokensee-web"
echo ""
echo -e "  ${YELLOW}下一步：${NC} 在 1Panel 中为 $DOMAIN 和 $API_DOMAIN 申请 SSL 证书"
echo ""
