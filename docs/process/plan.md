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
- 当前 `StructuralMetrics` 足够解释首个 canonical 差异；只有后续样本出现无法解释的决策差异时，才增加面子、雀头或搭子分解字段。

## 当前状态

步骤 0、0b、1、2、3 已完成；下一步进入步骤 4：人工确认的 canonical fixtures。生产策略现已按 weights、无权重 analysis/cache、hand-quality、2-ply continuation、action-scoring 和兼容 facade 单向拆分。

影响后续判断的结论：

- 通用 `packages/ai/src/evaluation/` 已统一 manifest/report/comparator、JSONL、worker executor 和 resumable batch/checkpoint；Junk 只注入 provider、evaluator task 和输出命名。离线 scenario、policy、weights、arena 工具统一位于 `src/junk/evaluation/`，生产路径不得反向依赖。
- canonical fixture 与固定可见状态 snapshot 共用主链；production-weighted、one-ply-all、two-ply-all 有六份不可自动覆盖的版本化 baseline。generated provider 延后到步骤 5，不提前定义牌型生成语义。
- `standard-only@v1` 已作为第四路只读 evaluator 接入 canonical single-scenario 报告；对每个合法弃牌记录普通标准型向听数、进张牌种/牌种数和按玩家可见信息估计的剩余进张张数，不加权、不选动作，也不包含七对或番型目标。
- 首个 canonical 样例已证明最小字段能解释非单调候选：弃 `5p` 为 2 向听、15 种/50 张进张，弃 `3m` 虽为 16 种/53 张进张却退到 3 向听；当前无需提前加入面子/雀头/搭子分解。进张张数不是墙内真值、自摸概率、完整胡牌概率或终局 EV。
- `strategy.ts` 同时是生产 facade 与跨 Git ref policy-loader 的加载根；动作模拟、单层评分、cliff/fallback 和两层候选编排现集中在 `action-scoring.ts`，facade 只保留兼容导出、胜利动作优先、argmax/softmax 与最终动作选择；这条耐久依赖边界已下沉到 `packages/ai/AGENTS.md`。
- 静态牌形质量位于 `hand-quality.ts`，自摸二层 continuation probe 位于 `two-ply.ts`；`strategy.ts` 继续按原路径导出既有 API。最终一次对 `HEAD` 与当前实现的 3-seed policy diff 覆盖 2110 个决策点且分歧为 0，原始 action 引用、cliff、fallback、全部评分、现有 probe/production fixtures 与六份 baseline 均保持不变。
- policy capture 现在显式复制 `strategy.ts`、`action-scoring.ts`、`analysis.ts`、`hand-quality.ts`、`two-ply.ts`、`weights.ts`、默认权重 JSON 和概率 helper；Git ref loader 仍按该 ref 当时实际存在的顶层生产闭包取快照，因此旧 ref 不要求拥有新模块。
- AI/Core 慢速测试已按正确性边界审计：Core 保留向听/表等价性质、回放与每玩法 100 局 fuzz；重复 conservation、AI 真实调参循环、30 局 arena 统计与强弱胜率暂时退出自动门禁，恢复条件见 `backlog.md`。单局 arena/policy worker/decision-diff 接线正确性仍在 `verify:full`，真实调参与万局收尾改走手工入口。
- AI `evaluate` CLI 与其 TypeScript 检查统一启用 `development` export condition，直接消费 Core `src`；离线诊断不再依赖预先构建且可能过期的 Core `dist`，worker 继承同一 Node condition。
- 自动 fuzz 冒烟统一由每玩法 1000 局降为 100 局，保留专题收尾人工万局门禁；根 E2E 的 lobby 失败实为 Server 5 秒超时后 Turbo 中断 Web 的级联结果，replay 套件现由四个测试客户端按合法动作推进、不再借生产 AI bot 造 fixture，真实默认 AI advice 冒烟只对单条用例使用 10 秒预算。

下一步第一个具体动作：开始步骤 4 前先补充该步骤的专门计划，盘点现有 canonical fixtures 覆盖的结构冲突与人工判定依据，明确需要新增的最小样例集合；此动作只定义验收边界，不提前实现步骤 5 的生成器。

## 专题路线图

每一步开始前，结合当时状态补充该步骤的专门计划；未开始的步骤不提前实现或标记完成。步骤完成后，只在本文件保留结果、证据、限制和对后续步骤有影响的判断。

- 0 已完成：可重复的基线 bench 与验证平台
- 0b 已完成：AI evaluation 工具统一收口
- 1 已完成：AI/Junk 测试盘点与职责重分类
- 2 已完成：只读 StructuralMetrics 诊断契约
- 3 已完成：结构分析、2-ply 与动作评分模块边界
- 4 下一步：人工确认的 canonical fixtures
- 5 待开始：自动牌型生成器与样本报告
- 6 待开始：保守 Pareto 支配诊断/过滤
- 7 待开始：无权重全量 2-ply 三路诊断对照
- 8 待开始：isolationPotential 影响边界校准
- 9 待开始：普通路线的 paired-seed 与 held-out 验证
- 10 后续独立专题候选：番型路线收益模型可行性；不在本专题自动启动

## 阻塞与遗留问题

- 尚无阻塞；若发现需要改变 RuleSet 接口、协议语义或跨层边界，暂停实现并标 TODO 提回架构决策。

## 后续事项

候选专题统一见 [`backlog.md`](backlog.md)，不从候选列表自动选择下一项；由用户明确指定后再建立新的 `plan.md` 当前任务。
