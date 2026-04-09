#!/bin/bash
# ============================================================
# TokenSee — 生产同步脚本
# 用法: bash sync.sh [api|web|all]
# 默认同步全部（后端 + 前端）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$SCRIPT_DIR}"
API_PORT="${API_PORT:-3080}"
WEB_PORT="${WEB_PORT:-3081}"
DOMAIN="${DOMAIN:-tokensee.com}"
API_DOMAIN="${API_DOMAIN:-api.tokensee.com}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── 加载部署配置（如有）──────────────────────────────
CONFIG_FILE="$INSTALL_DIR/.deploy-config.env"
[[ -f "$CONFIG_FILE" ]] && set -a && source "$CONFIG_FILE" && set +a

# ── Git pull ─────────────────────────────────────────
git_pull() {
  info "拉取最新代码..."
  cd "$INSTALL_DIR"

  # 检测当前分支（避免服务器是 master 而非 main）
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "master")
  info "当前分支: $CURRENT_BRANCH"

  git stash push -m "sync-$(date +%Y%m%d%H%M%S)-auto" -- .env .env.production .deploy-config.env 2>/dev/null || true
  git pull origin "$CURRENT_BRANCH" --rebase || {
    warn "pull 失败，尝试强制更新..."
    git fetch origin "$CURRENT_BRANCH"
    git reset --hard "origin/$CURRENT_BRANCH"
  }
  # 恢复生产环境变量（不覆盖新代码中的默认值）
  if [[ -f "$INSTALL_DIR/.deploy-config.env" ]]; then
    set -a && source "$INSTALL_DIR/.deploy-config.env" && set +a
    info "已加载部署配置 — API_PORT=$API_PORT  WEB_PORT=$WEB_PORT"
  fi
}

# ── 编译后端 ─────────────────────────────────────────
build_api() {
  info "编译后端 (PORT=$API_PORT)..."
  npm install --prefix "$INSTALL_DIR" 2>&1 | tail -3
  if ! npm run build --prefix "$INSTALL_DIR" 2>&1 | tail -5; then
    error "后端编译失败，跳过后端更新"
    return 1
  fi
  ok "后端编译完成"

  # 数据库迁移（如表缺失则自动创建）
  info "运行数据库迁移..."
  cd "$INSTALL_DIR"
  if npm run migrate 2>&1 | tail -15; then
    ok "数据库迁移完成"
  else
    warn "迁移失败（表可能已存在）"
  fi
}

# ── 编译前端 ─────────────────────────────────────────
build_web() {
  info "编译前端 (API_PROXY_TARGET=http://127.0.0.1:$API_PORT)..."
  cd "$INSTALL_DIR/web"
  npm install 2>&1 | tail -3
  if ! API_PROXY_TARGET="http://127.0.0.1:$API_PORT" npm run build 2>&1 | tail -10; then
    error "前端编译失败，跳过前端更新"
    return 1
  fi
  ok "前端编译完成"
}

# ── 重启 PM2 ─────────────────────────────────────────
restart_pm2() {
  info "重启 PM2 服务..."
  cd "$INSTALL_DIR"

  # 找到 ecosystem 文件
  API_ECOSYSTEM=$(ls "$INSTALL_DIR"/ecosystem.api*.cjs 2>/dev/null | head -1)
  WEB_ECOSYSTEM=$(ls "$INSTALL_DIR"/ecosystem.web*.cjs 2>/dev/null | head -1)

  # 兼容旧名 tokensee-api.cjs / tokensee-web.cjs
  [[ -z "$API_ECOSYSTEM" ]] && [[ -f "$INSTALL_DIR/tokensee-api.cjs" ]] && API_ECOSYSTEM="$INSTALL_DIR/tokensee-api.cjs"
  [[ -z "$WEB_ECOSYSTEM" ]] && [[ -f "$INSTALL_DIR/tokensee-web.cjs" ]] && WEB_ECOSYSTEM="$INSTALL_DIR/tokensee-web.cjs"

  if [[ -n "$API_ECOSYSTEM" ]] && [[ -f "$API_ECOSYSTEM" ]]; then
    info "重启 tokensee-api ($API_ECOSYSTEM)..."
    pm2 delete tokensee-api 2>/dev/null || true
    pm2 start "$API_ECOSYSTEM"
  else
    warn "未找到 API ecosystem 文件，跳过"
  fi

  if [[ -n "$WEB_ECOSYSTEM" ]] && [[ -f "$WEB_ECOSYSTEM" ]]; then
    info "重启 tokensee-web ($WEB_ECOSYSTEM)..."
    pm2 delete tokensee-web 2>/dev/null || true
    pm2 start "$WEB_ECOSYSTEM"
  else
    warn "未找到 Web ecosystem 文件，跳过"
  fi

  sleep 3
  pm2 save
  ok "PM2 服务已重启"
}

# ── 健康检查 ─────────────────────────────────────────
health_check() {
  local api_ok=false web_ok=false
  info "健康检查..."

  if curl -sf "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
    ok "后端 API (127.0.0.1:$API_PORT/health) — OK"
    api_ok=true
  else
    error "后端 API (127.0.0.1:$API_PORT/health) — FAIL"
  fi

  if curl -sf -H "Host: $DOMAIN" "http://127.0.0.1:$WEB_PORT/" 2>/dev/null | grep -q "html\|200"; then
    ok "前端 (127.0.0.1:$WEB_PORT) — OK"
    web_ok=true
  else
    warn "前端健康检查跳过（请通过 https://$DOMAIN 验证）"
  fi

  if $api_ok; then
    pm2 describe tokensee-api | grep -E "status|online" | head -2
  fi
}

# ── 主流程 ────────────────────────────────────────────
TARGET="${1:-all}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e " ${BOLD}TokenSee 生产同步 — $(date '+%Y-%m-%d %H:%M:%S')  TARGET=$TARGET${NC}"
echo "════════════════════════════════════════════════════════════"

case "$TARGET" in
  api)
    git_pull
    build_api
    restart_pm2
    health_check
    ;;
  web)
    git_pull
    build_web
    restart_pm2
    health_check
    ;;
  all|"")
    git_pull
    build_api
    build_web
    restart_pm2
    health_check
    ;;
  *)
    echo "用法: bash sync.sh [api|web|all]"; exit 1 ;;
esac

ok "同步完成 — $(date '+%Y-%m-%d %H:%M:%S')"
