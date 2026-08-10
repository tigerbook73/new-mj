# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题完成后的耐久结论归档到对应架构/契约文档。

## 当前任务

当前专题：Windows + WSL + VS Code 新成员 onboarding。

当前状态：等待用户 review `docs/onboarding/windows-wsl-vscode.md` 及 bootstrap/doctor 脚本。

已完成：

- 增加从 Windows 准备、WSL clone、VS Code Remote 到首次启动的分步指南；
- 明确 public repo 的 clone 权限、直接 collaborator 和 fork PR 两种协作方式；
- 增加非破坏性的 bootstrap：保留已有本机配置，否则生成无数据库昵称登录配置，再安装和构建；
- 增加 doctor：检查 WSL、Git、Node 24、pnpm 10.33.3、依赖、构建产物、Docker及可选运行中服务/Supabase；
- 增加完整本地 Supabase、Prisma migration、OAuth callback 和 secret 边界说明；
- README 与 doc map 已加入 onboarding 入口。

验证：bash 语法、doctor help、当前 WSL doctor、bootstrap 安装与全仓 build、Prettier、typecheck、lint、unit tests 和 `git diff --check` 已通过。根 `pnpm verify` 到 E2E 前均通过；E2E 的既有 server 对局/回放用例在 5 秒超时，允许端口后定向复跑仍为 6 个 timeout，未标全绿。当前环境 Docker daemon 不可用，未执行 `--supabase` 运行态验证。

下一步第一个具体动作：用户 review onboarding 的操作顺序和协作权限说明，确认是否需要调整。

## 阻塞与遗留问题

- 完整 Supabase doctor 需要在 Docker Desktop WSL Integration 可用的机器上验收。

## Backlog

### 独立专题：普通胡牌基础牌形校准

本专题必须在当前 `junk-ai-strategy-optimization` 收尾并完成人工合并边界后另开分支；不与当前正式 2-ply、默认权重和人工合并动作混做。第一阶段只研究普通标准牌型路线，不引入清一色、混一色、七对、碰碰胡或防守目标的联合调优。诊断模式明确使用 `standard-only`；生产模式保持当前固定规则和评分行为不变。

目标：把基础牌形的结构判断从统一加法分数中分离出来，自动发现明显牌理错误；保留当前 2-ply 作为未来牌形评价器，不把它误称为完整胡牌概率或终局 EV。

计划步骤：

0. [ ] 先建立可重复的基线 bench 与验证平台：固定一组 canonical fixtures、自动生成样本种子和代表性实战 snapshot，分别记录当前生产版权重筛选、无权重全量候选和现有 2-ply 的候选数、决策结果、运行时间、缓存命中和报告版本；增加指标计算、候选比较、决策差异和报告格式的最小测试。大样本扫描和全量 2-ply 只通过独立 CLI/slow 用例手动运行，不进入普通 `pnpm verify`。该平台只服务本专题，先不改变生产策略，也不把随机自对弈结果当作基础牌形真值。
1. [ ] 盘点现有 AI/Junk 测试并重分类：区分结构契约、策略回归、2-ply 正确性、arena/worker、policy loader 和调参平台；基础牌形期望迁移到 `structural-calibration.test.ts`，依赖当前权重的具体选牌保留为 policy regression。回放/协议 E2E 优先使用确定性 core action log；确需 bot 推进时使用显式 `twoPly: false` 的快速测试策略，并保留少量默认 `twoPly: true` 的 server AI 冒烟测试。该开关默认不改变生产行为。先迁移和标记，不直接删除；只有新诊断覆盖后才删除重复用例。
2. [ ] 定义只读 `StructuralMetrics` 诊断契约：以不同弃牌种类为候选单位，使用 `standard-only` 且脱离所有 `JunkWeights` 计算弃牌后的向听数、进张种类、有效牌数和改善概率；改善概率必须显式记录 `wallCount`、`unseenPoolSize`、公开牌河、公开副露和摸牌 horizon（至少区分早/中/晚牌山），并标注这是玩家视角估计而非完整胡牌概率。同时记录候选是否被当前生产版权重预筛选选中，并输出支配/非支配/并列分类。该诊断只生成报告，不参与生产选择。
3. [ ] 在不改变行为和对外导出的前提下做渐进式模块拆分：将 `StructuralMetrics`/手牌结构分析、2-ply、动作评分分别建立清晰边界；`strategy.ts` 暂时保留 façade，现有生产调用、缓存生命周期和结果保持等价。先拆纯函数和类型，不同时重写评分公式或调参算法。
4. [ ] 增加少量人工确认的 canonical fixtures（约 20–40 个，覆盖孤张/字牌、两面/嵌张/边张、对子/刻子拆解、低向听窄牌与高向听宽牌、早中晚牌山）；用户只需确认样例意图，不逐局标注。
5. [ ] 增加自动牌型生成器：从合法 14 张牌生成结构变体，枚举所有弃牌；对 1,000–10,000 个样本输出结构指标和分类，不把非支配冲突强行标成唯一正确答案。
6. [ ] 实现保守 Pareto 支配诊断/过滤：只有向听、进张种类、有效牌数、改善概率均不差且至少一项严格更好时才删除候选；向听与宽度冲突时保留到下一层，不先写死“向听差 1/2”的门槛。
7. [ ] 建立两种无权重预筛选的全量 2-ply 诊断对照：枚举所有不同弃牌种类，使用现有 core batch，不经过当前第一轮权重排序和断崖筛选；分别输出“当前权重叶子评分”和“standard-only 纯结构叶子评分”。同时保留生产版“权重筛选 + 2-ply”作为第三个对照，记录候选漏选数、决策差异、结构指标和耗时。该诊断先不改变生产行为。
8. [ ] 将 `isolationPotential` 从普通 `handQuality` 主分数降为极弱 tie-break，或暂时关闭；用 canonical fixtures 验证它不能跨越明确的结构优势，只能解决基础指标并列。
9. [ ] 只在结构校准通过后，用 arena 的 paired-seed、held-out seeds 和 `decision-diff` 验证普通路线；先限制调参范围到 `shantenWeight`、`tenpaiProbabilityWeight` 及 tie-break，不自动写入默认配置。
10. [ ] 若后续要接入番型路线，另开专题设计路线可行性和收益模型；不把无法可靠计算的真实胡牌概率伪装成当前校准器标签。

阶段验收：

- 诊断能解释每个候选的结构指标、支配关系和最终 tie-break 原因；
- 现有测试已完成职责分类；迁移后的结构测试与策略回归测试均有明确命名和入口，未覆盖前不删除原回归用例；
- 回放/协议测试不再以完整生产 AI 2-ply 作为唯一建局手段；快速策略和默认 2-ply 至少各有一条明确的集成覆盖，生产默认仍为 `twoPly: true`；
- 模块拆分前后生产决策、对外 API、缓存生命周期和基线耗时无未解释变化；未完成等价验证前不进入评分或默认策略改动；
- canonical fixtures 通过，自动样本只把明确支配关系作为硬结论；
- 非支配冲突不会被任意权重或 `isolationPotential` 静默覆盖；
- 2-ply 候选数和热路径耗时有基线对比，未验证的优化不进入默认策略；
- 诊断报告能区分“生产权重预筛选影响”“当前权重叶子评分影响”和“纯结构叶子评价”，并明确概率上下文与不确定性；
- 只有在全量诊断可重复、canonical fixtures 无回归、Pareto 过滤无误删、决策差异可解释且性能达到基线门槛后，才提交是否替换生产筛选的人工决策；否则保留诊断版，不改默认路径；
- AI 定向测试、类型检查、lint、构建和决策差异检查通过；若修改 core，再执行 core 完整验证和至少 1000 局 fuzz；
- 完成后才另行评估默认权重变更，并在 `plan.md` 记录采用/拒绝及证据。

- Mobile 横屏/竖屏布局与 Expo 路线；
- Junk Table UX：Replay、慢网络反馈、声明超时行为及 E2E；
- 评估 `immer` 替代 ruleset 手写 `cloneState`，先验证 fuzz 性能；
- 下次改动杭州/垃圾胡 view 时评估提取共享 PlayerView 回放逻辑；
- 下次改动结算 Overlay 时评估提取共享 `RoundEndOverlayShell`。
