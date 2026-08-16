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

## Junk 纯结构策略分层

新的 Junk 策略从弃牌决策开始独立建立，不在旧加权公式上继续调参：

- `structural full 2-ply` 是离线 teacher，允许搜索全部合法首弃，用于测量近似误差；
- `structural bounded 2-ply` 是运行时候选，先删除同向听层被进张种类/张数严格支配的
  首弃，再以固定结构顺序保留至多 5 个；预算按候选数确定，不依赖机器速度；该上限由固定
  开发/留出样本与 full teacher 的截断差异确定，不随单局动态扩张；
- 第二层叶子依次比较普通牌型向听、存活进张种类、存活进张张数；首层依次比较立即完成
  质量、条件期望最佳向听、条件期望进张结构及一层结构，最后以牌种和 `TileId` 稳定破同；
- 所有比较均为确定性字典序，不提供统一可调权重。可见剩余张数消费手牌、公开牌河和副露，
  按 `TileId` 去重，是信息集估计而非真实牌墙概率。
- 概率加权聚合产生的浮点结果在比较时使用固定 `1e-12` 容差，仅消除不同累加路径的舍入噪声；
  它不是质量权重，容差内继续比较下一项结构指标。

该路径当前是未接入默认入口的弃牌-only 影子候选。现有加权策略保持生产默认；claim、番型、
七对和防守必须在后续独立 slice 中用 fixture/A-B 证据逐项加入，不能借此边界隐式改变。

### Claim/pass 的结构比较

chi/peng 与 pass 不能直接比较动作发生瞬间的手牌张数：pass 比较当前 13 张保留结构；
chi/peng 必须先模拟副露、枚举随后的合法弃牌，再取最佳普通牌型结构。两边依次比较向听、
存活进张种类和存活进张张数，claim 只有严格更好才成立，完全打平时 pass。该规则替代的是
固定 claim hurdle，不引入新的连续权重。

minGang 会进入补牌而非立即弃牌：结构候选先移除三张同 kind 手牌并增加一个副露，再按
可见信息集的剩余副本枚举至多 34 种补牌；补牌后立即完成的质量优先，其余分支枚举所有不同
kind 弃牌并聚合条件期望最佳向听、进张种类和张数。pass 以零立即完成质量和当前保留结构
参与同一确定性字典序，minGang 只有严格更好才成立，打平或无可枚举补牌时 pass。搜索预算
固定为至多 34 个补牌 kind × 每分支至多 11 个弃牌 kind，不按墙钟时间截断。

该补牌质量仍是可见剩余副本的信息集估计，不读取真实杠尾或对手暗手，也不等同真实胡牌概率
或终局 EV。胡牌动作始终优先。当前 claim 候选保持影子状态，不接入默认入口。

### 自回合 gang 的结构比较

anGang 从暗手移除同 kind 四张并新增一个副露；buGang 从暗手移除 action tile 并升级本人既有
同 kind peng，副露数不变。两者随后复用 minGang 的可见剩余补牌搜索。自回合基线不是 pass，
而是 bounded structural discard 选出的最佳直接弃牌；gang 还必须对比其等价弃牌（anGang 打掉
四张中的一张、buGang 打掉 action tile），避免 shortlist 截断产生虚假优势。各方使用相同的
立即完成质量、条件期望最佳向听、进张种类和张数字典序。gang 必须同时严格更好，打平时
直接弃牌，zimo 始终优先。不计番型、抢杠和行动时机时，buGang 与已锁定 peng 的等价弃牌
结构相同；anGang 因锁死原本仍可拆分的暗刻，可能与等价弃牌相同或更差。这个影子策略不会
为“杠”本身凭空增加奖励。

gang 补牌预算固定为至多 34 个 draw kind × 每分支至多 11 个 discard kind，直接弃牌仍使用
最多 5 个首弃预算。该路径同样只作为影子候选，不改变生产入口或默认权重。

### 七对结构路线

Core 的 `sevenPairs: true` 是 standard/seven-pairs 取最小值的合并开关，不保留路线身份。AI
若需解释和比较路线，必须分别保留两路向听、可见存活进张种类和张数；仅无副露暗手允许
seven-pairs。路线按上述三项固定字典序选择，完全打平时 standard，不使用 `qiduiPotential`
或其他连续权重。当前仅建立独立路线模型，尚未接入 bounded 2-ply 或生产入口。
