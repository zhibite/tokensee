#!/bin/bash
# ============================================================
# TokenSee 一键部署脚本
# 支持系统: Ubuntu 22.04+ / Debian 12+
# 运行方式: bash deploy.sh
# ============================================================
set -e

# ── 颜色定义 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

separator() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo -e " ${BOLD}$1${NC}"
  echo "════════════════════════════════════════════════════════════"
}

ask_password() {
  local desc="$1"
  local min_len="${2:-8}"
  while true; do
    read -sp "$desc: " result
    echo ""
    if [[ ${#result} -lt $min_len ]]; then
      log_error "密码长度至少 $min_len 位"
      continue
    fi
    read -sp "确认密码: " result2
    echo ""
    if [[ "$result" == "$result2" ]]; then
      echo "$result"
      return 0
    else
      log_error "两次密码不一致，请重新输入"
    fi
  done
}

# ── 交互式配置 ─────────────────────────────────────────────
separator "配置信息"

# 1. 项目名称
read -p "项目名称 [/opt/tokensee]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/tokensee}

# 2. 域名
read -p "前端域名 [tokensee.com]: " DOMAIN
DOMAIN=${DOMAIN:-tokensee.com}

read -p "API 子域名 [api.tokensee.com]: " API_DOMAIN
API_DOMAIN=${API_DOMAIN:-api.tokensee.com}

# 3. 端口（相邻便于管理）
read -p "后端 API 端口 [3080]: " API_PORT
API_PORT=${API_PORT:-3080}

read -p "前端端口 [3081]: " WEB_PORT
WEB_PORT=${WEB_PORT:-3081}

# 4. GitHub Token（可选）
read -p "GitHub Token（私有仓库必填，公开仓库可留空）: " GH_TOKEN

# 5. 数据库
separator "数据库配置"
PG_PASSWORD=$(ask_password "PostgreSQL 密码（至少 8 位）")
DATABASE_NAME="tokensee"
DATABASE_USER="tokensee"

# 6. Redis
separator "Redis 配置"
REDIS_PASSWORD=$(ask_password "Redis 密码（至少 8 位）")
if [[ -n "$REDIS_PASSWORD" ]]; then
  REDIS_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6379"
else
  log_warn "Redis 不设置密码（仅限内网访问）"
  REDIS_URL="redis://127.0.0.1:6379"
fi

# 7. API 盐值
separator "安全配置"
while true; do
  read -sp "API_KEY_SALT（留空自动生成，至少 16 位）: " API_SALT
  echo ""
  if [[ -z "$API_SALT" ]]; then
    API_SALT=$(openssl rand -hex 32)
    log_ok "已生成盐值: $API_SALT"
  fi
  if [[ ${#API_SALT} -lt 16 ]]; then
    log_error "盐值长度至少 16 位"
    continue
  fi
  break
done

# 8. RPC API Keys
separator "RPC 和 API Keys"

read -p "Alchemy API Key（用于 Ethereum 主网，留空使用公开 RPC）: " ALCHEMY_KEY
read -p "Etherscan API Key（用于 EnrichmentService，留空可跳过）: " ETHERSCAN_KEY
read -p "CoinGecko API Key（价格数据，留空可跳过）: " COINGECKO_KEY

# 9. 其他外部 API
read -p "Dune API Key（留空可跳过）: " DUNE_KEY
read -p "DeBank API Key（留空可跳过）: " DEBANK_KEY
read -p "Arkham API Key（留空可跳过）: " ARKHAM_KEY
read -p "TheGraph API Key（留空可跳过）: " THEGRAPH_KEY
read -p "GoPlus App Key（留空可跳过）: " GOPLUS_APP_KEY
read -p "GoPlus App Secret（留空可跳过）: " GOPLUS_APP_SECRET
read -p "BSCScan API Key（留空可跳过）: " BSCSCAN_KEY
read -p "QuickNode BSC URL（留空使用公共 RPC）: " QUICKNODE_BSC_URL

echo ""
log_ok "配置完成，开始部署..."
echo ""

# ── 第一步：安装系统依赖 ─────────────────────────────────────
separator "第一步：安装系统依赖"

install_if_missing() {
  local cmd=$1
  local pkg=$2
  if ! command -v "$cmd" &>/dev/null 2>&1; then
    log_info "安装 $pkg..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" > /dev/null 2>&1
    log_ok "$pkg 安装完成"
  else
    log_ok "$cmd 已安装"
  fi
}

install_if_missing docker docker.io
install_if_missing docker-compose docker-compose-plugin
install_if_missing nginx nginx
install_if_missing ufw ufw
install_if_missing fail2ban fail2ban

# 启动 Docker
if ! systemctl is-active --quiet docker; then
  log_info "启动 Docker..."
  systemctl start docker
  systemctl enable docker
  log_ok "Docker 已启动"
else
  log_ok "Docker 已运行"
fi

# ── 第二步：拉取代码 ───────────────────────────────────────
separator "第二步：拉取代码"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_warn "目录已存在，进入更新模式"
  cd "$INSTALL_DIR"

  CONFLICT_FILES=$(git status --porcelain | grep -E '^\?\?' | awk '{print $2}' | grep -v '\.env\.production' | grep -v '\.gitignore' || true)

  if [[ -n "$CONFLICT_FILES" ]]; then
    log_warn "发现本地新增文件，会被远程覆盖:"
    echo "$CONFLICT_FILES"
    while true; do
      read -p "是否删除这些冲突文件后继续？[y/N]: " yn
      case $yn in
        [Yy]* ) echo "$CONFLICT_FILES" | xargs rm -f; log_info "冲突文件已删除"; break;;
        * )     log_error "请手动处理后重新运行脚本"; exit 1;;
      esac
    done
  fi

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

# ── 第三步：启动数据库容器 ─────────────────────────────────
separator "第三步：启动 PostgreSQL 和 Redis"

# 写入 docker-compose .env
cat > "$INSTALL_DIR/.env" << EOF
POSTGRES_PASSWORD=$PG_PASSWORD
REDIS_PASSWORD=${REDIS_PASSWORD:-}
EOF

# 清理旧容器（如果存在）
if docker ps -a --format '{{.Names}}' | grep -q "^tokensee_postgres$"; then
  log_warn "发现旧 PostgreSQL 容器，删除中..."
  docker rm -f tokensee_postgres 2>/dev/null || true
fi
if docker ps -a --format '{{.Names}}' | grep -q "^tokensee_redis$"; then
  log_warn "发现旧 Redis 容器，删除中..."
  docker rm -f tokensee_redis 2>/dev/null || true
fi

log_info "启动 PostgreSQL 和 Redis..."
POSTGRES_PASSWORD="$PG_PASSWORD" REDIS_PASSWORD="$REDIS_PASSWORD" \
  docker-compose up -d

# 等待 PostgreSQL 就绪
log_info "等待 PostgreSQL 就绪..."
for i in {1..30}; do
  if docker exec tokensee_postgres pg_isready -U tokensee &>/dev/null; then
    log_ok "PostgreSQL 就绪"
    break
  fi
  if [[ $i -eq 30 ]]; then
    log_error "PostgreSQL 启动超时"
    exit 1
  fi
  sleep 1
done

# 创建数据库用户和数据库（如果不存在）
log_info "创建数据库用户和数据库..."
docker exec tokensee_postgres psql -U tokensee -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='$DATABASE_USER'" | grep -q 1 \
  || docker exec tokensee_postgres psql -U tokensee -c \
  "CREATE USER $DATABASE_USER WITH PASSWORD '$PG_PASSWORD';"

docker exec tokensee_postgres psql -U tokensee -tc \
  "SELECT 1 FROM pg_database WHERE datname='$DATABASE_NAME'" | grep -q 1 \
  || docker exec tokensee_postgres psql -U tokensee -c \
  "CREATE DATABASE $DATABASE_NAME OWNER $DATABASE_USER;"

docker exec tokensee_postgres psql -U tokensee -c \
  "GRANT ALL PRIVILEGES ON DATABASE $DATABASE_NAME TO $DATABASE_USER;"
log_ok "数据库 $DATABASE_NAME 已就绪"

# 等待 Redis 就绪
log_info "等待 Redis 就绪..."
for i in {1..20}; do
  PING_CMD="docker exec tokensee_redis redis-cli ping"
  if [[ -n "$REDIS_PASSWORD" ]]; then
    PING_CMD="docker exec tokensee_redis redis-cli -a $REDIS_PASSWORD --no-auth-warning ping"
  fi
  if $PING_CMD 2>/dev/null | grep -q PONG; then
    log_ok "Redis 就绪"
    break
  fi
  if [[ $i -eq 20 ]]; then
    log_error "Redis 启动超时"
    exit 1
  fi
  sleep 1
done

# ── 第四步：安装 Node.js ──────────────────────────────────
separator "第四步：安装 Node.js 和 PM2"

if ! command -v node &>/dev/null 2>&1; then
  log_info "安装 Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_ok "Node.js 安装完成: $(node -v)"
else
  log_ok "Node.js 已安装: $(node -v)"
fi

if ! command -v pm2 &>/dev/null 2>&1; then
  log_info "安装 PM2..."
  npm install -g pm2 > /dev/null 2>&1
  log_ok "PM2 安装完成: $(pm2 --version)"
else
  log_ok "PM2 已安装: $(pm2 --version)"
fi

# PM2 开机自启
PM2_STARTUP_OUTPUT=$(pm2 startup 2>&1 || true)
if echo "$PM2_STARTUP_OUTPUT" | grep -q "sudo"; then
  log_info "请手动执行以下命令启用 PM2 开机自启:"
  echo "$PM2_STARTUP_OUTPUT"
else
  log_ok "PM2 开机自启已配置"
fi

# ── 第五步：配置环境变量 ───────────────────────────────────
separator "第五步：配置环境变量"

ENV_FILE="$INSTALL_DIR/.env.production"
log_info "创建 $ENV_FILE..."

cat > "$ENV_FILE" << 'ENVEOF'
# ── 基础 ──────────────────────────────
NODE_ENV=production
PORT=PORT_PLACEHOLDER
FRONTEND_URL=https://DOMAIN_PLACEHOLDER

# ── 数据库 ────────────────────────────
DATABASE_URL=postgresql://tokensee:PG_PASS_PLACEHOLDER@127.0.0.1:5432/tokensee

# ── Redis ─────────────────────────────
REDIS_URL=REDIS_URL_PLACEHOLDER

# ── RPC ───────────────────────────────
ALCHEMY_API_KEY=ALCHEMY_PLACEHOLDER
QUICKNODE_BSC_URL=QUICKNODE_BSC_PLACEHOLDER

# ── 外部 API ─────────────────────────
ETHERSCAN_API_KEY=ETHERSCAN_PLACEHOLDER
COINGECKO_API_KEY=COINGECKO_PLACEHOLDER
BSCSCAN_API_KEY=BSCSCAN_PLACEHOLDER
DUNE_API_KEY=DUNE_PLACEHOLDER
DEBANK_API_KEY=DEBANK_PLACEHOLDER
ARKHAM_API_KEY=ARKHAM_PLACEHOLDER
THEGRAPH_API_KEY=THEGRAPH_PLACEHOLDER
GOPLUS_APP_KEY=GOPLUS_APP_KEY_PLACEHOLDER
GOPLUS_APP_SECRET=GOPLUS_APP_SECRET_PLACEHOLDER

# ── 认证 ──────────────────────────────
API_KEY_SALT=SALT_PLACEHOLDER

# ── 监控 ──────────────────────────────
WHALE_USD_THRESHOLD=1000000
ALLOW_PRIVATE_WEBHOOK_URLS=false
ENVEOF

# 替换占位符
sed -i "s|PORT_PLACEHOLDER|$API_PORT|g" "$ENV_FILE"
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$ENV_FILE"
sed -i "s|PG_PASS_PLACEHOLDER|$PG_PASSWORD|g" "$ENV_FILE"
sed -i "s|REDIS_URL_PLACEHOLDER|$REDIS_URL|g" "$ENV_FILE"
sed -i "s|ALCHEMY_PLACEHOLDER|${ALCHEMY_KEY:-}|g" "$ENV_FILE"
sed -i "s|QUICKNODE_BSC_PLACEHOLDER|${QUICKNODE_BSC_URL:-}|g" "$ENV_FILE"
sed -i "s|ETHERSCAN_PLACEHOLDER|${ETHERSCAN_KEY:-}|g" "$ENV_FILE"
sed -i "s|COINGECKO_PLACEHOLDER|${COINGECKO_KEY:-}|g" "$ENV_FILE"
sed -i "s|BSCSCAN_PLACEHOLDER|${BSCSCAN_KEY:-}|g" "$ENV_FILE"
sed -i "s|DUNE_PLACEHOLDER|${DUNE_KEY:-}|g" "$ENV_FILE"
sed -i "s|DEBANK_PLACEHOLDER|${DEBANK_KEY:-}|g" "$ENV_FILE"
sed -i "s|ARKHAM_PLACEHOLDER|${ARKHAM_KEY:-}|g" "$ENV_FILE"
sed -i "s|THEGRAPH_PLACEHOLDER|${THEGRAPH_KEY:-}|g" "$ENV_FILE"
sed -i "s|GOPLUS_APP_KEY_PLACEHOLDER|${GOPLUS_APP_KEY:-}|g" "$ENV_FILE"
sed -i "s|GOPLUS_APP_SECRET_PLACEHOLDER|${GOPLUS_APP_SECRET:-}|g" "$ENV_FILE"
sed -i "s|SALT_PLACEHOLDER|$API_SALT|g" "$ENV_FILE"

log_ok "环境变量已写入 .env.production"

# ── 第六步：安装后端依赖 ─────────────────────────────────────
separator "第六步：安装后端依赖"

log_info "安装后端 npm 依赖..."
npm install --prefix "$INSTALL_DIR" 2>&1 | tail -3
log_ok "后端依赖安装完成"

# ── 第七步：编译 TypeScript ─────────────────────────────────
separator "第七步：编译 TypeScript"

log_info "编译 TypeScript..."
npm run build --prefix "$INSTALL_DIR" 2>&1 | tail -5
log_ok "编译完成"

# ── 第八步：运行数据库迁移 ─────────────────────────────────
separator "第八步：运行数据库迁移"

log_info "执行数据库迁移..."
if npm run migrate --prefix "$INSTALL_DIR" 2>&1 | tail -10; then
  log_ok "数据库迁移完成"
else
  log_warn "数据库迁移失败，请检查数据库连接后手动执行: npm run migrate"
fi

# ── 第九步：配置并启动 PM2 ──────────────────────────────
separator "第九步：配置并启动后端 API"

log_info "清理旧 PM2 进程..."
pm2 delete tokensee-api 2>/dev/null || true
pm2 delete tokensee-web 2>/dev/null || true
rm -f "$INSTALL_DIR"/ecosystem.api.js "$INSTALL_DIR"/ecosystem.web.js \
      "$INSTALL_DIR"/ecosystem.api.cjs "$INSTALL_DIR"/ecosystem.web.cjs \
      "$INSTALL_DIR"/tokensee-api.js "$INSTALL_DIR"/tokensee-web.js 2>/dev/null || true

log_info "创建 PM2 进程配置..."
mkdir -p /var/log/tokensee

# 从 .env.production 读取变量
load_env_vars() {
  set -a
  source "$INSTALL_DIR/.env.production"
  set +a
}
load_env_vars

# 生成 PM2 API 配置
cat > "$INSTALL_DIR/tokensee-api.cjs" << EOF
module.exports = {
  apps: [{
    name: 'tokensee-api',
    script: 'dist/index.js',
    cwd: '$INSTALL_DIR',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: ${API_PORT:-3080},
      DATABASE_URL: '${DATABASE_URL}',
      REDIS_URL: '${REDIS_URL}',
      ALCHEMY_API_KEY: '${ALCHEMY_API_KEY:-}',
      QUICKNODE_BSC_URL: '${QUICKNODE_BSC_URL:-}',
      ETHERSCAN_API_KEY: '${ETHERSCAN_API_KEY:-}',
      COINGECKO_API_KEY: '${COINGECKO_API_KEY:-}',
      BSCSCAN_API_KEY: '${BSCSCAN_API_KEY:-}',
      DUNE_API_KEY: '${DUNE_API_KEY:-}',
      DEBANK_API_KEY: '${DEBANK_API_KEY:-}',
      ARKHAM_API_KEY: '${ARKHAM_API_KEY:-}',
      THEGRAPH_API_KEY: '${THEGRAPH_API_KEY:-}',
      GOPLUS_APP_KEY: '${GOPLUS_APP_KEY:-}',
      GOPLUS_APP_SECRET: '${GOPLUS_APP_SECRET:-}',
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
    time: true,
  }]
};
EOF

log_info "启动 tokensee-api (端口 $API_PORT)..."
pm2 start "$INSTALL_DIR/tokensee-api.cjs" --env production
pm2 save

sleep 3
if curl -sf "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
  log_ok "后端 API 健康检查通过"
else
  log_warn "后端 API 健康检查未通过，请检查日志: pm2 logs tokensee-api"
fi

# ── 第十步：构建并启动前端 ───────────────────────────────
separator "第十步：构建并启动前端"

cd "$INSTALL_DIR/web"
log_info "安装前端 npm 依赖..."
npm install 2>&1 | tail -3

log_info "构建前端..."
API_PROXY_TARGET="http://127.0.0.1:$API_PORT" npm run build 2>&1 | tail -10

# 生成 PM2 Web 配置
cat > "$INSTALL_DIR/tokensee-web.cjs" << EOF
module.exports = {
  apps: [{
    name: 'tokensee-web',
    script: 'node_modules/.bin/next',
    args: 'start --port $WEB_PORT_PLACEHOLDER',
    cwd: '$INSTALL_DIR/web',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      API_PROXY_TARGET: 'http://127.0.0.1:$API_PORT_PLACEHOLDER',
      FRONTEND_URL: '${FRONTEND_URL}',
    },
    env: {
      NODE_ENV: 'development',
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/web-error.log',
    out_file: '/var/log/tokensee/web-out.log',
    time: true,
  }]
};
EOF

sed -i "s|\$WEB_PORT_PLACEHOLDER|$WEB_PORT|g" "$INSTALL_DIR/tokensee-web.cjs"
sed -i "s|\$API_PORT_PLACEHOLDER|$API_PORT|g" "$INSTALL_DIR/tokensee-web.cjs"

log_info "启动 tokensee-web (端口 $WEB_PORT)..."
pm2 start "$INSTALL_DIR/tokensee-web.cjs" --env production
pm2 save

sleep 3
if curl -sf "http://127.0.0.1:$WEB_PORT" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
  log_ok "前端服务已就绪"
else
  log_warn "前端服务启动中..."
fi

# ── 第十一步：配置 Nginx 反向代理 ─────────────────────────
separator "第十一步：配置 Nginx 反向代理"

log_info "配置 Nginx..."

# 前端配置
cat > /etc/nginx/sites-available/tokensee-web << NGINXWEB
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINXWEB

# API 配置
cat > /etc/nginx/sites-available/tokensee-api << NGINXAPI
server {
    listen 80;
    server_name $API_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
    }
}
NGINXAPI

# 清理默认站点
rm -f /etc/nginx/sites-enabled/default

# 启用站点
ln -sf /etc/nginx/sites-available/tokensee-web /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/tokensee-api /etc/nginx/sites-enabled/

# 测试并重载
if nginx -t 2>&1 | grep -q "syntax is ok"; then
  systemctl reload nginx
  log_ok "Nginx 配置已重载"
else
  log_error "Nginx 配置有误，请检查"
  nginx -t
fi

# ── 第十二步：验证部署 ───────────────────────────────────
separator "第十二步：验证部署"

FAILED=0

log_info "测试后端 API..."
if curl -sf "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
  log_ok "后端 API: http://127.0.0.1:$API_PORT/health OK"
else
  log_error "后端 API: http://127.0.0.1:$API_PORT/health FAILED"
  FAILED=1
fi

log_info "测试前端..."
if curl -sf "http://127.0.0.1:$WEB_PORT" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
  log_ok "前端服务: http://127.0.0.1:$WEB_PORT OK"
else
  log_error "前端服务: http://127.0.0.1:$WEB_PORT FAILED"
  FAILED=1
fi

log_info "测试 Nginx 反代 (HTTP)..."
if curl -sf --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
  log_ok "Nginx 前端反代: http://$DOMAIN OK"
else
  log_error "Nginx 前端反代: http://$DOMAIN 未响应（域名可能未解析到本机）"
  log_info "如果域名已解析到 $SERVER_IP，请稍等片刻后再试: curl http://$DOMAIN"
  FAILED=1
fi

log_info "测试 Nginx API 反代..."
if curl -sf --resolve "$API_DOMAIN:80:127.0.0.1" "http://$API_DOMAIN/health" 2>/dev/null | grep -q "ok"; then
  log_ok "Nginx API 反代: http://$API_DOMAIN/health OK"
else
  log_error "Nginx API 反代: http://$API_DOMAIN/health 未响应（域名可能未解析到本机）"
  FAILED=1
fi

# ── 第十三步：配置防火墙 ───────────────────────────────────
separator "第十三步：配置防火墙"

if command -v ufw >/dev/null 2>&1; then
  SSH_PORT=$(grep "^Port" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow $SSH_PORT/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'

  if ufw --force enable 2>&1 | grep -q "Firewall is active"; then
    log_ok "防火墙已启用（仅开放 SSH/HTTP/HTTPS）"
  else
    log_warn "防火墙启用失败，请手动检查"
  fi
fi

# ── 完成 ─────────────────────────────────────────────────
separator "部署完成！"

echo ""
echo -e "  ${GREEN}前端：${NC}  http://$DOMAIN"
echo -e "  ${GREEN}API：${NC}   http://$API_DOMAIN"
echo -e "  ${GREEN}后端：${NC}  http://127.0.0.1:$API_PORT"
echo -e "  ${GREEN}前端：${NC}  http://127.0.0.1:$WEB_PORT"
echo ""
echo -e "  ${CYAN}查看日志：${NC}   pm2 logs tokensee-api  /  pm2 logs tokensee-web"
echo -e "  ${CYAN}查看进程：${NC}   pm2 list"
echo -e "  ${CYAN}重启服务：${NC}   pm2 restart tokensee-api && pm2 restart tokensee-web"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GREEN}✓ 所有服务验证通过！${NC}"
else
  echo -e "  ${YELLOW}⚠ 部分服务验证失败，请检查日志${NC}"
fi

echo ""
echo -e "  ${YELLOW}下一步：${NC} 为 $DOMAIN 和 $API_DOMAIN 申请 SSL 证书"
echo -e "    certbot --nginx -d $DOMAIN -d $API_DOMAIN"
echo ""

# 保存配置摘要
cat > "$INSTALL_DIR/.deploy-config.txt" << EOF
TokenSee 部署配置摘要
====================
安装目录: $INSTALL_DIR
前端域名: http://$DOMAIN
API 域名:  http://$API_DOMAIN
后端端口:  $API_PORT
前端端口:  $WEB_PORT
PostgreSQL: 127.0.0.1:5432 (用户: tokensee, 数据库: tokensee)
Redis: 127.0.0.1:6379

PM2 进程:
  tokensee-api (后端 API, 端口 $API_PORT)
  tokensee-web (前端 Next.js, 端口 $WEB_PORT)

Nginx 配置:
  /etc/nginx/sites-available/tokensee-web
  /etc/nginx/sites-available/tokensee-api

环境变量文件: $INSTALL_DIR/.env.production
EOF

log_ok "配置摘要已保存到 $INSTALL_DIR/.deploy-config.txt"
