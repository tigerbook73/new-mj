# online-mahjong

在线麻将（非商用练手项目）。Web + 移动端；多玩法可扩展（垃圾胡 → 血战到底）；AI 与真人混桌；多局并行。

技术栈：TypeScript monorepo（pnpm + Turborepo）· 纯函数引擎（事件溯源）· NestJS + Socket.IO · React · Supabase(PG/OAuth) · Render。

## Quickstart（阶段 1 落地后补齐命令）

```bash
pnpm install
pnpm test          # 全部测试
pnpm fuzz -n 100   # 随机 AI 互打 100 局（占位，以实际脚本为准）
pnpm cli:play      # CLI 观看一局（占位）
```

## 文档阅读路径

1. `docs/architecture.md` —— 系统怎么运转（一页纸）
2. `docs/decisions.md` —— 为什么这样设计
3. `docs/` 规格四件套 —— 做事时查的契约
4. 协作流程：`docs/workflow.md`；文档规则：`docs/doc-map.md`

`CLAUDE.md` 为 AI 会话规范，不在人的必读路径。

## 状态

阶段 1（引擎基建 + 垃圾胡 RuleSet）未开始。阶段路线见 `docs/plan.md`。
