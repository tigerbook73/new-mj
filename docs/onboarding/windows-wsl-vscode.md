# Windows + WSL + VS Code 开发环境

本指南帮助新成员在一台新的 Windows 机器上运行 `new-mj`。默认先使用昵称登录完成最小闭环；本地数据库和 Google/GitHub OAuth 是后续可选项。

所有项目命令都在 **WSL 终端**中运行。不要在 PowerShell、Git Bash 或 Windows 版 VS Code 终端中混用 Node、pnpm 和项目文件。

## 一、预先准备

### 1. Windows 软件

安装并启动：

- WSL 2，建议 Ubuntu；
- Docker Desktop，启用 WSL 2 backend，并在 Settings → Resources → WSL Integration 中启用当前 Ubuntu；
- VS Code；
- VS Code 扩展 `WSL`（扩展 ID：`ms-vscode-remote.remote-wsl`）。

在 WSL 中确认 Docker Desktop 已连通：

```bash
docker version
docker compose version
```

如果 `docker` 不存在或无法连接 daemon，先修复 Docker Desktop 的 WSL Integration，不要在 WSL 中再安装第二套 Docker daemon。

### 2. 在 WSL 中安装 Git、nvm 和 Node 24

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

按照 nvm 官方说明安装 nvm，重新打开 WSL 终端后执行：

```bash
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@10.33.3 --activate
```

仓库的 `.nvmrc` 固定 Node 24，`package.json` 固定 pnpm 10.33.3。不要使用 Windows 中已安装的 Node 或 pnpm。

### 3. 克隆到 WSL 文件系统

仓库是 public 时，读取、clone 和本地运行都不需要 GitHub 仓库授权：

```bash
mkdir -p ~/code
cd ~/code
git clone <仓库地址> new-mj
cd new-mj
```

项目应位于 `~/code/new-mj` 一类的 Linux 路径，不要放在 `/mnt/c/...`；后者的依赖安装、文件监听和 Playwright 通常更慢。

从仓库目录打开 VS Code：

```bash
code .
```

VS Code 左下角应显示 `WSL: Ubuntu`。在 VS Code 集成终端中执行 `pwd`，路径应是 `/home/...`，而不是 `C:\...`。

如果对方需要提交代码，有两种方式：

- 直接分支协作：owner 在 GitHub 仓库 `Settings → Collaborators` 邀请对方；对方接受后可向仓库推送 feature branch，再开 Pull Request。建议保护 `main`，不要允许直接推送。
- Fork 协作：对方 fork public repo，在自己的 fork 推送分支，再向本仓库开 Pull Request；不需要本仓库写权限。

仓库权限只控制 Git 操作，不会交付 OAuth secret、部署环境变量或 GitHub Actions secrets。这些凭据仍需按最小权限原则单独配置或通过密码管理器交付。

## 二、执行 bootstrap 脚本

脚本会在本机配置不存在时，从无 secret 模板创建 `.env.development.local`，使首次启动明确走无数据库/昵称登录模式；随后检查 WSL、Node、pnpm 和 Git，并执行锁文件安装及构建。它不会覆盖已有配置、启动服务、写入 secret 或改数据库。

```bash
bash docs/onboarding/scripts/bootstrap-wsl.sh
```

成功时最后会显示 `bootstrap complete`。

如果只想检查环境而不安装依赖：

```bash
bash docs/onboarding/scripts/doctor-wsl.sh
```

修复脚本报告的 `FAIL` 后重新运行 bootstrap。`WARN` 表示对应的可选能力尚不可用，不阻止最小开发闭环。

## 三、启动最小开发环境

```bash
pnpm dev
```

默认地址：

- Web：<http://localhost:5173>
- Server：<http://localhost:3000>

打开 Web，使用页面下方的 `Dev login` 输入昵称。该路径不依赖 Docker、Supabase 或 OAuth，足以开发和联调实时对局。

在另一个 WSL 终端验证正在运行的服务：

```bash
bash docs/onboarding/scripts/doctor-wsl.sh --running
```

server 未连接数据库时 `/health` 会返回 `ok: false`；doctor 会明确标为警告，不把它误报成 server 未启动。

使用启动终端中的 `Ctrl+C` 停止开发服务。不要批量结束机器上的全部 Node 进程。

## 四、启用本地数据库和 Supabase Auth（可选）

### 1. 准备本机 Supabase 环境文件

```bash
cp supabase/.env.example supabase/.env
```

只使用昵称登录时四个值可以暂时留空。需要社交登录时，填写相应 provider 的 client ID 和 secret：

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=
```

`supabase/.env` 已被 Git 忽略。不要把真实 secret 写入被跟踪的 `.env`、`.env.example`，也不要通过聊天或 issue 发送。

### 2. 启动并迁移

bootstrap 生成的 `.env.development.local` 会用空值覆盖仓库 `.env` 中的本地 Supabase 默认值。启用完整本地栈前，编辑 `.env.development.local`，删除其中这五个空值覆盖，让应用回退到仓库 `.env` 中提交的本地开发配置：

```dotenv
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

如果这些变量需要使用与默认本地实例不同的值，则保留变量名并填写自己的值。确认 Docker Desktop 正在运行，然后执行：

```bash
pnpm sb:start
pnpm sb:status
pnpm --filter @new-mj/server exec prisma migrate deploy
```

默认本地端口：

- Supabase API/Auth：`54321`
- PostgreSQL：`54322`
- Supabase Studio：`54323`

重新启动 `pnpm dev` 后验证：

```bash
bash docs/onboarding/scripts/doctor-wsl.sh --running --supabase
```

此时 server health 应报告数据库连接正常。Supabase Studio 位于 <http://localhost:54323>。

停止本地 Supabase：

```bash
pnpm sb:stop
```

### 3. OAuth 回调

在 Google/GitHub 的开发应用中配置 provider callback：

```text
http://localhost:54321/auth/v1/callback
```

登录完成后，Supabase 会把浏览器送回：

```text
http://localhost:5173/auth/callback
```

建议每位开发者使用自己的开发 OAuth app；如需共享，由项目 owner 通过密码管理器交付 secret。

## 五、代码库验证

首次安装后先运行不会写文件的检查：

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

日常提交的完整验收命令是：

```bash
pnpm verify
```

注意：仓库当前的 `pnpm verify` 会先运行 `pnpm format`，因此可能写入格式修复。执行前后都检查：

```bash
git status --short
```

合并到 `main` 前使用包含慢速测试的：

```bash
pnpm verify:full
```

## 六、常见问题

### Docker 正常，但 Supabase 启动失败或 OAuth 指向错误项目

另一套 Supabase 项目可能占用了 `54321`–`54323`。先执行：

```bash
docker ps
pnpm sb:status
curl http://localhost:54321/auth/v1/settings
```

只停止确认属于冲突项目的容器，不要批量删除所有容器。

### `pnpm dev` 提示端口占用

确认是否已有本项目的旧终端仍在运行。同一台机器需要并行开发多个分支时，使用仓库提供的 worktree 工具：

```bash
pnpm worktree:new <kebab-case-name>
pnpm worktree:status
pnpm worktree:doctor
```

不要手工给各应用分配端口；worktree CLI 会统一注入端口配置。

### 浏览器能打开，但社交登录失败

昵称登录与 OAuth 相互独立。先用昵称登录确认 Web ↔ Server 工作，再检查 `supabase/.env`、provider callback 和 `pnpm sb:status`。

### 换行符或可执行权限问题

始终从 WSL 内克隆和运行脚本。本指南统一使用 `bash <script>`，不依赖 Git 是否保留脚本的 executable bit。
