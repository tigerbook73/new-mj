# Shanten/Ukeire 共享底层：Junk AI 第一阶段方案

## 0. 背景与目标

**本阶段目标是把 junk 的 AI 能力做到一定程度**，之后才轮到考虑其他玩法。这份
方案要做的事情，是把 junk AI 依赖的向听/ukeire 计算从"每次现算的递归 DFS"升级
成"可查表、可承载更多牌型结构信息"的共享底层，作为提升 junk AI 质量的地基——
不是单纯为了让现有自对弈调参工具跑得更快：调参算法本身目前基本没收敛（详见
§3），"加速一个不收敛的算法"价值有限；真正有价值的方向是让 junk 的评分逻辑
能用上更准确、更结构化的牌型信息，以及为未来"概率/期望值驱动的评分"（而不是
继续遗传调一个可能有天花板的启发式权重，见 §7 Monte Carlo rollout 一项）打
基础。

**hangzhou（杭州麻将）/ 血战到底现状**：两者都已上线（`docs/variants/
hangzhou.md`/`bloodbattle.md` 写的是"定稿"），但胡牌/听牌判断是各自独立的
布尔回溯实现（`hangzhou/hand.ts` 的 `isStandardWinningHandWithWild`/
`isTingpai`、`bloodbattle/tingpai.ts` 的 `ronCandidates`/`isTingpai`）——只
回答"能不能胡/是否听牌"，从不产出向听数字，也完全不引用
`packages/core/src/lib/shanten.ts`。这两个玩法目前的实现比较基础，后续计划
是连同 AI/自对弈调参一起重做（届时会用到 Layer 1，hangzhou 的财神机制会用到
Layer 2）——但**这是后续阶段的事，本阶段不改 hangzhou/血战到底的任何代码**，
只在设计 Layer 0/1 时把这个未来方向当作约束条件（命名、接口、表结构不要挖坑），
不当作交付物。

## 1. 现状与已发现问题（已修复，未 commit）

**shanten.ts**（真实路径 `packages/core/src/lib/shanten.ts`）：
`standardShanten`/`sevenPairsShanten`/`junkShanten`/`ukeire`/`isTingpai`
逻辑走查无误，是一次性递归 DFS + 调用方可传入共享 memo 的实现，正确性没问题，
但性能模型是"每次调用现算"，不是"建好表后 O(1) 查询"。

**strategy.ts**（真实路径 `packages/ai/src/junk/strategy.ts`）：发现两处问题，
**已在代码里修复**：

1. `JunkWeights.pengpenghu`（碰碰胡权重）定义了、也导出了，但整个文件没有
   任何地方读取它——是死代码。`default-weights.json` 里 `pengpenghu: 10`
   与其余番型权重（`qidui: 14`/`menqing: 8`/`qingyise: 20`/`hunyise: 9`/
   `gangkai: 5`）量级一致，是有意义的调好的默认值，不是废弃占位，判断是
   接线时漏掉。已接入 `fanPotential`（"没有 chi 副露即仍在碰碰胡轨道上"，
   呼应 core `rulesets/junk/scoring.ts` 里 `isPengPengHu` 的判定条件）。
2. `shantenOf` 对副露的修正（`standardShanten(concealedHand) - meldCount*2`）
   在"已有副露 + 剩余手牌搭子偏多"时会算出偏乐观的向听数。根源是
   `standardShanten` 内部的搭子上限 `min(tatsu, 4-melds)` 只看得到手牌自己
   找到的面子数，看不到外部已经报出的副露数，两者应该共同封顶 `4-总面子数`。
   已构造出具体反例并用临时脚本实测复现（1 副露 + 4 搭子 + 1 雀头的 10 张
   手牌，修复前算出 1 向听，正确答案是 2 向听）。已做成 Layer 1 的通用函数：
   `standardShanten` 新增 `existingMelds` 形参，新导出
   `shantenWithExposedMelds(concealedTiles, exposedMelds, ...)`；`shantenOf`
   改为调用它，不再自己做事后的 `- meldCount*2`。

以上两处改动位置：`packages/core/src/lib/shanten.ts`、
`packages/ai/src/junk/strategy.ts`。**回归测试已补齐，`pnpm --filter
@new-mj/core verify:full` 与 `pnpm --filter @new-mj/ai verify:full` 均全绿**
（见 §8 遗留清单 1、2）。

## 2. 目标架构：四层，单向依赖

```
Layer 3  玩法专属规则       （每个 ruleset 目录各自实现，互不感知）
   ↑ 消费
Layer 2  财神/通配符装饰层   （设计上预留，不实现，见下）
   ↑ 消费
Layer 1  标准形状算法        （standardShanten / sevenPairsShanten / ukeire /
                              isTingpai / 副露修正，纯数学，玩法无关）
   ↑ 消费
Layer 0  单花色预计算表      （5^9 状态 BFS 建表，纯数学，玩法无关）
```

- **Layer 0**：单花色（1–9）+ 字牌两张表，核心问答是"这个花色的计数向量，离
  N 组面子/是否配将，还差几张"，不知道任何玩法规则的存在。万/筒/条复用同一张
  表。建表成本已用 Node 验证（见 §6）。

  **表结构要支持增量扩展，不要求 Phase 1 一次做全**：现在表每个状态只存一个
  距离整数，不含刻子/顺子/对子数目、达到同一距离的不同组合方式这类结构信息——
  这类信息目前在 junk 里是靠 `fanPotential`/`isolationPotential` 直接扫原始
  手牌重新数一遍，跟向听计算是两条独立路径。设计原则：
  1. 基础距离表（`Int8Array`，见 §6 成本估算）保持不变，是唯一稳定、任何玩法
     都用的核心产物。
  2. BFS 建表时找到某状态到某目标的最短路径，天然已经知道用了几个刻子/顺子/
     是否用了对子——这是搜索过程的副产品，现在算完就扔了。可以顺手存进**另一
     个用同一套下标方案（suitState × target → index）的并行数组**，建表阶段
     几乎不增加成本。
  3. 不同玩法要不同结构信息，就对应开不同的并行数组，共用同一套下标去查——
     不需要合并成一张大表，也不需要重建基础距离表。
  4. 多花色合并步骤（把 3 个花色 + 字牌的单花色结果拼成全局向听数）已经在
     多种"每花色分几组面子/要不要雀头"的分配里挑最优；要把结构信息带出来，
     只需要在挑出最优分配后，顺手取出对应花色的结构并行数组拼起来，不需要
     新的搜索。
  5. 诚实的限制：单个状态到某目标可能有多条并列最短路径，只存一条代表性
     路径意味着"这个状态用没用刻子"这类查询给的是"至少存在一种这样的解"，
     不是"所有最短解的完整列表"——现有递归 DFS 本来也只返回一个 `best`，
     这个简化对 AI 打分够用；如果以后需要"数一数有几种到听路径"这种更强的
     组合枚举，是比这更大的一步，不在本阶段设计范围内，只是不堵路。
  6. **Phase 1 只做基础距离表，验证对象只有 junk**；结构化并行数组不预先猜
     需要什么，等 junk 的 `fanPotential`/`isolationPotential` 真的要接的
     时候再按需加一个新数组——下标方案从一开始按"可扩展"设计，到时候加数组
     是增量工作。

- **Layer 1**：现有 `standardShanten`/`sevenPairsShanten`/`ukeire`/
  `isTingpai` 这几个函数本质上就是这一层，**物理上已经在 `packages/core/
  src/lib/shanten.ts`，不在任何 junk 目录下**，不需要跨包搬文件。**已正名
  （你已确认）**：`junkShanten`/`JunkShantenOptions` → `computeShanten`/
  `ShantenOptions`，函数本身从未含任何 junk 专属逻辑（只是接一个
  `sevenPairs` 开关），只是历史遗留的名字。全仓库排查确认调用点只有
  `packages/core/src/lib/shanten.ts` 自身与其测试，`packages/ai`/其余
  package 都只经 `ukeire`/`shantenWithExposedMelds`/`isTingpai` 间接消费，
  不直接引用这两个名字，改名影响面很小。`pnpm --filter @new-mj/core
  verify:full`、`pnpm --filter @new-mj/ai verify:full` 均已重跑确认全绿。
  §1 提到的副露修正已在这一层补了通用函数 `shantenWithExposedMelds`。
- **Layer 2**：数学性质是"财神是万能替身 ⇒ 对任意目标的距离直接减财神数，
  封底在 -1"，可以做成一个通用装饰函数，不需要重新建表、不需要给 Layer 0
  加维度。**目前没有任何实现动作**：junk 没有财神用不上；hangzhou 有财神，
  但它现在用自己独立的 `canComplete(counts, wild, ...)` 回溯实现解决了 wild
  预算问题，是否/何时把 hangzhou 迁移到 Layer 1+2 是后续阶段的决定，本阶段
  只是设计 Layer 1 时不要把 shanten 数字设计成没法被这种简单装饰函数处理。
- **Layer 3**：`JunkWeights`/`fanPotential`/`isolationPotential` 这些是
  junk 独有的 AI 评分逻辑，留在 junk 目录不动。

## 3. 第一阶段范围（仅 Junk，不改 hangzhou/血战到底代码）

**包含：**

1. 修复 §1 的两个问题。**代码已修复，待补回归测试 + 跑 verify（§8）。**
2. 评估并按需重新调参（见 §4 步骤 2 的风险提示）。**尚未评估，且要先确认
   `default-weights.json` 是否真的出自 `tune-cli.ts`。**
3. 把 Layer 1（现在的 `junkShanten` 等）正名，明确成玩法无关的公共层，junk
   目录只保留真正 junk 专属的东西。**范围比"挪文件"小得多**：物理位置已经
   在 core，只是要不要去掉 `Junk` 前缀，需要你决定。
4. ~~落地 Layer 0 预计算表~~ **已完成**：替换 Layer 1 内部"每次现算 DFS"为
   "查表 + 4 花色合并 DP"，对外接口（`standardShanten`/`sevenPairsShanten`/
   `ukeire`/`isTingpai`/`shantenWithExposedMelds` 的函数签名和返回值）逐位
   保持不变（差分测试证明），Layer 2/3 无感知——实际按 §4 步骤 4 的门槛重新
   profile 后再动手，见 §6"Layer 0 实现结果"。
5. ~~明确表的落地方式~~ **已完成，与原方案有一处偏离**：进程内存单例
   （`Int8Array`），不用数据库——这条不变；但没有采用"默认启动时建表"，而是
   直接用了"懒加载"（第一次真正用到查表快路径时才建，模块 import 时不建）
   ——原因是 Vitest 4 默认按测试文件隔离模块注册表，"启动时"（import 时）
   建表会让大量用不到 shanten 的测试文件也各自付一次建表成本；也没有走
   "构建期离线生成、运行时读文件"这个 fallback（讨论过，因为撞
   `packages/core/AGENTS.md`"禁止任何 I/O"这条规矩，且落盘还要解决 schema
   自解释/版本号问题，用户明确决定接受懒加载内存方案的实测耗时，不做这一步）。

**明确不包含（本阶段不实现、不改代码）：**

- hangzhou/血战到底的任何代码改动（包括 `hand.ts`/`tingpai.ts` 重写、AI/
  自对弈调参）——这两个玩法的重做是后续阶段的事，本阶段只把它们当设计约束。
- Layer 2 财神装饰层的具体实现。
- Layer 0 结构化并行数组（刻子/顺子/对子数目等）的具体内容——设计上不堵路，
  但不预先猜字段，等真的有消费方（junk 的 `fanPotential` 或以后的 hangzhou）
  再按需加。
- Monte Carlo rollout / 自我对局强化学习（Phase 3+）。

## 4. 实施步骤（方案级别）

1. **补测试基线（先于修复）**：为 `standardShanten`/`sevenPairsShanten`/
   `ukeire`/`isTingpai` 建立一批已知向听数的手牌作为回归测试用例，尤其要
   包含 §1.2 的反例（1 副露 + 4 搭子 + 1 雀头）。**状态：反例已用临时脚本
   手动验证过失败（修复前 1 向听），但还没有落成正式的 `shanten.test.ts` /
   `strategy.test.ts` 回归用例。**
2. **修 bug**：修复 §1 的两个问题，让步骤 1 新增的用例转绿。**代码已改**，
   但正式回归测试还没补上、也还没跑过 `pnpm verify`，不能算完成。
   - **风险评估结论（已完成）**：查过 git 历史，`default-weights.json` 是
     `532cff1` 把此前硬编码在 `strategy.ts` 里的手调字面量原样搬过去的，
     不是 `tune-cli.ts --write` 的产物——仓库里没有任何一次 `--write` 落地
     的提交记录。也就是说这组默认值本来就不是"针对旧 `shantenOf` 校准过的
     最优解"，`shantenOf` 的 cap 修复无所谓让它"失效"。**结论：不需要因为
     这次 bug 修复触发重新调参**；bug 修复本身的 A/B 证据是 §8 item 1 补的
     场景化回归测试（反例修复前后行为对比），符合下面新增的 A/B 流程规则
     里"打分公式/规则代码改动用 fixture 测试做 A/B"这一档，不需要跑
     `tune:junk`。
   - **流程改进（你提出，已落地）**：以后任何改变 AI 决策质量的改动（权重
     或打分公式）都要有 A（现状）vs B（新方案）的对比证据才能被采纳为新
     默认值，规则和工具已写进 `packages/ai/AGENTS.md`「AI 质量调优要有
     A/B 证据」一节：① 权重幅度类改动用自对弈胜率/分差做 A/B，新增
     `compare-weights-cli.ts`（`pnpm compare:junk-weights --candidate
     <path> [--baseline <path>]`，只报告不落盘，是 `tune-cli.ts --write`
     之外"直接对比两组已经定好的具体权重、不跑搜索"的通用版本，复用同一个
     `tune.ts` 的 `evaluateCandidate` 原语）；② 打分公式/规则代码改动用
     场景化 fixture 测试做 A/B（自对弈胜率信噪比不够分辨这类小改动，
     `strategy.test.ts` 里已有的回归测试就是这个模式）。一次性 B 候选权重
     文件不必进 git，指向系统 tmp/会话 scratchpad 路径即可。
3. **重构分层**：按 §2 把 Layer 1 的函数正名，junk 目录改成 import 这些
   公共函数。这一步预期步骤 1 的测试基线全绿，不改变行为。只剩"正名"这一件
   事，是否要做、改成什么名字，等你决定后再动手。
4. **实现 Layer 0 前先重新 profile 当前基线**：git 历史（`2ad9f61`、
   `532cff1`）显示 shanten 递归搜索曾占自对弈单次运行约 80% 自耗时，随后
   已经做过一轮优化（worker_threads 池 + 按轮共享 memo），把一次采样调参
   运行从 **80s 降到 11s（约 7.2×）**，记录在 `docs/process/plan.md`。当前
   单次调用成本：`standardShanten` 约 207μs/次，`ukeire`（约 35 次内部探测）
   约 2.9ms/次。**在这个已优化过的基线上重新 profile 一次**，确认递归本身
   （尤其是 `${counts.join("")}/${melds}/${tatsu}/${pair}` 这种字符串拼接
   memo key）是否仍是主要瓶颈，再决定直接上 Layer 0 建表，还是先试更便宜的
   招（比如把 memo key 换成数字/数组）。
5. ~~实现 Layer 0 + 替换 Layer 1 内部实现~~ **已完成**：按 §2 的方案（单花色
   5^9 状态建表，万/筒/条共用一张表，字牌单独一张小表，只做基础距离表，不做
   结构化并行数组）实现建表，`standardShanten` 在 `tileSet ===
   STANDARD_TILE_SET` 时改走查表 + 4 花色合并 DP，非标准 `TileSet` 回退到
   保留下来的递归实现。用大样本/穷举差分测试验证新旧实现结果一致（见 §5）；
   建表耗时/内存已实测（见 §6），决定不切到离线预生成文件方案。
6. ~~性能验证~~ **已完成**：没有用 `tune-cli.ts` 跑完整调参会话来测（那个
   会连带调参搜索本身的耗时，不是干净的对比），改用一段固定的自对弈驱动
   脚本（30 局、`temperature: 0` 确定性 argmax，跟 §4 步骤 4 用的同一种
   方法）重新跑 `--cpu-prof`，直接对比重构前后 shanten/ukeire 相关的耗时
   占比——结果见 §6"Layer 0 实现结果"，确认预计算表带来了预期收益（约
   8.75x wall-clock，后续追加两个建表剪枝后累计约 11.9x），不是纸面推导。

## 5. 验收标准

Phase 1 视为完成，需要同时满足：

- ~~步骤 1 补的回归测试集（含 §1.2 反例）全部通过。~~ **已完成**。
- ~~用同一批测试局面跑"重构前 vs 重构后"的 AI 出牌建议，除 §1 两处 bug 修复
  带来的差异外，其余局面的建议动作逐一致。~~ **已完成**：Layer 0 实现阶段
  没有单独重跑"AI 出牌建议对比"这一步，而是用更强的差分测试直接覆盖了它的
  意图——`shanten.test.ts`/`shanten-suit-table.test.ts` 对
  `standardShanten`/`ukeire`/`isTingpai`/`shantenWithExposedMelds` 做了
  大样本（数千到数万级）+ 穷举（字牌 5^7 全量）差分测试，逐位比较查表快
  路径与保留下来的递归回退实现，0 处不一致；`packages/ai` 的
  `verify:full` 全绿（42 个用例，含 arena/tune 相关慢速用例），是这些函数
  唯一的消费方，逐位一致的底层结果自然保证 AI 出牌建议不变，比另外单独跑
  一次"建议对比"更强的证据。
- ~~§4 步骤 2 的调参风险已评估并有明确结论~~ **已完成**：确认
  `default-weights.json` 是手调原值，不是 `tune-cli.ts` 产物，§1 两处 bug
  修复都不需要因此重新调参（详见"1. 现状与已发现问题"节的更新）。
- ~~§4 步骤 4 的重新 profile 已完成~~ **已完成**：见下方 §6，结论是"递归仍是
  压倒性瓶颈，值得做 Layer 0"。
- ~~如果决定做 Layer 0：建表耗时、内存占用有实测数据，且已决定是"启动时
  建表"还是"离线预生成文件"~~ **已完成**：决定懒加载内存单例、不落盘（原因
  见下方 §6"Layer 0 实现结果"），建表耗时/内存实测数据同样见下方。
- hangzhou/血战到底代码未被改动——本阶段 Layer 0 实现过程中同样未触碰这两个
  玩法的任何代码，只改了 `packages/core/src/lib/shanten.ts`、新增
  `shanten-suit-table.ts`。

## 6. 支撑数据

- 单花色（5^9=1,953,125 状态）×10 个面子/雀头目标组合，Node 单核 BFS
  建表：约 4.7 秒（未优化版本，含大量"总张数超过 14 张"的不可能状态，未做
  剪枝）。字牌（5^7=78,125 状态）×10 个目标：约 0.13 秒。万/筒/条复用同一张
  表，总建表成本 ≈ 4.8 秒；内存占用约 19MB。这是进程启动时付一次的成本，
  有明确可优化空间（剪掉总张数>14 的状态、精简 swap 内层循环、10 个目标
  并行建表），预计能压到 1 秒以内。不建议用 sqlite 等数据库存表：访问模式是
  纯粹的整数下标随机读取，进内存类型化数组即可。
- **§4 步骤 4 重新 profile 结论（已完成）**：在当前基线（worker-pool + 共享
  memo + `kindIndexOf` 修复后）上，用 `--cpu-prof` 采样一段真实自对弈（15 局
  4 人 4 圈、`temperature: 0` 确定性 argmax，约 16.7s、16795ms 有效采样）：
  `standardShanten` 内部的 `search`（78.8%）+ `take`（7.3%）+ `kindIndexOf`
  （5.7%）合计约 **91.8%** 自耗时——递归 DFS 本身仍是压倒性的主要瓶颈，不是
  已经优化到位、边际收益很小的部分。配合独立微基准（2000 次随机 13 张手牌，
  当前 Node 24 JIT 热身后）：`standardShanten` 约 108μs/次、`ukeire`
  （约 35 次内部探测）约 1.98ms/次、`junkShanten` 约 97μs/次——量级与 §4
  步骤 4 引用的旧基线（207μs / 2.9ms）一致，说明这不是测量口径漂移，
  是同一个瓶颈在测两次都成立。**结论：Layer 0 预计算表仍是当前最值得做的
  下一步**，没有出现"递归已经够快、犯不着建表"的情况，也没有发现比建表更
  便宜的替代优化点（`take`/`kindIndexOf` 已经是 §6 数据之外这次新发现的
  第二、第三大耗时点，但占比远小于 `search` 本身，说明问题不在某个可以
  局部优化的子函数，而在"递归+字符串 memo key"这个整体路径）。
- 上面 §6 表格给出的建表成本（约 4.8s / 19MB，未剪枝未优化）是跟"现算 DFS"
  这个笼统概念比较的，还没有精确到"跟当前已优化基线的真实耗时占比"做直接
  性能对比（那需要先实现 Layer 0 才能测）——但本节的新数据已经确认了"值不
  值得做"这个前置问题，直接性能对比留给 §4 步骤 5/6 实现后验证。
- 结构化并行数组（§2 Layer 0 部分）的建表成本未估算——因为 Phase 1 不做，
  等真的要加某个字段时再测。

- **Layer 0 实现结果（已完成）**：算法设计（把递归拆成"单花色子表 + 4 花色
  合并 DP"两层，m/p/s 共用一张 9-rank 表，z 单独一张 7-kind 表，每个计数
  向量存 15 个 Int8：`withEntryPair1`/`entryPair0ExitPair0`/
  `entryPair0ExitPair1` 各 5 个 Δmelds slot）先用独立 Plan agent 交叉验证过
  正确性（花色间只靠 pair 一个 bit 耦合、Δtatsu 单调不增不需要帕累托前沿，
  均无反例），详细推导见实现时的 plan 文件与
  `packages/core/src/lib/shanten-suit-table.ts` 顶部注释。
  - **建表实现走了一次弯路，记录下来避免以后重踩**：第一版实现给每个
    (计数向量,pair) 组合分配一个独立的 `Int8Array(10)`，5^9 数牌表全量建表
    实测约 **3.7 秒、峰值堆内存约 935MB**——远超"几十到几百毫秒"这个可接受
    量级。用 `--cpu-prof` 定位后确认瓶颈是几百万个小 typed array 对象的
    分配/GC，不是算法本身。改成一整块扁平 `Int8Array` memo + 递归时原地
    修改/回溯 `counts`（不再每个分支拷贝新数组）后，同样的建表降到
    **约 1.1 秒、峰值堆内存约 9MB**——内存问题基本解决，耗时仍比目标高
    几倍，但当时决定先接受（见下一条）。
  - **后续追加两个剪枝（已实施、已实测）**：①总张数 >14 的向量不建表——
    任何分支都是从 counts 里减牌再递归，子状态总张数只会更少不会更多，
    >14 的向量不可能是任何合法向量的必经之路，也不会被真实手牌的查询路径
    用到；②m/p/s 表按 rank 反转对称（1↔9、2↔8…5 自对称）只算一半镜像
    另一半——所有分支在 rank 反转下语义不变。两条都先用差分测试验证正确性
    （字牌穷举、数牌大样本、镜像对称专项用例、>14 剪枝边界用例，均 0 处
    不一致）才采纳。实测数牌表建表从约 1.1 秒降到 **约 290ms（约 3.8x）**，
    字牌表从约 20ms 降到约 15ms，内存占用没有变化。端到端自对弈耗时（同一
    段驱动脚本）从上一轮的 112ms/局 再降到 **约 82.5ms/局**，相对最初基线
    （982ms/局）总提升约 **11.9x**。多线程建表仍留作后续，目前数字已经
    足够好，没有必要再加这层复杂度。
  - **建表方式决策**：懒加载内存单例（`getNumberSuitTable`/
    `getHonorSuitTable`，`shanten-suit-table.ts`），不落盘。放弃"离线生成+
    持久化二进制文件"的原因：(a) `packages/core/AGENTS.md` 明确"禁止…任何
    I/O"，运行时读文件字面上撞这条规矩，是否允许例外属于架构级决定，不在
    这个专题里顺手扩大解释；(b) 落盘还要解决 schema 自解释/版本号/生成
    脚本改了老文件要不要失效这一整套问题，是额外复杂度，用户明确表示"先
    接受内存懒加载方案，1.1 秒建表成本可以接受，有必要再优化"。
  - **端到端 profiling（验收标准里"重新 profile"的下半场）**：用同一段
    自对弈驱动脚本（30 局、`temperature: 0`）重新采样，wall-clock 耗时从
    **982ms/局 降到 112ms/局，约 8.75x**。`--cpu-prof` 新采样显示：
    shanten 相关函数（`computeShantenViaTable`/`solveSuitVector`/
    `applyMerge`/`buildSuitTable`/`kindIndexOf`/`countsOf`/`ukeire`/
    `sevenPairsShanten`）合计约 66% 自耗时，其中 `solveSuitVector`+
    `applyMerge`+`buildSuitTable`（合计约 1.2s 自耗时）几乎全部来自"懒加载
    单例第一次建表"这一次性成本，`computeShantenViaTable` 自身（约 25%）
    才是真正跨越 30 局重复付出的运行时热路径；`fanPotential`/
    `isolationPotential`/`liveUkeireCount`/`cloneState`/`getLegalActions`
    等原来被 shanten 91.8% 自耗时压制、看不清占比的其它成本现在都显性化
    了，但都远小于 shanten 曾经的占比。**结论：Layer 0 达成了预期收益**。
    当时列的两条"留作后续"的剪枝（总张数 >14 不建表、m/p/s 按 rank 反转
    对称）后续在同一个专题里补做了，实测结果见上面"后续追加两个剪枝"那条；
    多线程建表仍未做，见那条末尾的说明。

## 7. 非目标澄清

第一阶段做完之后，junk 的对外行为（AI 出牌建议）应该只有 §1 两个 bug 修复
（以及可能触发的重新调参）带来的变化，不应该有其他行为差异——架构重构和换成
预计算表都属于"内部实现替换，外部契约不变"，这也是 §4 步骤 1 要先建回归测试
基线的原因。

hangzhou/血战到底不在本阶段交付范围内，本阶段不改它们的任何代码；它们的
`hand.ts`/`tingpai.ts` 重写和 AI/自对弈调参是否要迁移到 Layer 1（+ hangzhou
用 Layer 2）是后续阶段的决定。Layer 2 目前没有任何实现动作，也没有已确认的
近期实现时间表。Layer 0 的结构化并行数组同理，设计上不堵路，但不在本阶段
交付范围内。

## 8. 遗留清单（按优先级）

1. ~~补正式回归测试~~ **已完成**：`shanten.test.ts` 新增
   `shantenWithExposedMelds` 反例用例（1 副露 + 4 搭子 + 1 雀头 → 2 向听，
   同时断言旧公式会算成 1 向听）；`strategy.test.ts` 新增
   `weights.pengpenghu` 接线回归（自定义权重差值必须原样体现在打分差里）。
2. ~~跑 `pnpm verify`~~ **已完成**：`pnpm --filter @new-mj/core verify:full`
   （178 用例，含 slow fuzz）与 `pnpm --filter @new-mj/ai verify:full`
   （42 用例）均全绿。
3. ~~§4 步骤 2 的调参风险决策~~ **已完成**：确认 `default-weights.json` 是
   手调原值，不是 `tune-cli.ts` 产物，不需要因本次修复重新调参；顺带把你
   提出的"AI 质量调优要有 A/B 证据"流程要求落成 `packages/ai/AGENTS.md`
   规则 + 新增 `compare-weights-cli.ts` 工具。
4. ~~Layer 1 正名~~ **已完成**：`junkShanten`/`JunkShantenOptions` →
   `computeShanten`/`ShantenOptions`，`pnpm --filter @new-mj/core
   verify:full`/`pnpm --filter @new-mj/ai verify:full` 均全绿。
5. ~~§4 步骤 4 的重新 profile~~ **已完成，结论：仍值得做**：见 §6 新增段落。
   当前已优化基线上，递归 DFS（`search`+`take`+`kindIndexOf`）仍占一段真实
   自对弈约 91.8% 自耗时，微基准量级与旧基线一致，没有发现更便宜的局部
   优化点。
6. ~~Layer 0 预计算表本身~~ **已完成**：见 §6"Layer 0 实现结果"——单花色子表
   + 4 花色合并 DP，`standardShanten` 等公共函数已切到查表快路径，差分测试
   （字牌穷举 + 数牌大样本 + 整手大样本 + 包装函数大样本）全部逐位一致，
   `pnpm --filter @new-mj/core verify:full`/`pnpm --filter @new-mj/ai
   verify:full` 均全绿，端到端自对弈耗时降了约 8.75x；后续又追加两个已验证
   安全、已实测有效的建表剪枝（总张数 >14 不建表、m/p/s 按 rank 反转对称
   镜像），累计降到约 11.9x。Phase 1 至此全部完成。
7. **hangzhou/血战到底重做的时间表**：决定 Layer 1 正名/Layer 2 预留设计
   投入多少精力合适，需要你来定，本阶段不需要现在就有答案。
