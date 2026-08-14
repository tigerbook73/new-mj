# 待完成任务与当前状态

> 本文件只记录当前专题的目标、步骤、当前状态、影响后续判断的关键结论和遗留问题；覆盖更新，不累积过程记录。候选专题统一见 `backlog.md`；专题完整结束后按 workflow 将仍有耐久价值的内容分流到架构、契约或测试文档。

## 当前任务

当前专题：普通胡牌基础牌形校准。

目标：把标准普通牌型的结构判断从统一加法分数中分离出来，自动发现明显牌理错误；保留当前 2-ply 作为未来牌形评价器，不把它称为完整胡牌概率或终局 EV。

范围：第一阶段只研究 `standard-only` 普通标准牌型，不引入清一色、混一色、七对、碰碰胡或防守目标的联合调优。生产模式保持当前固定规则、默认权重和 `twoPly: true` 行为不变。

### 专题验收

验收标准：

- 固定一组 canonical fixtures、自动生成样本种子和代表性实战 snapshot；
- 对每个样本分别记录生产版权重筛选、无权重全量候选和现有 2-ply 的候选数、决策结果、运行时间、缓存命中和报告版本；
- 增加结构指标、候选比较、决策差异和报告格式的最小测试；
- 大样本扫描和全量 2-ply 仅通过独立 CLI/slow 用例手动运行，不进入普通 `pnpm verify`；
- 该平台只服务本专题，先不改变生产策略，也不把随机自对弈结果当作基础牌形真值。

不可违反约束：

- 诊断与生产路径分离；未完成等价验证前不改评分公式、默认权重、候选筛选或 AI 对外行为；
- 规则实现仍集中在 core，AI 只消费 core 提供的标准牌型能力；
- 诊断必须明确区分玩家视角估计、牌山/公开信息上下文和完整胡牌概率；
- 测试与实现同一 commit；若修改 core，按 testing strategy 增加至少 100 局 fuzz 冒烟；
- 每个当前步骤开始前，可建立一份临时专门计划；步骤完成后只把影响后续判断的结论归并到本文件，不保留过程日记。

当前待验证：

- 结构指标与生产权重可能产生冲突；先记录差异和非支配关系，不预设“向听差 1/2”或 `isolationPotential` 的权重结论；
- 当前 `StructuralMetrics` 的向听、理论/存活进张种类和存活张数足够解释已确认差异；只有后续样本出现无法解释的决策差异时，才增加面子、雀头或搭子分解字段。

## 当前状态

步骤 0、0b、1、2、3、4、5、6、7、8 已完成；下一步进入步骤 9：普通路线的 paired-seed 与 held-out 验证。生产策略保持 weights、无权重 analysis/cache、hand-quality、2-ply continuation、action-scoring 和兼容 facade 的单向边界。

影响后续判断的结论：

- 通用 `packages/ai/src/evaluation/` 已统一 manifest/report/comparator、JSONL、worker executor 和 resumable batch/checkpoint；Junk 只注入 provider、evaluator task 和输出命名。离线 scenario、policy、weights、arena 工具统一位于 `src/junk/evaluation/`，生产路径不得反向依赖。
- canonical fixture 与固定可见状态 snapshot 共用主链；最小人工确认集合固定为两类关系：`discard-001` 的“较低向听 vs 更宽进张”冲突，以及 `discard-snapshot-001` 同向听下的严格进张宽度优势。关系、精确指标和理由位于独立版本化 expectation，不让 `standard-only` 选择动作；production-weighted、one-ply-all、two-ply-all 的六份 baseline 保持不变。
- `standard-only@v2` 已作为第四路只读 evaluator 接入 canonical 与 batch 报告；对每个合法弃牌记录普通标准型向听数、理论进张牌种/牌种数，以及按玩家可见信息估计的存活进张种类和剩余张数，不加权、不选动作，也不包含七对或番型目标。
- 首个 canonical 样例已证明最小字段能解释非单调候选：弃 `5p` 为 2 向听、15 种/50 张进张，弃 `3m` 虽为 16 种/53 张进张却退到 3 向听；当前无需提前加入面子/雀头/搭子分解。进张张数不是墙内真值、自摸概率、完整胡牌概率或终局 EV。
- `strategy.ts` 同时是生产 facade 与跨 Git ref policy-loader 的加载根；动作模拟、单层评分、cliff/fallback 和两层候选编排现集中在 `action-scoring.ts`，facade 只保留兼容导出、胜利动作优先、argmax/softmax 与最终动作选择；生产边界与 evaluation 框架的耐久约束以 `packages/ai/AGENTS.md` 为准，具体命令和当前来源支持以 evaluation README 为准。
- 静态牌形质量位于 `hand-quality.ts`，自摸二层 continuation probe 位于 `two-ply.ts`；`strategy.ts` 继续按原路径导出既有 API。最终一次对 `HEAD` 与当前实现的 3-seed policy diff 覆盖 2110 个决策点且分歧为 0，原始 action 引用、cliff、fallback、全部评分、现有 probe/production fixtures 与六份 baseline 均保持不变。
- policy capture 现在显式复制 `strategy.ts`、`action-scoring.ts`、`analysis.ts`、`hand-quality.ts`、`two-ply.ts`、`weights.ts`、默认权重 JSON 和概率 helper；Git ref loader 仍按该 ref 当时实际存在的顶层生产闭包取快照，因此旧 ref 不要求拥有新模块。
- AI/Core 慢速测试已按正确性边界审计：Core 保留向听/表等价性质、回放与每玩法 100 局 fuzz；重复 conservation、AI 真实调参循环、30 局 arena 统计与强弱胜率暂时退出自动门禁，恢复条件见 `backlog.md`。单局 arena/policy worker/decision-diff 接线正确性仍在 `verify:full`，真实调参与万局收尾改走手工入口。
- AI `evaluate` CLI 与其 TypeScript 检查统一启用 `development` export condition，直接消费 Core `src`；离线诊断不再依赖预先构建且可能过期的 Core `dist`，worker 继承同一 Node condition。
- 自动 fuzz 冒烟统一由每玩法 1000 局降为 100 局，保留专题收尾人工万局门禁；根 E2E 的 lobby 失败实为 Server 5 秒超时后 Turbo 中断 Web 的级联结果，replay 套件现由四个测试客户端按合法动作推进、不再借生产 AI bot 造 fixture，真实默认 AI advice 冒烟只对单条用例使用 10 秒预算。
- `scenario generate` 已接入 `standard-concealed-v1`：显式 seed 从完整牌集生成无副露 14 张玩家视角，按牌种计数全局去重后再以稳定序号分片；manifest 中每个样本保存独立 seed/version，provider 会重建并校验内容，不能把任意 JSONL 冒充该 seed。生成分布不读取 canonical expectation、权重或生产评分，也不代表实战阶段分布；代表性中盘继续由固定 snapshot 提供。
- generated JSONL 已复用通用 batch/checkpoint/worker/report 主链并支持六路 evaluator；Markdown 逐场景记录候选数、选择、耗时和 cache hit/miss，JSON 保留完整候选指标。固定 seed `20260814` 的小样本接线报告各路均成功并覆盖每场 14 个合法弃牌动作；该小样本只证明链路，不作为校准结论。
- 同向听 Pareto 诊断只用 `liveImprovingKindCount` 与 `liveImprovingTileCount`：两项都不差且至少一项更好才严格支配；理论种类仅作解释，不同向听、完全并列和宽度/张数冲突均不产生支配。每个候选只读记录同向听前沿及支配、被支配、并列、不可比较 ID；未接入生产筛选或动作选择。
- live 指标扣除自身手牌、四家公开牌河与公开副露，并按 TileId 去重，避免被鸣牌同时作为牌河墓碑和副露引用时重复扣减；不使用对手暗手、真实牌墙或隐藏信息。固定 seed `20260814` 的 100 个无副露/无牌河生成场景中，1400 个动作有 904 个在各自同向听层被支配，生产选择有 12 次落入该集合；这只证明诊断能发现差异，不能替代带公开信息 snapshot、人工复核或成为生产过滤依据。
- 三条 2-ply 路径现已明确分离：`two-ply-all` 枚举全部首层弃牌并用当前加权 hand-quality 选择 continuation；`two-ply-structural-all@v1` 枚举全部首层弃牌和各进张后的全部牌种弃牌，只报告最低向听层的 Pareto 前沿、立即完成质量与条件期望最佳向听，不因偏序关系选择首层动作；`production-weighted` 继续使用当前生产筛选、cliff/fallback 和最终选择。新增结构路径只存在于 evaluation，生产行为未改变。
- 结构 2-ply 的进张质量按玩家可见信息下仍未知的所有牌副本归一化，公开牌河和副露会影响剩余副本，自身手牌也会扣除；不读取对手暗手或真实牌墙。由于离线 snapshot 不保证保留整局历史弃牌，不能用当前牌墙张数加对手暗手张数作为概率分母。其立即完成质量和条件期望向听只是下一摸结构估计，不是整局自摸率、胡牌概率或终局 EV。
- canonical 三路接线对照五个 evaluator 均成功且 content hash 一致：两个当前加权路径都选中 `tile108`，结构路径覆盖 14 个首层候选且不选择动作；固定 seed `20260814` 的 3 个生成样本结构 batch 为 3/3 成功、每场 14 个首层候选，约 3.84 场/秒。该小样本只证明语义、接线和报告可复现，不构成策略质量结论。
- `isolation-boundary@v1` 只读 paired evaluator 固定比较当前默认权重与仅将 `isolationPotential` 置零的权重，同时报告 one-ply/two-ply 分数、差值、组内排名和缓存统计；只有普通向听、存活进张种类/张数，以及结构 2-ply 的进张质量、立即完成质量、条件期望最佳向听和第二弃牌前沿统计完全相同的候选才进入同一可归因组。它不选择动作，未修改默认权重或生产路径。
- 固定中盘 snapshot 的 14 个候选中只有 2 个满足完整结构等价：one-ply 开关 isolation 后仍并列，two-ply 组内顺序发生反转，证明 isolation 的边际影响可经续行 leaf 出现；其余 12 个候选不会跨结构组比较。固定 seed `20260814` 的 3 个生成样本为 3/3 成功，结构等价候选分别为 8、8、7 个，one-ply 无排名变化，two-ply 仅首个样本有 1 个候选排名变化，约 2.28 场/秒。该证据只界定影响范围，不支持保留、删除或调整权重的质量结论。

下一步第一个具体动作：开始步骤 9 前先补充 paired-seed 与 held-out 专门计划，固定不重叠的开发/留出 seed、样本规模、可复现 manifest、人工复核入口，以及“结构支配错误不得增加、留出集不得变差”的验收口径；在该协议落地前不采纳任何权重或评分候选。

## 专题路线图

每一步开始前，结合当时状态补充该步骤的专门计划；未开始的步骤不提前实现或标记完成。步骤完成后，只在本文件保留结果、证据、限制和对后续步骤有影响的判断。

- 0 已完成：可重复的基线 bench 与验证平台
- 0b 已完成：AI evaluation 工具统一收口
- 1 已完成：AI/Junk 测试盘点与职责重分类
- 2 已完成：只读 StructuralMetrics 诊断契约
- 3 已完成：结构分析、2-ply 与动作评分模块边界
- 4 已完成：人工确认的 canonical fixtures
- 5 已完成：自动牌型生成器与样本报告
- 6 已完成：保守 Pareto 支配诊断/过滤
- 7 已完成：无权重全量 2-ply 三路诊断对照
- 8 已完成：isolationPotential 影响边界校准
- 9 下一步：普通路线的 paired-seed 与 held-out 验证
- 10 后续独立专题候选：番型路线收益模型可行性；不在本专题自动启动

## 阻塞与遗留问题

- 尚无阻塞；若发现需要改变 RuleSet 接口、协议语义或跨层边界，暂停实现并标 TODO 提回架构决策。

## 后续事项

候选专题统一见 [`backlog.md`](backlog.md)，不从候选列表自动选择下一项；由用户明确指定后再建立新的 `plan.md` 当前任务。
