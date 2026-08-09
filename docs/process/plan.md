# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题证据与详细提案见专题文档。

## 当前任务

当前专题：Junk AI 决策质量优化，详见 [`junk-ai-decision-quality.md`](./junk-ai-decision-quality.md)。

当前状态：

- Phase 1 的概率评分、迟疑阈值、既有副露 ukeire 修复和有界结构缓存已完成。
- 2-ply 自摸诊断探针已有目标/反例 fixture，但尚未接入默认评分；当前完整探针约 13.3–13.6ms/probe。
- Top-N 2-ply 已完成修正概率模型后的 32 手牌/96 case A/B：1-ply/Top-1/Top-2/Top-3 相对全量 2-ply 一致率为 71.9%/71.9%/87.5%/93.8%，存在明显决策漂移，拒绝直接接入默认评分。
- Top-2 分差触发全量的分级 2-ply 已评估：阈值 0–2 仅约 96.9% 一致且回退约 69%–72%；阈值 5 才全一致但回退 90.6%、估算更慢，拒绝该判据。
- 以 1-ply 排名/分数作为 2-ply 安全上界的剪枝已否定：修正后 Top-1 相对全量 2-ply 仅 71.9% 一致，不能证明未评估候选不可能胜出。
- 结构副产品筛选已完成 1000 个确定性随机手牌 A/B：结构 Top-4 一致率 93.1%、约 34.13ms/case；全量约 97.15ms/case，约 2.85x，但仍有 6.9% 漂移，暂不接入默认评分。
- “最低弃牌后向听层”黑名单已完成 1000 个确定性随机手牌 A/B：平均保留 7.233 个候选，一致率 100%、平均分差 0，约 60.06ms/case 对全量 97.15ms/case；随机样本约 1.62x，但待结构化/对抗性 fixture 验证，暂不默认接入。
- 已生成可复用的 10000 case 全量 2-ply 基准数据：[`junk-two-ply-baseline.jsonl`](../../packages/ai/benchmark-data/junk-two-ply-baseline.jsonl) 和 [`manifest`](../../packages/ai/benchmark-data/junk-two-ply-baseline.manifest.json)，由 8 个 worker 生成，数值统一保留 9 位小数；重生成命令为 `pnpm --filter @new-mj/ai generate:two-ply-baseline [count] [output] [workers]`。
- JSONL loader/A-B runner 已接通；`compare:two-ply-baseline` 复用全量基准，只计算候选方案。最新 1000 case 复用结果的最低向听黑名单一致率为 100%、平均候选 7.233 个、平均分差约 0，耗时 60.852ms/case。
- 结构化 fixture 已新增并验证共 12 类：原有 6 类加清一色倾向、混一色倾向、字牌刻子、七对子/单色取舍、幺九未来形状、开口清一色；结构 Top-4 与最低向听黑名单均与全量 2-ply 一致，最低向听层在部分 fixture 可将候选降至 1–5 个，但并非普遍有效。
- 已新增对抗性搜索工具并运行 1000 个确定性样本：覆盖 0–2 个固定吃副露、随机手牌、最多 9 张可见弃牌；最低向听黑名单与全量 2-ply 一致率 100%，未发现反例，耗时 88.703 秒；结果保存在 `packages/ai/benchmark-data/junk-two-ply-adversarial-cases.json`，但仍不能替代穷举证明。
- fan-weight stress 已找到边界反例：在 `pure-suit-drift` 中将 `shantenWeight=10`、`qingyise/hunyise=160` 后，全量 2-ply 选 `1p`，最低向听黑名单选 `5z`，分差约 59.597；默认权重仍一致。因此该黑名单只可视为绑定当前权重的候选优化，不能作为跨权重安全剪枝。
- 动态 Top-N 已纳入实验计划：按当前权重计算的预评分曲线、分数差和断崖位置决定 N，同时设置 `minN`/`maxN`；实验比较不同上下限，记录候选数、排名一致率、实际分数遗憾和总耗时，避免平坦曲线造成性能失控，也避免固定 N 的质量/性能偏差。
- 加权预评分提升为动态 Top-N 和所有白名单/黑名单的前置条件：必须把当前权重下的向听、ukeire、番型潜力、对子/刻子保留和未来形状纳入候选筛选；最低向听只能作为信号，不能先行排除可能换取清一色/混一色路线的弃牌。
- 加权 Top-N 1000 case 实测：Top-1/Top-2/Top-4 一致率 87.5%/100%/100%，耗时 8.554/16.796/33.338ms/case；但高番型 `pure-suit-drift` stress 中仍错过全量的 `1p`，说明现有即时 `fanPotential` 不等于番型轨道潜力。
- 低成本轨道预评分已有诊断实现：对每个候选仅做 O(34) 牌面计数，计算主花色、杂色、字牌，再按权重形成清一色/混一色潜力分；复用已有计数，不新增 core API、不重复运行 shanten。默认权重下 1000 case 的 Top-4 一致率为 100%、35.163ms/case，12 个定向 fixture 全部一致；高番型 stress 仍有其他 fixture 漂移，暂不接入默认策略。
- 动态 Top-N 诊断已收敛并拒绝默认接入：`minN=2`、`maxN=4`、分数窗口 4、断崖阈值 12；1000 case 平均保留 4 个候选，一致率 100%、平均分数遗憾 0、33.346ms/case，与固定加权 Top-4 基本相同；`maxN=4` 是性能护栏，不再继续探索更大的上限。12 个默认结构 fixture 全部一致，但高番型 stress 仍有个别漂移。
- 2-ply 候选间共享纯结构缓存已完成诊断：1000 case、4 candidates 平均命中 141.75 次、未命中 1367.875 次，命中率约 9.4%，平均缓存规模 256；耗时 34.336ms/case，相对独立缓存约 35.163ms/case 只提升约 2.4%，一致率 100%、分数遗憾 0，暂不接入默认路径。
- 候选 × 摸牌统一批处理重叠率测量已完成：4 candidates 平均 136 个摸牌后状态中只有 3 个重复，精确结构重叠率约 2.21%，拒绝继续实现该路线。
- 第二轮复用首轮排序的固定 Top-4 白名单已完成诊断：平均仅评估 3.942 个第二轮候选、约 12.77ms/case，但相对全量 2-ply 一致率仅 87.5%、平均分差约 0.793，拒绝硬剪枝。
- 第二轮动态断崖白名单已完成诊断：分数平坦时扩大候选、出现断崖时收缩；1000 case 平均评估 7.824 个第二轮候选、约 24.33ms/case，一致率 100%、平均分差约 0，暂作为低成本候选保留，不接入默认路径。其质量仍受启发式模型限制，随机化只能作为近似平分时的探索手段。
- core prober 已完成无语义拆分；继续拆单花色 solver/table-builder 已拒绝。
- 高潜候选已拆成两条路线：不改公共接口的 AI/内部实现路线，以及待架构确认的 core batch API 路线；所有候选先评估/测试，再决定接受或拒绝。core 方案草案已写入 [`architecture/shanten.md`](../architecture/shanten.md)，未实现。

下一步第一个具体动作：将 [`architecture/shanten.md`](../architecture/shanten.md) 中的 core batch API 备选形状和确认门槛提交 Claude Project；确认前不改 core 公共接口，动态 2-ply 自对弈 A/B 暂排在架构确认之后。

## 阻塞与遗留问题

- 庄家疑似不是每局最先出牌的人：下次处理先写最小复现用例，再定位庄家判定或出牌顺序。

## Backlog

- Mobile 横屏/竖屏布局与 Expo 路线。
- 结算展示：放铳牌从牌河飞入结算展示区，先定义结算区目标落点。
- Junk Table UX：Replay 逐步牌面、慢网络反馈、声明超时归零行为及 E2E；逐步 god replay 受终局归档模型限制，需架构决定。
- 评估 `immer` 替代 ruleset 手写 `cloneState`，先验证 fuzz 性能。
- 下次改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估抽取重复 PlayerView 回放逻辑。
- 下次改动结算 Overlay 时，评估提取共享 `RoundEndOverlayShell`。

## 待定内容

- 血战到底专属桌面体验：换三张、定缺、血战状态与操作 UI。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- AI Bot：杭州与血战到底的玩法专属策略；日麻立项后再实现其策略。
