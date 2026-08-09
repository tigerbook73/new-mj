# Shanten 计算架构

> 向听/ukeire 计算的分层设计与长期取舍。算法推导、不变量与存储布局细节在
> `packages/core/src/lib/shanten-suit-table.ts` 顶部注释；性能演进过程见
> git history（`perf(core):` 系列 commit），本文件不记录历史数字。

## 分层（单向依赖，自下而上）

```
Layer 3  玩法专属 AI 评分     packages/ai/src/<ruleset>/（如 junk 的 JunkWeights/fanPotential）
   ↑ 消费
Layer 2  财神/通配符装饰层    设计上预留，未实现（见下）
   ↑ 消费
Layer 1  标准形状算法         packages/core/src/lib/shanten.ts（standardShanten /
                              sevenPairsShanten / ukeire / isTingpai /
                              shantenWithExposedMelds / computeShanten，纯数学，玩法无关）
   ↑ 消费
Layer 0  单花色预计算表       packages/core/src/lib/shanten-suit-table.ts（纯数学，玩法无关）
```

- Layer 1 仅在 `tileSet === STANDARD_TILE_SET`（引用相等）时走 Layer 0 查表
  快路径；任何非标准 `TileSet` 回退到保留的递归实现，保持通用性。
- 当前量级：数牌表（m/p/s 共用）建表约 280ms、总内存约 1.9MB，字牌表约
  20ms、约 78KB；单次整手查询约 0.8µs，`ukeire`（约 34 种候选批量试探，
  经 `createShantenProber` 的前缀/后缀 DP 分解）约 14µs。

## 长期决策

1. **懒加载内存单例，不落盘**。放弃"离线生成 + 持久化二进制"：core 禁止
   I/O（`packages/core/AGENTS.md`），且落盘需要解决 schema 自解释/版本失效
   一整套问题；不在模块 import 时建表是因为 Vitest 按测试文件隔离模块注册
   表，import 时建会让用不到 shanten 的测试文件各自付一次成本。多线程建表
   按需再加，目前不值得这层复杂度。
2. **表结构按增量扩展设计，不预先猜字段**。基础距离表是唯一稳定、所有消费
   方共用的核心产物；若某玩法需要结构信息（刻子/顺子数目、是否用了对子等，
   建表搜索的天然副产品），加一个**共用同一套下标方案的并行数组**，不合并
   大表、不重建基础表。已知语义限制：并列最短路径只存一条代表，回答的是
   "至少存在一种这样的解"，对 AI 打分够用；"枚举全部到听路径"不在设计
   范围内，但也没有被堵死。
3. **Layer 2 预留约束**：财神是万能替身 ⇒ 对任意目标的距离直接减财神数、
   封底 -1，一个通用装饰函数即可，不需要重建表、不给 Layer 0 加维度。
   Layer 0/1 的任何改动不得让 shanten 数字失去"可被这种装饰处理"的性质。

## 未来方向（非承诺）

- hangzhou/血战到底重做时迁移到 Layer 1（hangzhou 财神走 Layer 2）：两者
  目前是各自独立的布尔回溯实现（只回答"能不能胡/是否听牌"，不产出向听
  数字），迁移属于对应玩法重做阶段的决定。
- Layer 3 的远期方向是概率/期望值驱动评分（Monte Carlo rollout 等），
  Layer 0 的结构化并行数组是为此留的扩展点。

## 2-ply 批量结构 API

当前 core 已有两层批量能力：`evaluateUkeireBatch` 可批量分析多组完整手牌，
`evaluateUkeireAfterDiscards` 可对同一组手牌批量计算“先弃一种牌后”的向听与进张；
内部 `createTwoChangeShantenProber` 还可复用一次删牌/加牌的花色 DP。AI 的 2-ply
目前在这些 API 之上自行枚举摸牌、概率和下一次弃牌。

因此候选不是把 AI 评分搬进 core，而是评估是否需要公开一个更贴近“删一张、再加一张”
的结构批量接口。

### 备选形状

1. **保持现有接口，不新增 API**：AI 继续组合现有两个批量函数。优点是契约稳定；
   缺点是 AI 不能直接复用 core 内部的双变化 prober，但当前动态第二轮方案已达到
   约 24.33ms/case，尚未证明接口缺口造成了实际瓶颈。
2. **新增纯结构矩阵 API**：输入一组 13/14 张手牌、可弃牌 kind 和可加入 kind，
   返回每个 `(discardKind, addKind)` 的 `shanten`；不包含概率、进张列表、番型权重、
   最终弃牌选择或玩法语义。该形状最直接复用 `createTwoChangeShantenProber`；摸牌后
   的进张列表仍由现有 `evaluateUkeireBatch` 处理，避免把第三次变化错误地算成免费副产品。
   结果矩阵规模约为候选数 × 34，调用方还要处理去重、非法牌和副露语义。
3. **公开 prober/可变闭包**：直接导出 `createTwoChangeShantenProber`。性能接口简单，
   但会把当前 DP scratch、调用顺序和实现细节变成公共契约，拒绝作为首选。
4. **新增高层 2-ply API**：由 core 返回概率加权的最佳下一次弃牌。拒绝；概率池、
   清一色/七对子路线和 `JunkWeights` 属于 AI，不应进入玩法无关 core。

### 已确认边界与当前状态

已确认采用备选 2 的收窄形状：`evaluateUkeireAfterDiscardDraws` 输入手牌、弃牌
kind 索引、加入牌 kind 索引、`ShantenOptions`、`TileSet` 和 `existingMelds`，返回
每个 `(discardKind, drawKind)` 的向听数。该 API 已实现并由 core 完整验证覆盖。

它只提供结构事实，不负责概率、进张枚举、番型权重、最终弃牌选择或玩法语义；AI 若需
摸牌后的进张列表，继续组合现有 `evaluateUkeireBatch`。矩阵大小由调用方传入的两个
kind 列表控制，不在 core 内隐式扩展到所有 34 种牌。

下一步只在 AI 诊断路径评估是否消费该 API；在 A/B/profile 证明有收益前，不改默认 AI
策略，也不把概率或 JunkWeights 下沉到 core。
