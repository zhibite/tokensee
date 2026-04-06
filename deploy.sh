#!/bin/bash
# ============================================================
# TokenSee 部署脚本
# 支持系统: Ubuntu 22.04+ / Debian 12+
# 运行方式: bash deploy.sh
# ============================================================
set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────
RED='\033[0;31m';  GREEN='\033[0;32m';  YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m';    NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

sep() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo -e " ${BOLD}$1${NC}"
  echo "════════════════════════════════════════════════════════════"
}

# ── 变量 ──────────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/opt/tokensee}"
CONFIG_FILE="$INSTALL_DIR/.deploy-config.env"
PROGRESS_FILE="$INSTALL_DIR/.deploy-progress"

# ── 加载配置 ───────────────────────────────────────────
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    set -a
    source "$CONFIG_FILE"
    set +a
    return 0
  fi
  return 1
}

save_config() {
  cat > "$CONFIG_FILE" << EOF
INSTALL_DIR=$INSTALL_DIR
DOMAIN=$DOMAIN
API_DOMAIN=$API_DOMAIN
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
GH_TOKEN=$GH_TOKEN
PG_PASSWORD=$PG_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=$REDIS_URL
API_SALT=$API_SALT
ALCHEMY_KEY=$ALCHEMY_KEY
ETHERSCAN_KEY=$ETHERSCAN_KEY
COINGECKO_KEY=$COINGECKO_KEY
BSCSCAN_KEY=$BSCSCAN_KEY
DUNE_API_KEY=$DUNE_API_KEY
DEBANK_API_KEY=$DEBANK_API_KEY
ARKHAM_API_KEY=$ARKHAM_API_KEY
THEGRAPH_API_KEY=$THEGRAPH_API_KEY
GOPLUS_APP_KEY=$GOPLUS_APP_KEY
GOPLUS_APP_SECRET=$GOPLUS_APP_SECRET
QUICKNODE_BSC_URL=$QUICKNODE_BSC_URL
EOF
  ok "配置已保存到 $CONFIG_FILE"
}

mark_done() { echo "$1" >> "$PROGRESS_FILE"; }
is_done()   { grep -q "^$1$" "$PROGRESS_FILE" 2>/dev/null; }

gen_pass()  { openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 20; }

# ── 菜单 ──────────────────────────────────────────────
show_menu() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║              TokenSee 部署脚本 — 主菜单                  ║"
  echo "╠═══════════════════════════════════════════════════════════╣"
  echo "║                                                           ║"
  echo "║  ${BOLD}安装部署${NC}                                              ║"
  echo "║  1)  安装系统依赖（Docker / Node / PM2 / Nginx）          ║"
  echo "║  2)  安装数据库（PostgreSQL + Redis）                      ║"
  echo "║  3)  拉取代码 + 编译前后端                                 ║"
  echo "║  4)  配置 Nginx + 启动服务                                 ║"
  echo "║  5)  完整部署（一次性跑完 1-4）                            ║"
  echo "║                                                           ║"
  echo "║  ${BOLD}运维操作${NC}                                              ║"
  echo "║  6)  启动所有服务                                          ║"
  echo "║  7)  重启所有服务                                          ║"
  echo "║  8)  停止所有服务                                          ║"
  echo "║  9)  查看 PM2 进程                                         ║"
  echo "║ 10)  查看 PM2 日志                                         ║"
  echo "║ 11)  验证部署状态                                          ║"
  echo "║                                                           ║"
  echo "║  ${BOLD}配置${NC}                                                   ║"
  echo "║ 12)  修改配置（重新交互输入）                              ║"
  echo "║  0)  退出                                                  ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
}

# ── 第1步：安装系统依赖 ─────────────────────────────────
do_step1() {
  sep "第一步：安装系统依赖"
  if is_done "step1"; then
    warn "已安装，跳过。如需重装先删除 $PROGRESS_FILE"
    return 0
  fi

  info "更新 apt..."
  apt-get update -qq

  # Docker
  if ! command -v docker &>/dev/null; then
    info "安装 Docker..."
    apt-get install -y -qq docker.io docker-compose-plugin > /dev/null 2>&1
    systemctl start docker && systemctl enable docker
    ok "Docker 安装完成 ($(docker --version | cut -d' ' -f3 | tr -d ','))"
  else
    ok "Docker 已安装 ($(docker --version | cut -d' ' -f3 | tr -d ','))"
  fi

  # Nginx
  if ! command -v nginx &>/dev/null; then
    info "安装 Nginx..."
    apt-get install -y -qq nginx > /dev/null 2>&1
    ok "Nginx 安装完成"
  else
    ok "Nginx 已安装"
  fi

  # Node.js
  if ! command -v node &>/dev/null; then
    info "安装 Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    ok "Node.js 安装完成: $(node -v)"
  else
    ok "Node.js 已安装: $(node -v)"
  fi

  # PM2
  if ! command -v pm2 &>/dev/null; then
    info "安装 PM2..."
    npm install -g pm2 > /dev/null 2>&1
    ok "PM2 安装完成: $(pm2 --version)"
  else
    ok "PM2 已安装: $(pm2 --version)"
  fi

  mark_done "step1"
  ok "第一步完成"
}

# ── 第2步：安装数据库 ─────────────────────────────────
do_step2() {
  sep "第二步：安装 PostgreSQL + Redis"
  if is_done "step2"; then
    warn "已安装，跳过。如需重装先删除 $PROGRESS_FILE"
    return 0
  fi

  cd "$INSTALL_DIR"

  # 随机生成密码
  PG_PASSWORD="${PG_PASSWORD:-$(gen_pass)}"
  REDIS_PASSWORD="${REDIS_PASSWORD:-$(gen_pass)}"
  REDIS_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6379"

  echo ""
  warn "=== 重要！请记录以下密码 ==="
  echo "  PostgreSQL 密码: $PG_PASSWORD"
  echo "  Redis 密码:      $REDIS_PASSWORD"
  echo ""

  # 写入 docker-compose .env
  cat > "$INSTALL_DIR/.env" << EOF
POSTGRES_PASSWORD=$PG_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
EOF

  # 清理旧容器
  docker rm -f tokensee_postgres 2>/dev/null || true
  docker rm -f tokensee_redis   2>/dev/null || true

  info "启动 PostgreSQL 和 Redis..."
  POSTGRES_PASSWORD="$PG_PASSWORD" REDIS_PASSWORD="$REDIS_PASSWORD" \
    docker-compose up -d

  # 等待 PostgreSQL
  info "等待 PostgreSQL 就绪..."
  for i in {1..30}; do
    docker exec tokensee_postgres pg_isready -U tokensee &>/dev/null && break
    sleep 1
  done
  if ! docker exec tokensee_postgres pg_isready -U tokensee &>/dev/null; then
    error "PostgreSQL 启动超时"; return 1
  fi
  ok "PostgreSQL 就绪"

  # 创建数据库和用户
  docker exec tokensee_postgres psql -U tokensee -tc \
    "SELECT 1 FROM pg_roles WHERE rolname='tokensee'" | grep -q 1 \
    || docker exec tokensee_postgres psql -U tokensee -c \
    "CREATE USER tokensee WITH PASSWORD '$PG_PASSWORD';"

  docker exec tokensee_postgres psql -U tokensee -tc \
    "SELECT 1 FROM pg_database WHERE datname='tokensee'" | grep -q 1 \
    || docker exec tokensee_postgres psql -U tokensee -c \
    "CREATE DATABASE tokensee OWNER tokensee;"

  docker exec tokensee_postgres psql -U tokensee -c \
    "GRANT ALL PRIVILEGES ON DATABASE tokensee TO tokensee;"

  # 等待 Redis
  info "等待 Redis 就绪..."
  for i in {1..20}; do
    docker exec tokensee_redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null | grep -q PONG && break
    sleep 1
  done
  if ! docker exec tokensee_redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null | grep -q PONG; then
    error "Redis 启动超时"; return 1
  fi
  ok "Redis 就绪"

  # 保存配置（包含随机密码）
  save_config

  mark_done "step2"
  ok "第二步完成 — 密码已记录到 $CONFIG_FILE"
}

# ── 第3步：拉取代码 + 编译 ──────────────────────────────
do_step3() {
  sep "第三步：拉取代码 + 编译前后端"
  if is_done "step3"; then
    warn "已编译，跳过。如需重装先删除 $PROGRESS_FILE"
    return 0
  fi

  # 如果代码目录不存在，先拉取
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    mkdir -p "$(dirname "$INSTALL_DIR")"
    info "克隆仓库到 $INSTALL_DIR..."
    if [[ -n "$GH_TOKEN" ]]; then
      git clone "https://$GH_TOKEN@github.com/zhibite/tokensee.git" "$INSTALL_DIR"
    else
      git clone https://github.com/zhibite/tokensee.git "$INSTALL_DIR"
    fi
  else
    info "更新代码..."
    cd "$INSTALL_DIR"
    [[ -n "$GH_TOKEN" ]] && git remote set-url origin "https://$GH_TOKEN@github.com/zhibite/tokensee.git"
    git pull origin master
  fi

  # 生成生产环境变量文件
  API_SALT="${API_SALT:-$(openssl rand -hex 32)}"

  info "生成 .env.production..."
  cat > "$INSTALL_DIR/.env.production" << ENVEOF
NODE_ENV=production
PORT=$API_PORT
FRONTEND_URL=https://$DOMAIN

DATABASE_URL=postgresql://tokensee:$PG_PASSWORD@127.0.0.1:5432/tokensee
REDIS_URL=$REDIS_URL

ALCHEMY_API_KEY=${ALCHEMY_KEY:-}
QUICKNODE_BSC_URL=${QUICKNODE_BSC_URL:-}
ETHERSCAN_API_KEY=${ETHERSCAN_KEY:-}
COINGECKO_API_KEY=${COINGECKO_KEY:-}
BSCSCAN_API_KEY=${BSCSCAN_KEY:-}
DUNE_API_KEY=${DUNE_API_KEY:-}
DEBANK_API_KEY=${DEBANK_API_KEY:-}
ARKHAM_API_KEY=${ARKHAM_API_KEY:-}
THEGRAPH_API_KEY=${THEGRAPH_API_KEY:-}
GOPLUS_APP_KEY=${GOPLUS_APP_KEY:-}
GOPLUS_APP_SECRET=${GOPLUS_APP_SECRET:-}

API_KEY_SALT=$API_SALT
WHALE_USD_THRESHOLD=1000000
ALLOW_PRIVATE_WEBHOOK_URLS=false
ENVEOF

  # 安装后端依赖 + 编译
  info "安装后端依赖..."
  npm install --prefix "$INSTALL_DIR" 2>&1 | tail -3

  info "编译 TypeScript..."
  if ! npm run build --prefix "$INSTALL_DIR" 2>&1 | tail -5; then
    error "编译失败"; return 1
  fi
  ok "后端编译完成"

  # 数据库迁移
  info "运行数据库迁移..."
  npm run migrate --prefix "$INSTALL_DIR" 2>&1 | tail -10 || warn "迁移失败，请手动检查"

  # 前端构建
  cd "$INSTALL_DIR/web"
  info "安装前端依赖..."
  npm install 2>&1 | tail -3

  info "构建前端..."
  API_PROXY_TARGET="http://127.0.0.1:$API_PORT" npm run build 2>&1 | tail -10 || {
    error "前端构建失败"; return 1
  }
  ok "前端构建完成"

  save_config
  mark_done "step3"
  ok "第三步完成"
}

# ── 第4步：Nginx + 启动服务 ────────────────────────────
do_step4() {
  sep "第四步：配置 Nginx + 启动服务"

  # PM2 清理旧进程
  info "清理旧 PM2 进程..."
  pm2 delete tokensee-api 2>/dev/null || true
  pm2 delete tokensee-web 2>/dev/null || true
  rm -f "$INSTALL_DIR"/tokensee-*.cjs "$INSTALL_DIR"/tokensee-*.js 2>/dev/null || true
  mkdir -p /var/log/tokensee

  # 加载环境变量
  set -a
  source "$INSTALL_DIR/.env.production"
  set +a

  # PM2 配置：API
  info "创建 PM2 进程配置..."
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
      PORT: $API_PORT,
      DATABASE_URL: '$DATABASE_URL',
      REDIS_URL: '$REDIS_URL',
      ALCHEMY_API_KEY: '$ALCHEMY_API_KEY',
      QUICKNODE_BSC_URL: '$QUICKNODE_BSC_URL',
      ETHERSCAN_API_KEY: '$ETHERSCAN_API_KEY',
      COINGECKO_API_KEY: '$COINGECKO_API_KEY',
      BSCSCAN_API_KEY: '$BSCSCAN_API_KEY',
      DUNE_API_KEY: '$DUNE_API_KEY',
      DEBANK_API_KEY: '$DEBANK_API_KEY',
      ARKHAM_API_KEY: '$ARKHAM_API_KEY',
      THEGRAPH_API_KEY: '$THEGRAPH_API_KEY',
      GOPLUS_APP_KEY: '$GOPLUS_APP_KEY',
      GOPLUS_APP_SECRET: '$GOPLUS_APP_SECRET',
      API_KEY_SALT: '$API_KEY_SALT',
      FRONTEND_URL: '$FRONTEND_URL',
      WHALE_USD_THRESHOLD: $WHALE_USD_THRESHOLD,
      ALLOW_PRIVATE_WEBHOOK_URLS: $ALLOW_PRIVATE_WEBHOOK_URLS,
    },
    env: { NODE_ENV: 'development' },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/error.log',
    out_file: '/var/log/tokensee/out.log',
    time: true,
  }]
};
EOF

  # PM2 配置：Web
  cat > "$INSTALL_DIR/tokensee-web.cjs" << EOF
module.exports = {
  apps: [{
    name: 'tokensee-web',
    script: 'node_modules/.bin/next',
    args: 'start --port $WEB_PORT',
    cwd: '$INSTALL_DIR/web',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      API_PROXY_TARGET: 'http://127.0.0.1:$API_PORT',
      FRONTEND_URL: '$FRONTEND_URL',
    },
    env: { NODE_ENV: 'development' },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tokensee/web-error.log',
    out_file: '/var/log/tokensee/web-out.log',
    time: true,
  }]
};
EOF

  # 启动
  info "启动后端 API (端口 $API_PORT)..."
  pm2 start "$INSTALL_DIR/tokensee-api.cjs" --env production
  sleep 2

  info "启动前端 (端口 $WEB_PORT)..."
  pm2 start "$INSTALL_DIR/tokensee-web.cjs" --env production
  pm2 save

  # PM2 开机自启
  PM2_CMD=$(pm2 startup 2>&1 || true)
  if echo "$PM2_CMD" | grep -q "sudo"; then
    echo "$PM2_CMD"
  fi

  # Nginx 配置
  info "配置 Nginx..."

  cat > /etc/nginx/sites-available/tokensee-web << 'NGINX'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location / {
        proxy_pass http://127.0.0.1:WEB_PORT_PLACEHOLDER;
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
NGINX

  cat > /etc/nginx/sites-available/tokensee-api << 'NGINX'
server {
    listen 80;
    server_name API_DOMAIN_PLACEHOLDER;

    location / {
        proxy_pass http://127.0.0.1:API_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
NGINX

  sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g"               /etc/nginx/sites-available/tokensee-web
  sed -i "s|WEB_PORT_PLACEHOLDER|$WEB_PORT|g"           /etc/nginx/sites-available/tokensee-web
  sed -i "s|API_DOMAIN_PLACEHOLDER|$API_DOMAIN|g"       /etc/nginx/sites-available/tokensee-api
  sed -i "s|API_PORT_PLACEHOLDER|$API_PORT|g"           /etc/nginx/sites-available/tokensee-api

  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/tokensee-web /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/tokensee-api  /etc/nginx/sites-enabled/

  if ! nginx -t 2>&1 | grep -q "syntax is ok"; then
    error "Nginx 配置有误："
    nginx -t
    return 1
  fi

  systemctl reload nginx
  ok "Nginx 已重载"

  # 验证
  echo ""
  info "验证服务..."
  sleep 2
  if curl -sf "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
    ok "后端 API 健康检查通过"
  else
    warn "后端 API 未响应，运行 pm2 logs tokensee-api 查看"
  fi

  mark_done "step4"

  sep "部署完成！"
  echo ""
  echo -e "  ${GREEN}前端：${NC}  http://$DOMAIN"
  echo -e "  ${GREEN}API：${NC}   http://$API_DOMAIN"
  echo ""
  echo -e "  ${CYAN}进程管理：${NC}   pm2 list / pm2 logs / pm2 restart all"
  echo -e "  ${CYAN}日志目录：${NC}   /var/log/tokensee/"
  echo ""
  echo -e "  ${YELLOW}下一步申请 SSL：${NC}"
  echo -e "    certbot --nginx -d $DOMAIN -d $API_DOMAIN"
  echo ""
}

# ── 运维操作 ──────────────────────────────────────────
do_pm2_start() {
  info "启动所有 PM2 服务..."
  cd "$INSTALL_DIR"
  docker-compose start 2>/dev/null || true
  set -a; source "$INSTALL_DIR/.env.production" 2>/dev/null || true; set +a
  pm2 start tokensee-api.cjs --env production 2>/dev/null || pm2 resurrect
  ok "服务已启动"
}

do_pm2_restart() {
  info "重启所有服务..."
  cd "$INSTALL_DIR"
  docker-compose restart 2>/dev/null || true
  pm2 restart tokensee-api
  pm2 restart tokensee-web
  ok "服务已重启"
}

do_pm2_stop() {
  info "停止所有服务..."
  pm2 stop tokensee-api tokensee-web 2>/dev/null || true
  ok "服务已停止"
}

do_pm2_logs() {
  echo ""
  echo "── tokensee-api 日志 (最后 50 行) ──"
  pm2 logs tokensee-api --nostream --lines 50 2>/dev/null || echo "(无日志)"
  echo ""
  echo "── tokensee-web 日志 (最后 50 行) ──"
  pm2 logs tokensee-web --nostream --lines 50 2>/dev/null || echo "(无日志)"
}

do_pm2_list() {
  pm2 list
}

do_validate() {
  sep "验证部署状态"
  FAILED=0
  load_config

  curl_test() {
    local url=$1 label=$2
    if curl -sf --resolve "${3:-}:80:127.0.0.1" "$url" 2>/dev/null | head -1 | grep -q "200\|301\|302\|ok"; then
      ok "$label OK"
    else
      error "$label FAILED"
      FAILED=1
    fi
  }

  # 数据库容器
  docker exec tokensee_postgres pg_isready -U tokensee &>/dev/null && ok "PostgreSQL 容器 OK" || { error "PostgreSQL FAILED"; FAILED=1; }
  docker exec tokensee_redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null | grep -q PONG && ok "Redis 容器 OK" || { error "Redis FAILED"; FAILED=1; }

  # 本地端口
  curl_test "http://127.0.0.1:$API_PORT/health" "后端 API (127.0.0.1:$API_PORT)"
  curl_test "http://127.0.0.1:$WEB_PORT/"        "前端 (127.0.0.1:$WEB_PORT)"

  # Nginx 域名（域名未解析到本机时会失败）
  curl_test "http://$DOMAIN/"       "Nginx 前端 ($DOMAIN)" "$DOMAIN"
  curl_test "http://$API_DOMAIN/health" "Nginx API ($API_DOMAIN)" "$API_DOMAIN"

  echo ""
  if [[ $FAILED -eq 0 ]]; then
    echo -e "  ${GREEN}✓ 所有检查通过！${NC}"
  else
    echo -e "  ${YELLOW}⚠ 部分检查失败，请排查${NC}"
  fi
}

# ── 交互式配置 ─────────────────────────────────────────
interactive_config() {
  sep "配置信息"

  read -p "安装目录 [/opt/tokensee]: " INPUT
  INSTALL_DIR=${INPUT:-/opt/tokensee}

  read -p "前端域名 [tokensee.com]: " DOMAIN
  DOMAIN=${DOMAIN:-tokensee.com}

  read -p "API 域名 [api.tokensee.com]: " API_DOMAIN
  API_DOMAIN=${API_DOMAIN:-api.tokensee.com}

  read -p "后端端口 [3080]: " API_PORT
  API_PORT=${API_PORT:-3080}

  read -p "前端端口 [3081]: " WEB_PORT
  WEB_PORT=${WEB_PORT:-3081}

  read -p "GitHub Token（私有仓库或网络受限必填）: " GH_TOKEN

  echo ""
  info "以下 API Key 全部可选，回车留空即可跳过"
  read -p "Alchemy API Key: " ALCHEMY_KEY
  read -p "Etherscan API Key: " ETHERSCAN_KEY
  read -p "CoinGecko API Key: " COINGECKO_KEY
  read -p "BSCScan API Key: " BSCSCAN_KEY
  read -p "QuickNode BSC URL: " QUICKNODE_BSC_URL
  read -p "Dune API Key: " DUNE_API_KEY
  read -p "DeBank API Key: " DEBANK_API_KEY
  read -p "Arkham API Key: " ARKHAM_KEY
  read -p "TheGraph API Key: " THEGRAPH_API_KEY
  read -p "GoPlus App Key: " GOPLUS_APP_KEY
  read -p "GoPlus App Secret: " GOPLUS_APP_SECRET

  PG_PASSWORD=""
  REDIS_PASSWORD=""
  REDIS_URL=""
  API_SALT=""

  save_config
}

# ── 主循环 ─────────────────────────────────────────────
main() {
  # 尝试加载已有配置
  if load_config; then
    sep "已加载已有配置"
    echo "  安装目录: $INSTALL_DIR"
    echo "  前端:     http://$DOMAIN"
    echo "  API:      http://$API_DOMAIN"
    echo "  端口:     API=$API_PORT  前端=$WEB_PORT"
    echo ""
    while IFS= read -r -n1 -p "使用该配置进入菜单？[Y/n] " yn; do
      echo ""
      [[ "$yn" =~ ^[Nn]$ ]] && break 2
      [[ "$yn" =~ ^[Yy]$ ]] && break
    done
  else
    interactive_config
  fi

  while true; do
    show_menu
    echo -n "请选择 [0-12]: "
    read -r choice

    case $choice in
      1)  do_step1 ;;
      2)  do_step2 ;;
      3)  do_step3 ;;
      4)  do_step4 ;;
      5)  do_step1 && do_step2 && do_step3 && do_step4 ;;
      6)  do_pm2_start ;;
      7)  do_pm2_restart ;;
      8)  do_pm2_stop ;;
      9)  do_pm2_list ;;
     10)  do_pm2_logs ;;
     11)  do_validate ;;
     12)  interactive_config ;;
      0)  echo "再见！"; exit 0 ;;
      *)  error "无效选项，请选择 0-12";;
    esac

    echo ""
    echo -n "按回车继续..."
    read -r
  done
}

main "$@"
