# Shanten 计算架构

> 向听/ukeire 计算的分层设计与长期取舍。算法推导、不变量与存储布局细节在
> `packages/ai/src/junk/shanten/shanten-suit-table.ts` 顶部注释；性能演进过程见
> git history（`perf(core):`/`perf(ai):` 系列 commit），本文件不记录历史数字。
>
> 这套计算最初建在 `packages/core`，2026 迁移到 `packages/ai/src/junk/shanten/`：
> 它是"手牌离胡牌还有多远"的启发式评估，不是规则合法性判断——core 自己的三个
> ruleset（junk/hangzhou/血战到底）各自有独立的听牌/胡牌实现，从不引用这套计算；
> 唯一消费者一直是 AI。迁移前它是 core 的公共导出，AI 每次需要新的批量接口形状
> 都要先在 core 里过一轮"公共契约"设计（见下"2-ply 批量结构 API"一节的历史记录）；
> 迁移后这些都是包内实现细节。

## 分层（单向依赖，自下而上，均在 `packages/ai/src/junk/shanten/` 内）

```
Layer 3  Junk structural baseline   packages/ai/src/junk/（消费 Layer 1 的策略代码）
   ↑ 消费
Layer 2  财神/通配符装饰层    设计上预留，未实现（见下）
   ↑ 消费
Layer 1  标准形状算法         shanten.ts（standardShanten / sevenPairsShanten /
                              ukeire / isTingpai / shantenWithExposedMelds /
                              computeShanten，纯数学，玩法无关）
   ↑ 消费
Layer 0  单花色预计算表       shanten-suit-table.ts（纯数学，玩法无关）
```

- Layer 1 仅在 `tileSet === STANDARD_TILE_SET`（引用相等）时走 Layer 0 查表
  快路径；任何非标准 `TileSet` 回退到保留的递归实现，保持通用性。
- 当前量级：数牌表（m/p/s 共用）建表约 280ms、总内存约 1.9MB，字牌表约
  20ms、约 78KB；单次整手查询约 0.6µs，`ukeire`（约 34 种候选批量试探，
  经 `createShantenProber` 的前缀/后缀 DP 分解 + `isReachable` 局部性剪枝，
  见下文"标准型局部性剪枝"）约 12µs。
- 这套模块现在是 `packages/ai` 内部实现，不是任何跨包公共契约；对外只通过
  `junk/shanten/index.ts` 重导出的公共函数消费，`shanten-suit-table.ts`/
  `shanten-prober.ts` 不进这个 barrel。

## 长期决策

1. **懒加载内存单例，不落盘**。放弃"离线生成 + 持久化二进制"：落盘需要解决
   schema 自解释/版本失效一整套问题；不在模块 import 时建表是因为 Vitest 按
   测试文件隔离模块注册表，import 时建会让用不到 shanten 的测试文件各自付
   一次成本。多线程建表按需再加，目前不值得这层复杂度。
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

- hangzhou/血战到底 AI 若未来需要这套计算，是 `packages/ai` 包内提升（挪出
  `junk/` 子目录、原地推广给多个 ruleset），不是跨包迁移；hangzhou/血战到底
  core 侧目前是各自独立的布尔回溯实现（只回答"能不能胡/是否听牌"，不产出
  向听数字），这与本模块的迁移无关。
- Layer 3 的远期方向是概率/期望值驱动评分（Monte Carlo rollout 等），
  Layer 0 的结构化并行数组是为此留的扩展点。

## 2-ply 批量结构 API

当前已有两层批量能力：`evaluateUkeireBatch` 可批量分析多组完整手牌，
`evaluateUkeireAfterDiscards` 可对同一组手牌批量计算“先弃一种牌后”的向听与进张；
内部 `createTwoChangeShantenProber` 还可复用一次删牌/加牌的花色 DP。AI 的 2-ply
目前在这些 API 之上自行枚举摸牌、概率和下一次弃牌。

因此候选不是把 AI 评分搬进玩法无关层，而是评估是否需要公开一个更贴近“删一张、
再加一张”的结构批量接口。

### 备选形状

以下分析形成于模块仍是 core 公共导出、AI 需要跨包调用的阶段，保留作为接口
形状为什么长这样的历史记录：

1. **保持现有接口，不新增 API**：AI 继续组合现有两个批量函数。优点是契约稳定；
   缺点是 AI 不能直接复用内部的双变化 prober，但当时的动态第二轮方案已达到
   约 24.33ms/case，尚未证明接口缺口造成了实际瓶颈。
2. **新增纯结构矩阵 API**：输入一组 13/14 张手牌、可弃牌 kind 和可加入 kind，
   返回每个 `(discardKind, addKind)` 的 `shanten`；不包含概率、进张列表、番型权重、
   最终弃牌选择或玩法语义。该形状最直接复用 `createTwoChangeShantenProber`；摸牌后
   的进张列表仍由现有 `evaluateUkeireBatch` 处理，避免把第三次变化错误地算成免费副产品。
   结果矩阵规模约为候选数 × 34，调用方还要处理去重、非法牌和副露语义。
3. **公开 prober/可变闭包**：直接导出 `createTwoChangeShantenProber`。性能接口简单，
   但当时会把 DP scratch、调用顺序和实现细节变成 core 的公共契约，拒绝作为首选。
4. **新增高层 2-ply API**：由玩法无关层返回概率加权的最佳下一次弃牌。拒绝；概率池、
   清一色/七对子路线和策略选择属于 AI 策略，不应进入玩法无关的 Layer 0/1。

### 已确认边界与当前状态

已确认采用备选 2 的收窄形状：`evaluateUkeireAfterDiscardDraws` 输入手牌、弃牌
kind 索引、加入牌 kind 索引、`ShantenOptions`、`TileSet` 和 `existingMelds`，返回
每个 `(discardKind, drawKind)` 的向听数。该 API 已实现并有完整测试覆盖。

它只提供结构事实，不负责概率、进张枚举、番型权重、最终弃牌选择或玩法语义；AI 若需
摸牌后的进张列表，继续组合现有 `evaluateUkeireBatch`。矩阵大小由调用方传入的两个
kind 列表控制，不隐式扩展到所有 34 种牌。

AI 结构策略已经消费该 API；概率聚合和最终动作选择仍留在 AI 策略代码，不下沉到
Layer 0/1。

**迁移后备注**：上面"备选形状"权衡的是"值不值得把 DP 实现细节变成 core 的
公共契约"这个成本——模块迁移到 `packages/ai` 后，调用方和实现同属一个包，
这层公共契约成本不再存在。本节保留作为当前接口形状（拒绝直接导出裸 prober、
选择收窄的批量矩阵）的历史依据，不是仍在生效的跨包约束；未来同包内的接口
调整只是普通实现改动，不需要重走这套分析。

## 标准型局部性剪枝

`evaluateUkeire`/`evaluateUkeireAfterDiscards`/`evaluateUkeireAfterDiscardDraws`
对 34 种候选摸牌逐个探测前，先用 `isReachable`（`shanten.ts`）做一次 O(1) 必要
条件过滤：候选牌种要么本身已持有，要么（数牌）同花色 rank 距离 ≤2 内已持有；
否则可证明该候选不可能让标准型向听下降——反证：把它当"单张"塞进任意最优
分解，面子/搭子/雀头数不变，而它自身缺组合对象不可能被并入任何分解，分数
也不可能因它变好（完整论证见 `isReachable` 函数注释）。不可达时直接复用剪枝
前已经算好的基准向听，跳过这次 DP 探测。七对分支不受此约束（全新孤立牌种
仍可能让 `kindsHeld` 增加、降低七对向听），调用方照常独立计算，不受剪枝影响。

**为什么这条值得做、而"跨摸牌共享 prober 构建"不值得**：`evaluateStructural
Discard`（生产 2-ply 弃牌决策入口）用 `--cpu-prof` 做过调用树分析（区分
`applyTransition`/`composeTransitions` 的耗时具体来自哪个调用点，不只是扁平
self-time）——两者总耗时里 86.6% 来自 34 种候选的探测闭包本身（`isReachable`
直接砍这部分的调用次数），只有 1.0% 来自 `createTwoChangeShantenProber` 自己
的基础前缀/后缀建表、11.8% 来自 `makeRemoveContext`；后两项是"每种摸牌各建
一次 prober"的固定开销，理论上可以在 34 种摸牌之间共享（旧的加权流水线
`two-ply.ts` 曾经这样做过，随 `refactor(ai): remove weighted runtime` 整体删除，
不是因为这个技巧本身有问题，是连着它所在的整个加权打分范式一起清掉的）。
但重新评估过：可摊销的份额上限只有约决策总耗时的 4%，且要求先给
`evaluateUkeireAfterDiscardDraws` 加上 `improvingKinds` 返回值（现在只返回
`shanten`）、再倒转 `evaluateStructuralContinuation` 的摸牌循环嵌套顺序（弃牌
外层、摸牌内层），改动量和这条剪枝相当，但要动 `createTwoChangeShantenProber`/
`makeRemoveContext` 这些被大量依赖、测试覆盖的内部结构，风险不成比例，未采纳。

**测量方法**：孤立的单函数微基准（比如只测 `evaluateUkeire`）对真实决策耗时
没有代表性——`evaluateUkeire` 本身在生产 profile 里占比可以忽略，真正的热点
是 `evaluateUkeireAfterDiscards`（`evaluateStructuralDiscard` 的 2-ply 搜索实际
在用的那条），两者内部结构相似但调用频率差几个数量级。要测对真实影响，用
生产 self-play 策略（`evaluateStructuralDiscard`）而非孤立函数：
`pnpm --filter @new-mj/ai evaluate scenario generate --seed 424242 --count 400`
生成场景，`evaluate scenario batch <manifest> <jsonl> --evaluator
structural-bounded` 测 `durationMs`/p50/p95（每轮跑 2 次重复确认不是噪声）。
具体数字见 commit `b8fd0a1`（`perf(ai): skip redundant shanten DP probes in
ukeire scans`）的提交信息，本文件不重复记录历史数字（见文件顶部约定）。

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

该 bounded 路径是 Junk 普通标准型生产弃牌基线，也是当前树唯一生产实现。旧加权策略已由
Git 历史承担回溯；七对已按下文"七对结构路线"一节的证据流程加入生产；门清 claim 阈值
（下文"门清 claim 阈值"节）是番型收益模型可行性专题的第一个 slice，已加入生产；清一色/
混一色/碰碰胡/杠开等其余番型和防守仍必须在后续独立 slice 中用 fixture/A-B 证据逐项加入，
不能借此边界隐式改变。

### Claim/pass 的结构比较

chi/peng 与 pass 不能直接比较动作发生瞬间的手牌张数：pass 比较当前 13 张保留结构；
chi/peng 必须先模拟副露、枚举随后的合法弃牌，再取最佳普通牌型结构。两边依次比较向听、
存活进张种类和存活进张张数，claim 只有严格更好才成立，完全打平时 pass。该规则替代的是
固定 claim hurdle，不引入新的连续权重。chi/peng 还叠加"门清 claim 阈值"一条额外门槛，
见下文同名一节。

minGang 会进入补牌而非立即弃牌：结构候选先移除三张同 kind 手牌并增加一个副露，再按
可见信息集的剩余副本枚举至多 34 种补牌；补牌后立即完成的质量优先，其余分支枚举所有不同
kind 弃牌并聚合条件期望最佳向听、进张种类和张数。pass 以零立即完成质量和当前保留结构
参与同一确定性字典序，minGang 只有严格更好才成立，打平或无可枚举补牌时 pass。搜索预算
固定为至多 34 个补牌 kind × 每分支至多 11 个弃牌 kind，不按墙钟时间截断。

该补牌质量仍是可见剩余副本的信息集估计，不读取真实杠尾或对手暗手，也不等同真实胡牌概率
或终局 EV。胡牌动作始终优先。该 claim 路径已由统一结构 facade 接入生产默认。

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
最多 5 个首弃预算。该路径已由统一结构 facade 接入生产默认，不消费 legacy 权重。

### 七对结构路线

Core 的 `sevenPairs: true` 是 standard/seven-pairs 取最小值的合并开关，不保留路线身份。AI
若需解释和比较路线，必须分别保留两路向听、可见存活进张种类和张数；仅无副露暗手
（`existingMelds === 0`）允许 seven-pairs——任何吃/碰/明杠/暗杠/补杠都会让 `existingMelds`
变成 >0，从此这手牌永久失去七对资格（`packages/core/src/rulesets/junk/state-machine.ts` 的
`own.melds.length === 0` 门槛，`docs/variants/junk.md` §3）。`structural-routes.ts` 的
`evaluateStructuralRoutes`/`classifyOrdinaryStructuralGate` 是这套路线判定最早的纯诊断版本，
只做只读分类，不接入任何生产决策。

七对已接入生产弃牌 shortlist、2-ply 叶子和 claim `pass` 比较（`structural-discard.ts`/
`structural-claim.ts`），接入规则不对称：任何会让 `existingMelds` 增加的动作（chi/peng/
minGang/anGang/buGang）必须只用标准型 shape 比较，因为选它必然报废七对，比较两路线取优
毫无意义；不改变 `existingMelds` 的动作（discard、pass）才允许在两路线间取优。

直接拿两路向听数字打 min 比较（无差别合并）在生产自对弈 A/B（`evaluateCandidatePolicies`，
200 seed 位置互换换位对局）中明显跑负，原因是七对同向听数通常比标准型更难真正兑现——
每一步能吃的牌种更窄（只能凑自己那张对子，标准型还能吃顺子/刻子两种结构），无差别合并
系统性高估了七对、导致弃牌/2-ply 过度偏向追七对。最终生产实现给七对侧加一个随暗对数
递减的整数级差惩罚（`structural-discard.ts` 的 `sevenPairsHandicapFor`）：暗对越少、离
"真的赌七对"越远，要求它领先标准型的差距就越大；暗对数够多（当前门槛 5）后不再打折，
直接用未惩罚的原始 min，此时继续压制会白白丢掉本该兑现的完成。三档惩罚（对数 <4/<5/≥5）
经同一 A/B 协议对比无惩罚、单一固定惩罚、单一硬阈值等多个变体确认为当前最优，具体分数
见 commit 提交信息（本文件不重复记录历史数字）。

`combineWithSevenPairsHandicap` 是这个惩罚组合逻辑的纯算术实现（不含 DP、O(kinds) 复杂度），
但按摸牌种类×次弃候选的搜索结构，单次弃牌决策里它会被调用上千次，早期实现为每个候选单独
调 `evaluateUkeire` 现算标准型分析，等于放弃了标准型分支原本就有的共享 prober 批量优化
（`evaluateUkeireAfterDiscards`），一度让 P50 从 v1 的 `16.40ms` 涨到 `30.24ms`（约 87%）。
经三轮性能重构收窄：改为共享一次父手牌的计数/对数/持牌种类数、每候选只做 O(1) 增量而非
重新扫描整手牌；再把结果聚合从"筛出 `TileKind[]` 数组再交给通用 helper 做 map/filter/reduce"
改成单趟遍历直接累加两个标量，省掉每候选反复分配/丢弃中间数组的 GC 压力（这一步的收益
远超预期——profiling 显示它一度和标准型 DP 本身耗时相当）。最终 P50 收窄到 `17.23ms`
（约 5% 开销），`evaluate policy diff` 对已提交版本做过 20 局种子 12828 决策点全量比对确认
`0` 处不同，三轮重构纯粹是实现层面优化，不改变任何决策。

### 门清 claim 阈值

这是 backlog"番型路线收益模型可行性"专题选定的第一个 slice：门清（`packages/core/src/
rulesets/junk/scoring.ts` 的 `isMenqing`，×2）在胡牌那一刻永远正确计分，与本节讨论的
AI 决策改动完全独立——`isMenqing` 只看实际打出来的副露是否清一色暗杠，不管 AI 事先有没有
意识到这件事。本节要解决的是决策阶段的空白：现有 claim 比较（上文"Claim/pass 的结构比较"）
只要 chi/peng 严格改善结构就选它，对"这一手会不会因此永久报废门清"完全无感。

门清的破坏条件与七对不同：不是任何副露都破（暗杠 anGang 不破门清，只有 chi/peng/minGang/
buGang 才破），门槛判断因此不能复用 `existingMelds === 0`，要单独判断"是否已经吃/碰/明杠过"
（`structural-claim.ts` 的 `hasOpenMeld`：`melds.some(m => m.type !== "anGang")`），同样单调、
一旦破了不可逆。

七对的"两路向听取优"手法在这里不适用：pass 保留的是"×2 分数"，claim 换来的是"向听/进张
改善"，两者不同量纲，没有天然换算关系；硬编一个"1 级向听 = 多少分"的换算表，就正好是
backlog 警告的"把不可靠的胡牌概率伪装成诊断真值"那个坑，也是"有限总体抽样"一节记录的
旧 `wallShare` 教训同一类错误。因此改用离散阈值而非换算：chi/peng 只有严格领先 pass 一定
向听差才允许打破仍然存活的门清，而不是"任意改善就算数"；不改变 `evaluateVisibleStructuralShape`/
`evaluateVisibleStructuralShapeBestRoute` 本身的向听计算，两边都在同一层（结果手牌当下的
1-ply 向听，不含摸牌模拟）比较，口径一致。scoped 到 chi/peng，不含 minGang——minGang 的
排序键带真实的 `completionMass`（补牌立即胡的概率），是 chi/peng 从不具备的价值来源，
把它一起纳入同一个阈值需要独立评估，留作后续。

阈值取值经 200 seed 位置互换换位对局 A/B（`evaluateCandidatePolicies`）：`margin=0`（无门槛，
即改动前行为）作为基线校验，`evaluate policy diff` 确认与改动前 `0/12828` 决策点不同，证明
机制本身是改动前行为的纯扩展；`margin=1` 净分 `+83`（相对 margin=0 基线），是目前最优；
`margin=2` 净分 `-457`，明显更差。尝试过用 pass 自身向听数分档（复用七对分档惩罚的方法论）：
"向听≤0 放开到 0、1-2 用 1、≥3 提到 2" 三档，净分 `-37`；"向听≤1 放开到 0、其余用 1" 两档，
胜场率 `47.0%` 略高于 flat margin=1 的 `46.5%`，但净分 `+52` 低于 flat margin=1 的 `+83`——
胜场与净分方向不一致，在这个样本量下判定为噪声，均未采纳。与七对暗对数分档不同，七对那条轴
有清晰单调信号（暗对越少越该谨慎），门清按向听分档没有找到同等强度的信号，flat margin=1
更简单也更好，因此维持常数、不引入分档。

累计效果（七对 + 门清阈值，相对七对合入前的原始基线）：换位对局净分 `+130`，胜场率
`47.0%`；七对单独相对原始基线是净分 `+72`、胜场率 `44.5%`；门清阈值单独相对七对基线是净分
`+83`、胜场率 `46.5%`。两次增量方向一致、量级相近（`72+83=155` 与累计 `130` 同一量级，
不同批次跑测，不要求精确可加），没有出现叠加后相互抵消的异常信号。

## Junk legacy 搜索机制的可复用边界

旧 weighted 路径中的机制不能因为“将来可能有用”而整段保留。下面固定可重建的设计意图和
验收边界；旧载体可删除，未来 candidate 需要时根据这些契约重新实现，并与进入 slice 前的
`structural-baseline@1` 比较。

### Dynamic shortlist 与 cliff

旧实现先用加权一层分数和清/混一色加成排序首弃，再按全体分数跨度归一化相邻 gap：upper
cliff 至少保留 2、至多保留 4 个首弃；lower cliff 至少保留 1 个第二弃牌 kind，遇到从尾部
计算的 gap 时截断，否则可能保留全部。它的意图是“便宜排序缩小昂贵搜索”，但不可复用其
实现：候选身份依赖 `JunkWeights`，相对 gap 会随无关分数项和极值变化，阈值附近不连续，
分数全等时又退化到最大范围。

保留的中性契约是：先计算便宜且可解释的结构事实；只删除被明确支配的候选；其余候选用稳定
字典序排列并施加固定数量上限；用同一输入的 full teacher 记录一致率、所有差异 seed 和 P95
比值。当前 structural bounded 2-ply 的“支配过滤 + 最多 5 个首弃”已经实现该契约，因此旧
cliff 不迁移为公共工具。可重建场景包括 canonical `discard-001`、`discard-snapshot-001`，以及
截断边界 seed `1077643932`、`1351392336`、`537634752`、teacher 差异 seed `3520660970`。

### Claim hurdle

旧 chi/peng hurdle 从 claim 后最佳加权分数中减去固定常数，表达“副露不能只因微小分差成立”。
该目标已经由结构 claim 的严格比较取代：先模拟 claim 与下一弃牌，再按向听、存活进张种类和
张数比较 pass；完全相同则 pass。固定数值 hurdle 与分数量纲绑定，不提取。未来若需要风险
缓冲，必须定义为离散结构 margin（例如至少降低一向听），作为独立 candidate 由
`claim-chi-breaks-tenpai-001`、`claim-peng-reaches-tenpai-001` 和
`claim-chi-tied-pass-001` 验证，不能恢复连续权重扣分。

### 预算与提前停止

生产决策预算只能由候选数、分支数或迭代数决定，不得按墙钟时间截断；相同输入在不同机器上
必须得到同一动作。当前弃牌最多搜索 5 个首弃，gang continuation 最多搜索 34 个 draw kind ×
11 个 discard kind。旧 cliff 的动态宽度不保留；权重 optimizer 的 sigma/stagnation 提前停止
只属于离线调参流程，也不迁入策略搜索。未来增加 ply 时必须同时提供固定 hard cap、完成/截断
标记、full 或更宽 teacher 差异，以及独立 P95 证据。

### Analysis LRU

旧 `analysis.ts` 的 key 是“副露数 / 是否允许七对 / 34 种暗手计数”，有意不含牌河、公开副露
或 wallCount，因为缓存值仅是 `evaluateUkeire` 的暗手结构事实。缓存容量默认为 32，每个座位
跨决策复用、每手开始清空；实时分数和存活张数不得缓存。删除前的消费者全部位于 legacy
`hand-quality → two-ply → action-scoring` 及其诊断路径；structural production 使用 core 批量
API，因此当前树不保留该缓存。

Node `v24.18.0`、canonical `discard-001` 的只读重复 benchmark（预热后每轮 50 次，共 3 轮）中，
共享 32 项 LRU 每轮均为 `7,189 hits / 60,211 misses`；shared/fresh 耗时分别为
`1352.3/1323.4ms`、`1337.0/1324.2ms`、`1286.8/1303.7ms`，没有稳定收益且呈明显容量抖动。
因此未迁为 structural 能力，已随 legacy 删除。若未来 profile 再次定位到相同 shape 重算，应在
实际消费者旁建立局部 cache，以完整语义 key、明确生命周期、容量和命中 benchmark 重新验收。

### 有限总体抽样

已删除的 `probabilityAtLeastOneDraw` 计算有限总体无放回抽样“至少命中一次”；其唯一消费者是旧
`handQuality`，它先把可见进张按 wall 在未知池中的份额折算成可能为非整数的 `wallShare`，再
估算本人剩余摸牌次数。这个总体既不是真实牌墙，也不是条件终局模型。structural 路径只在
“下一次未知摸牌”分支上按可见剩余副本聚合，不调用该函数。

因此数学公式及“总体、成功数、抽取次数必须同属一个明确定义的信息集”的约束保留在本文，
函数本身未迁为中性工具，已随 legacy 删除。未来若引入多次摸牌概率，必须先定义谁能摸、未知池
包含哪些容器、公开信息如何去重、是否条件于对手行动，并用枚举小总体和实战边界 fixture
验证；不得直接复用旧 `wallShare` 近似并称为胡牌概率或 EV。
