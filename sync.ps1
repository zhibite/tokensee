# ============================================================
# TokenSee — 本地同步脚本（push → 服务器自动拉取部署）
# 用法:
#   .\sync.ps1            # 同步全部
#   .\sync.ps1 api        # 仅后端
#   .\sync.ps1 web        # 仅前端
#   .\sync.ps1 skip-build # 仅 push，不触发服务器构建
# ============================================================

param(
    [ValidateSet("api", "web", "all", "skip-build")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# ── 服务器配置 ────────────────────────────────────────
$SSH_HOST = "217.216.79.175"
$SSH_USER = "root"
$SSH_KEY  = "$env:USERPROFILE\.ssh\id_ed25519"   # 优先使用 SSH key
$SSH_KEY_RSA = "$env:USERPROFILE\.ssh\id_rsa"
$INSTALL_DIR = "/opt/tokensee"

# Git 自带 SSH/SCP（Windows 默认 PATH 可能找不到）
$SSH_EXE  = "$env:ProgramFiles\Git\usr\bin\ssh.exe"
$SCP_EXE  = "$env:ProgramFiles\Git\usr\bin\scp.exe"

# 检测可用 SSH key
$SSH_KEY_PATH = $null
if (Test-Path $SSH_KEY)    { $SSH_KEY_PATH = $SSH_KEY }
elseif (Test-Path $SSH_KEY_RSA) { $SSH_KEY_PATH = $SSH_KEY_RSA }

# SSH 基础参数
$SSH_ARGS = @("-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")
if ($SSH_KEY_PATH) { $SSH_ARGS = @("-i", $SSH_KEY_PATH) + $SSH_ARGS }

function Invoke-Ssh {
    param([string]$Host, [string]$Cmd)
    & $SSH_EXE $SSH_ARGS "$Host" $Cmd 2>&1
}

# ── 彩色输出 ──────────────────────────────────────────
function Write-Info  ($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-OK    ($msg) { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  ($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── 步骤 1：Git push ─────────────────────────────────
function Push-Code {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor DarkGray
    Write-Host " 步骤 1 / 2 — Git push" -ForegroundColor White
    Write-Host "══════════════════════════════════════" -ForegroundColor DarkGray

    Set-Location $ProjectRoot

    $status = git status --porcelain
    if (-not $status) {
        Write-Warn "没有检测到代码变更，跳过 commit/push。"
        return $false
    }

    Write-Info "变更文件："
    $status | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

    # 检查远程分支
    $currentBranch = git branch --show-current
    if (-not $currentBranch) { $currentBranch = "main" }

    Write-Info "当前分支: $currentBranch"

    # Add + commit
    git add -A
    $commitMsg = "chore: deploy sync $(Get-Date -Format 'yyyy-MM-dd HH:mm') target=$Target"
    git commit -m $commitMsg
    Write-OK "已提交: $commitMsg"

    # Push
    Write-Info "推送到 origin/$currentBranch ..."
    git push origin $currentBranch
    Write-OK "Push 完成"

    return $true
}

# ── 步骤 2：SSH 触发服务器同步 ───────────────────────
function Trigger-ServerSync {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor DarkGray
    Write-Host " 步骤 2 / 2 — 触发服务器同步" -ForegroundColor White
    Write-Host "══════════════════════════════════════" -ForegroundColor DarkGray

    if ($Target -eq "skip-build") {
        Write-Warn "skip-build 模式，仅 push，不触发服务器构建"
        return
    }

    Write-Info "SSH → $SSH_USER@$SSH_HOST ..."
    Write-Info "执行: bash $INSTALL_DIR/sync.sh $Target"

    # 构造 SSH 命令
    $remoteCmd = "bash $INSTALL_DIR/sync.sh $Target 2>&1"
    $sshArgs = @("$SSH_USER@$SSH_HOST", $remoteCmd)

    if ($SSH_KEY_PATH) {
        $fullArgs = @("-i", $SSH_KEY_PATH, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes") + $sshArgs
        Write-Info "使用 SSH key: $SSH_KEY_PATH"
    } else {
        $fullArgs = @("-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes") + $sshArgs
        Write-Warn "未找到 SSH key，将尝试 ssh-agent 或交互输入密码"
    }

    try {
        $remoteCmd = "bash $INSTALL_DIR/sync.sh $Target 2>&1"
        $result = Invoke-Ssh -Host "$SSH_USER@$SSH_HOST" -Cmd $remoteCmd
        $exitCode = $LASTEXITCODE

        # 输出实时回显
        $result | ForEach-Object { Write-Host $_ }

        if ($exitCode -eq 0) {
            Write-OK "服务器同步完成 ✓"
        } else {
            Write-Err "服务器同步失败（exit $exitCode）"
            Write-Host ""
            Write-Host "常见问题排查：" -ForegroundColor Yellow
            Write-Host "  1. 确认 ~/.ssh/id_rsa 已配置到服务器" -ForegroundColor DarkGray
            Write-Host "  2. 手动测试: ssh $SSH_USER@$SSH_HOST" -ForegroundColor DarkGray
            Write-Host "  3. 或手动在服务器执行: bash $INSTALL_DIR/sync.sh $Target" -ForegroundColor DarkGray
        }
    } catch {
        Write-Err "SSH 执行失败: $_"
        Write-Host ""
        Write-Host "备选方案 — 请手动在服务器执行：" -ForegroundColor Yellow
        Write-Host "  ssh $SSH_USER@$SSH_HOST" -ForegroundColor DarkGray
        Write-Host "  bash $INSTALL_DIR/sync.sh $Target" -ForegroundColor DarkGray
    }
}

# ── 主流程 ────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "  TokenSee 同步 — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  TARGET=$Target" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkGray

if ($Target -ne "skip-build") {
    $pushed = Push-Code
    Trigger-ServerSync
} else {
    $pushed = Push-Code
    if ($pushed) {
        Write-Info "skip-build: 仅 push，跳过服务器构建"
    }
}

Write-Host ""
Write-OK "全部完成！"
Write-Host ""
Write-Host "  前端:  https://tokensee.com" -ForegroundColor DarkGray
Write-Host "  API:   https://api.tokensee.com/health" -ForegroundColor DarkGray
