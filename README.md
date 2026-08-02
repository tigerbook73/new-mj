# online-mahjong

在线麻将（非商用练手项目）。Web + 移动端；多玩法可扩展（垃圾胡 → 血战到底）；AI 与真人混桌；多局并行。

技术栈：TypeScript monorepo（pnpm + Turborepo）· 纯函数引擎（事件溯源）· NestJS + Socket.IO · React · Supabase(PG/OAuth) · Render。

## Quickstart

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm format          # 写入格式
pnpm format:check    # 仅校验格式
pnpm cli:junk:play --seed 47
pnpm fuzz:junk --seed 47 --games 10000
```

`cli:junk:play` 输出可重放的 seed、config 与 action log；可用 `--config '<json>'` 和 `--actions '<json>'` 覆盖输入。`fuzz:junk` 随机覆盖 junk config；失败时输出固化为回归用例所需的 seed/config/action log。这两个命令是 junk 的 core 开发/诊断工具，不是通用多玩法 CLI。

## 文档阅读路径

1. `docs/overview.md` —— 项目入口与阅读地图
2. `docs/contracts/` + `docs/variants/` —— 做事时查的契约与规则
3. 协作流程：`docs/process/workflow.md`；文档规则：`docs/doc-map.md`

`CLAUDE.md` 为 AI 会话规范，不在人的必读路径。

## 部署

变量名清单见 `.env.example`；生产环境变量由部署平台（Render）直接注入，不读取仓库里的文件。需要在本地留一份生产环境变量的备份/核对副本时，命名为 `.env.production.local`（gitignored，不需要现在创建）。

## 状态

Junk 与 bloodbattle RuleSet、Web 对局、持久化和本地 OAuth 验收均已完成；当前工作与 Backlog 见 `docs/process/plan.md`。
