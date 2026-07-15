# workflow：流程细则

> 按需阅读：提交时看 Git 节，收尾时看验收节。文档规则见 doc-map.md。

## 阶段开场

- 输出本阶段实施顺序 + 开放问题清单；开放问题清零前不动核心接口
- plan 产物优先是可编译骨架/状态图/竖切，而非文档
- 阶段 1 特例：先出"类型 + RuleSet 接口签名 + 空实现 + 一个红的 happy-path 测试"供人审接口形状，认可后再填实现

## 完成的定义（DoD）

任务宣称完成前全绿并**贴出运行结果**（不得凭记忆断言）：

1. `pnpm typecheck`（全仓 tsc strict）
2. `pnpm lint`（ESLint + Prettier 从简配置；core 包含 no-restricted-globals/imports 禁 Date/Math.random/setTimeout/IO；dependency-cruiser 锁包依赖方向）
3. `pnpm test`（受影响包全部测试）
4. core 改动：fuzz 冒烟 ≥1000 局；阶段收尾跑全量 ≥1 万局（随机 config）

- 测试与实现同 commit；修 bug 先写复现用例（红→绿）
- fuzz 失败：seed + action log 先固化为回归用例，再修复
- 不追覆盖率指标；追不变量全时校验 + 胡牌/番型用例表全绿

## 依赖维护

- 新增或刷新依赖时优先使用 npm registry 的最新稳定版，不使用 prerelease。
- 若最新版本违反现有工具链的 peer 约束，使用最新兼容稳定版，并在提交说明或计划中记录原因。
- 依赖变更必须同步 `package.json` 与 `pnpm-lock.yaml`，并通过 typecheck、lint、test 后提交。

## 测试工具边界

- 保持 pnpm 为唯一包管理器；测试运行时按包的生态选择，不要求全仓库使用同一个 runner。
- `packages/core`、`packages/protocol`、`packages/ai` 优先使用 Vitest，便于 TypeScript、参数化用例和 fuzz 测试。
- `apps/server` 使用 NestJS 时采用 Jest，遵循 NestJS 官方测试生态；server 测试不得因此把 Jest 依赖引入 core。
- web/mobile 使用各自框架的测试工具；跨包测试从根脚本统一调度。

## 检查与格式化边界

- 每个 workspace package/app 都应提供 `typecheck`、`lint` 和 `test` 脚本，便于局部开发与任务缓存。
- 有运行时产物的 package 应提供 `build`，并将 `dist/**` 声明为 Turbo 输出；依赖 package 的检查由 Turbo 的 `^build` 依赖先构建上游产物。构建工具统一放在根 devDependencies，package 只保留自己的入口/输出配置。
- 每个 workspace package/app 都应提供 `verify`，串行执行本 package 的 `typecheck`、`lint`、`test`；根目录 `pnpm verify` 另包含全局 `format:check`。
- 根目录 `pnpm lint:fix` 支持 ESLint 自动修复（可追加文件路径）；`pnpm typecheck:fix` 会先执行 format/lint 修复再 typecheck，TypeScript 类型错误仍需人工处理。
- 根目录同名脚本通过 Turbo 聚合所有 workspace；CI、阶段验收和提交前检查一律从根目录运行。
- 格式化使用 Prettier：`pnpm format` 写入格式，`pnpm format:check` 仅校验；提交前不得以 `format` 代替 lint 或 typecheck。

## Core 类型与注释

- 已导出的领域状态、事件和跨模块结果优先定义专门的 `type`/`interface`；这样可复用、可被契约引用，并减少后续接口调整时的漂移。
- 仅在模块内部使用、语义一次性且不会成为跨包契约的简单结果，允许使用内联返回类型；不为形式统一而制造无意义类型名。
- 注释只补充代码无法表达的算法、不变量、敏感性或边界语义；契约和规则正文仍以 `docs/` 为准，不在代码注释中复制整段规格。

## 阶段验收

可运行产物跑通 + 全量 fuzz 绿 + doc-map §4 吸纳仪式完成 = 阶段完成，打 tag。

- 阶段 1：CLI 打完整局；阶段 2：socket.io-client 模拟 4 客户端整局；阶段 3：浏览器真人对局竖切

## Git（单人从简，可回溯）

- trunk-based：日常直接提 main；仅预期失败的实验或接口调整（阶段 1.5）开短命分支
- main 始终全绿（DoD 1–3 过才提交）；坏提交 revert，不 force push
- commit = 一个可独立描述的变更；conventional 消息（feat/fix/test/refactor/docs + 范围）
- docs/ 变更与对应代码**同一 commit**；每阶段完成打 tag（phase-1、phase-1.5…）
- 秘密只进 .env（.gitignore），提供 .env.example

## 会话仪式（长周期持续性）

- 开工：读 CLAUDE.md + plan.md 状态区
- 收工：把"当前进度 + 下一步第一个具体动作"写回 plan.md 并 commit（"下一步"必须具体到可直接执行，如"给 RoomManager 补超时代打测试"）；提交前默认执行 `pnpm verify`。
