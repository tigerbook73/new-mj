# workflow：流程细则

> 按需阅读：开工看会话仪式，设计/范围变化看专题规则，提交时看 DoD 与 Git。文档归属见 `../doc-map.md`。

## 会话仪式

- 开工：按根 `AGENTS.md` 读取规则和 `plan.md` 当前工作。
- 收工：更新当前状态与下一步第一个具体动作；提交前默认运行 `pnpm verify`。
- “下一步”必须可直接执行，例如“确认生产 OAuth 回调 URL”，不能写“继续开发”。

## 专题与 slice

- 专题表达一个用户/系统目标；slice 是一个可独立演示、可验收的平级交付切片。计划最多展示“专题 → slice”两层，不再嵌套子计划。
- 开场只写：目标、首个 slice 的验收、不可违反约束、已知未知项及最早验证方式。先产出可编译骨架、状态图或竖切，不以长计划替代验证。
- 发现复杂度显著超出估算时，暂停**旧实现路径**而非废弃已完成代码：记录发现、保留可复用资产、把使能工具/架构变更提升为平级 slice；后续产品 slice 负责最终用户验收。
- 判断工具是否独立成 slice：若它改变正式运行时产物、数据模型、验证方式，或会被后续多个 slice 复用，则是使能能力；若只是一次性辅助，留在当前 slice。
- 使能 slice 先做最小可行验证（例如手写一个产物、正式消费者读取它、验证一个典型场景），通过后才扩展编辑器/自动化能力。若涉及契约或架构，先更新对应 docs 再写代码。
- 临时 brief 可放在 `docs/process/<topic>.md`，限一页；专题收尾后把耐久结论分流，删除 brief，不保留实现日记。

## 完成的定义（DoD）

任务宣称完成前全绿并**贴出运行结果**（不得凭记忆断言）：

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`（受影响包）
4. core 改动：fuzz 冒烟 ≥1000 局；专题收尾跑全量 ≥1 万局随机 config；分层策略见 `../testing-strategy.md`

- 测试与实现同一 commit；修 bug 先写复现用例（红→绿）。
- fuzz 失败：先固化 seed + action log 为回归用例，再修复。
- 不追覆盖率指标；追不变量全时校验和规则/番型 fixture。

## 依赖、测试与检查

- 新增或刷新依赖优先最新稳定版；若被 peer 约束，采用最新兼容稳定版并记录原因。同步 `package.json` 与 lockfile。
- pnpm 是唯一包管理器；各 package 依生态选 runner，跨包测试由根脚本调度。core/protocol/ai 优先 Vitest，server 用 Jest，web 用 Vitest + Playwright；mobile 立项时确定。
- 每个 workspace 提供 `typecheck`、`lint`、`test`、`verify`；有运行时产物的 workspace 提供 `build` 并声明 Turbo 输出。根 `pnpm verify` 还包括 `format:check`。
- `pnpm format` 写入格式，`pnpm format:check` 只校验；format 不能代替 lint/typecheck。

## 并行 worktree

- 每个并行 feature 使用独立 Git worktree 与分支；创建器只从明确的已提交 ref 建立，绝不带入另一个 worktree 的未提交改动。
- 私有 workspace 包 `@new-mj/devtools` 是 worktree CLI、slot 推导和 Vite/Playwright 适配的唯一来源；根脚本只调用其 `src/worktree-cli.ts`，使用其库 API 的 app 以 `workspace:*` devDependency 引入。`.worktree.env` 只记录本机 slot，端口由 slot 推导，具体 slot/私有环境不进入 Git。
- `pnpm worktree:new <name> [slot]` 创建 `feat/<name>`、写入本地 slot 配置、安装依赖并构建。省略 slot 时自动选择最小空闲值；显式 slot 已被其他已登记 worktree 使用时失败。主 worktree 没有配置时视为 slot 0。
- 创建器从 Git 列表中的主 worktree 链接根目录中所有被 Git 忽略的 `.env.*` 文件；仓库跟踪的 `.env`、`.env.example`、`.env.test` 不链接。目标已有同名本地文件时保留并提示，绝不覆盖秘密。
- `worktree-cli.ts run <command> [...args]` 负责向任意命令注入当前 slot 的环境；`pnpm dev` 与 `pnpm test:e2e` 已通过它自动读取 slot。不要手写端口或使用特殊后缀。slot 0 使用现有默认端口；其他 slot 使用独立的 dev/e2e web+server 端口对。后者默认每个 worktree 一个 Playwright worker，保证并发时稳定；`pnpm verify` 因此也会自动使用隔离 E2E。`pnpm worktree:status` 列出所有登记项，`pnpm worktree:doctor` 检查重复 slot 与失效环境链接。
- 同一份本地 Supabase 可供普通开发共享；`prisma migrate`、Supabase 配置变更或破坏性数据操作必须独占，或使用明确隔离的实例。

## Git 与专题收尾

- 单人 trunk-based：日常直接 main；仅预期失败的实验或接口探索开短命分支。main 提交前满足 DoD；坏提交 revert，不 force push。
- commit 是可独立描述的变更，使用 conventional message；代码与对应 docs 同 commit；秘密只进 `.env`，提供 `.env.example`。
- 专题完成：可运行产物 + 所需验证 + 文档分流完成。收尾时压缩 `plan.md` 完成摘要、更新下一步、审计 docs/代码漂移，并复审 `variant-boundary.md`（若玩法边界有变化）。
