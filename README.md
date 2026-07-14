# online-mahjong

在线麻将（非商用练手项目）。Web + 移动端；多玩法可扩展（垃圾胡 → 血战到底）；AI 与真人混桌；多局并行。

技术栈：TypeScript monorepo（pnpm + Turborepo）· 纯函数引擎（事件溯源）· NestJS + Socket.IO · React · Supabase(PG/OAuth) · Render。

## Quickstart

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm cli:play --seed 47
pnpm fuzz --seed 47 --games 10000
```

`cli:play` 输出可重放的 seed、config 与 action log；可用 `--config '<json>'` 和 `--actions '<json>'` 覆盖输入。`fuzz` 随机覆盖 junk config；失败时输出固化为回归用例所需的 seed/config/action log。

## 文档阅读路径

1. `docs/architecture.md` —— 系统怎么运转（一页纸）
2. `docs/decisions.md` —— 为什么这样设计
3. `docs/` 规格四件套 —— 做事时查的契约
4. 协作流程：`docs/workflow.md`；文档规则：`docs/doc-map.md`

`CLAUDE.md` 为 AI 会话规范，不在人的必读路径。

## 状态

阶段 1（引擎基建 + junk RuleSet + CLI fuzz）已完成。下一阶段是血战到底 RuleSet；阶段路线见 `docs/plan.md`。
