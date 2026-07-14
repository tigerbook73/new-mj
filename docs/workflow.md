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
- 收工：把"当前进度 + 下一步第一个具体动作"写回 plan.md 并 commit（"下一步"必须具体到可直接执行，如"给 RoomManager 补超时代打测试"）
