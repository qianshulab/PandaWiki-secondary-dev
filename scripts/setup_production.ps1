param(
  [switch]$Help,
  [switch]$Start,
  [switch]$NoStart,
  [switch]$Auto
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
PandaWiki 生产环境初始化脚本

用法：
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1 -Start
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1 -NoStart
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1 -Auto -Start
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_production.ps1 -Auto -NoStart

功能：
  1. 交互式或自动生成生产密码/密钥
  2. 生成 deploy/production/.env
  3. 如 .env 已存在，自动备份
  4. 可选择执行 docker compose up -d --build

参数：
  -Auto     自动生成所有生产密码/密钥，行为更接近原版安装器
  -Start    生成配置后立即构建并启动
  -NoStart  仅生成配置，不启动

注意：
  - .env 会保存明文密码，Docker Compose 需要读取；请妥善保护服务器文件权限。
  - 为兼容 docker-compose v1/v2，密码仅允许安全字符：
    A-Z a-z 0-9 . _ ~ ! @ % + = : , / -
"@
}

if ($Help) {
  Show-Help
  exit 0
}

function Get-RepoRoot {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
  return (Resolve-Path (Join-Path $scriptDir "..")).Path
}

function ConvertTo-PlainText([Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function New-SafeSecret([int]$Length = 40) {
  $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  $bytes = New-Object byte[] ($Length)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $out = New-Object System.Text.StringBuilder
  foreach ($b in $bytes) {
    [void]$out.Append($chars[$b % $chars.Length])
  }
  return $out.ToString()
}

function Test-SafeSecret([string]$value) {
  return $value -match '^[A-Za-z0-9._~!@%+=:,/-]+$'
}

function Test-ComposeVersionAtLeast2([string]$value) {
  $m = [regex]::Match($value, 'v?(\d+)(\.\d+){0,2}')
  if (-not $m.Success) {
    return $false
  }
  return ([int]$m.Groups[1].Value -ge 2)
}

function Read-RequiredSecret([string]$Name, [int]$MinLength = 12) {
  while ($true) {
    $secure1 = Read-Host "请输入 $Name" -AsSecureString
    $value1 = ConvertTo-PlainText $secure1

    if ([string]::IsNullOrWhiteSpace($value1)) {
      Write-Host "不能为空，请重新输入。" -ForegroundColor Yellow
      continue
    }
    if ($value1.Length -lt $MinLength) {
      Write-Host "长度至少 $MinLength 位，请重新输入。" -ForegroundColor Yellow
      continue
    }
    if (-not (Test-SafeSecret $value1)) {
      Write-Host "包含不兼容字符。仅允许 A-Z a-z 0-9 . _ ~ ! @ % + = : , / -" -ForegroundColor Yellow
      continue
    }

    $secure2 = Read-Host "请再次输入 $Name" -AsSecureString
    $value2 = ConvertTo-PlainText $secure2
    if ($value1 -ne $value2) {
      Write-Host "两次输入不一致，请重新输入。" -ForegroundColor Yellow
      continue
    }
    return $value1
  }
}

function Read-OptionalSecret([string]$Name, [int]$MinLength = 32, [int]$GenerateLength = 48) {
  while ($true) {
    $secure1 = Read-Host "请输入 $Name（直接回车则自动生成）" -AsSecureString
    $value1 = ConvertTo-PlainText $secure1

    if ([string]::IsNullOrWhiteSpace($value1)) {
      return New-SafeSecret $GenerateLength
    }
    if ($value1.Length -lt $MinLength) {
      Write-Host "长度至少 $MinLength 位，请重新输入；或直接回车自动生成。" -ForegroundColor Yellow
      continue
    }
    if (-not (Test-SafeSecret $value1)) {
      Write-Host "包含不兼容字符。仅允许 A-Z a-z 0-9 . _ ~ ! @ % + = : , / -" -ForegroundColor Yellow
      continue
    }

    $secure2 = Read-Host "请再次输入 $Name" -AsSecureString
    $value2 = ConvertTo-PlainText $secure2
    if ($value1 -ne $value2) {
      Write-Host "两次输入不一致，请重新输入。" -ForegroundColor Yellow
      continue
    }
    return $value1
  }
}

function Find-ComposeCommand {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "未检测到 docker，请先安装 Docker Desktop 或 Docker Engine。"
  }

  $dockerComposeWorks = $false
  try {
    & docker compose version *> $null
    $dockerComposeWorks = ($LASTEXITCODE -eq 0)
  } catch {
    $dockerComposeWorks = $false
  }

  if ($dockerComposeWorks) {
    return @{ Exe = "docker"; Args = @("compose") }
  }

  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $legacyVersion = ""
    try {
      $legacyVersion = (& docker-compose version --short 2>$null | Select-Object -First 1)
      if ([string]::IsNullOrWhiteSpace($legacyVersion)) {
        $legacyVersion = (& docker-compose version 2>$null | Select-Object -First 1)
      }
    } catch {
      $legacyVersion = "unknown"
    }

    if (Test-ComposeVersionAtLeast2 $legacyVersion) {
      return @{ Exe = "docker-compose"; Args = @() }
    }

    throw @"
检测到旧版 docker-compose：$legacyVersion。
本生产部署默认要求 Docker Compose v2+。

Windows / Docker Desktop：
  请启动 Docker Desktop，并确认命令行可执行：docker compose version

Linux / WSL：
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
  docker compose version
"@
  }

  throw @"
未检测到 Docker Compose v2+。

Windows / Docker Desktop：
  请启动 Docker Desktop，并确认命令行可执行：docker compose version

Linux / WSL：
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
  docker compose version
"@
}

function Invoke-Compose([hashtable]$Compose, [string[]]$ExtraArgs, [string]$WorkDir) {
  Push-Location $WorkDir
  try {
    & $Compose.Exe @($Compose.Args + $ExtraArgs)
    if ($LASTEXITCODE -ne 0) {
      throw "Docker Compose 执行失败，退出码：$LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$repoRoot = Get-RepoRoot
$deployDir = Join-Path $repoRoot "deploy\production"
$envPath = Join-Path $deployDir ".env"

if (-not (Test-Path (Join-Path $deployDir "docker-compose.yml"))) {
  throw "未找到 deploy/production/docker-compose.yml，请确认从项目根目录执行。"
}

Write-Host "PandaWiki 生产环境初始化" -ForegroundColor Cyan
Write-Host "项目目录：$repoRoot"
Write-Host ""
if ($Auto) {
  Write-Host "将自动生成生产密码/密钥。" -ForegroundColor Cyan
  Write-Host ""
  $adminPassword = New-SafeSecret 24
  $postgresPassword = New-SafeSecret 32
  $natsPassword = New-SafeSecret 32
  $s3Password = New-SafeSecret 32
  $qdrantApiKey = New-SafeSecret 32
  $jwtSecret = New-SafeSecret 64
} else {
  Write-Host "请设置以下生产密码。输入过程不会显示明文。" -ForegroundColor Cyan
  Write-Host ""

  $adminPassword = Read-RequiredSecret "后台 admin 密码 ADMIN_PASSWORD" 12
  $postgresPassword = Read-RequiredSecret "PostgreSQL 密码 POSTGRES_PASSWORD" 16
  $natsPassword = Read-RequiredSecret "NATS 密码 NATS_PASSWORD" 16
  $s3Password = Read-RequiredSecret "MinIO/S3 密码 S3_SECRET_KEY/MINIO_ROOT_PASSWORD" 16
  $qdrantApiKey = Read-RequiredSecret "Qdrant API Key QDRANT_API_KEY" 16
  $jwtSecret = Read-OptionalSecret "JWT_SECRET" 32 64
}

if (Test-Path $envPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = "$envPath.bak.$stamp"
  Copy-Item -LiteralPath $envPath -Destination $backupPath
  Write-Host "已备份原 .env：$backupPath" -ForegroundColor Yellow
}

$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$envContent = @"
# Generated by scripts/setup_production.ps1 at $generatedAt
# Do not commit this file. It contains production secrets.

POSTGRES_PASSWORD=$postgresPassword
NATS_PASSWORD=$natsPassword
QDRANT_API_KEY=$qdrantApiKey
JWT_SECRET=$jwtSecret

# MinIO root user must stay aligned with compose service defaults used by API/RAGLite/Crawler.
MINIO_ROOT_USER=s3panda-wiki
MINIO_ROOT_PASSWORD=$s3Password
S3_SECRET_KEY=$s3Password

ADMIN_PASSWORD=$adminPassword
"@

Set-Content -LiteralPath $envPath -Value $envContent -Encoding UTF8
Write-Host ""
Write-Host "已生成生产配置：$envPath" -ForegroundColor Green
Write-Host "后台账号：admin" -ForegroundColor Green
Write-Host "后台密码：$adminPassword" -ForegroundColor Green

$shouldStart = $false
if ($Start) {
  $shouldStart = $true
} elseif ($NoStart) {
  $shouldStart = $false
} else {
  $answer = Read-Host "是否现在构建并启动生产服务？输入 y 启动，其他键跳过"
  $shouldStart = ($answer -match '^(y|Y|yes|YES)$')
}

if ($shouldStart) {
  try {
    $compose = Find-ComposeCommand
    Write-Host "Docker Compose：$($compose.Exe) $($compose.Args -join ' ')" -ForegroundColor Green
  } catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "配置文件已生成；安装 Docker/Compose 后可手动执行：cd deploy/production && docker compose up -d --build" -ForegroundColor Yellow
    exit 1
  }

  Write-Host "开始构建并启动生产服务..." -ForegroundColor Cyan
  Invoke-Compose $compose @("up", "-d", "--build") $deployDir
  Write-Host ""
  Write-Host "服务状态：" -ForegroundColor Cyan
  Invoke-Compose $compose @("ps") $deployDir
  Write-Host ""
  Write-Host "后台入口：https://服务器IP:2443/login" -ForegroundColor Green
  Write-Host "后台账号：admin" -ForegroundColor Green
  Write-Host "后台密码：$adminPassword" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "已跳过启动。后续可执行：" -ForegroundColor Yellow
  Write-Host "  cd deploy/production"
  Write-Host "  docker compose up -d --build"
}
