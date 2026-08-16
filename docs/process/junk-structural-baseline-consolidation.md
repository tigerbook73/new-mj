# Junk AI structural baseline consolidation

## 目标与护栏

仓库只保留一个持续演进的 Junk 生产基线：当前普通标准型 structural。后续每个特性只与进入
该 slice 前的 structural baseline 做 paired 比较，不再要求与 weighted legacy 比较。Git 历史
承担旧版本回溯；当前树不长期维护一套完整 legacy 策略。

本专题分小提交完成。先固定 baseline 和通用 evaluation，再提取旧实现中可复用的机制，最后
删除 weighted 专用闭包。任何整理提交不得改变当前结构决策、提前接入七对/番型/防守，或把
生成样本当牌理真值。

文档收敛不是最后一步才开始：每个 slice 必须同步更新其影响到的 `plan.md`、README、架构、
测试策略、命令说明、代码注释和待办，删除或改写已经失效的 legacy 默认语义。第 6 步仍保留，
用于对全仓库做一次 top-down 最终审计，发现并清除跨 slice 遗留的过期命名、链接和叙述。

## 目标依赖图

```text
server / advice
      │
      ▼
public Junk facade ──► structural discard / claim / turn ──► core structure facts

baseline capture ─┐
candidate module ─┼─► generic policy loader / diff / arena / trace / report
scenario fixtures ┘
```

最终生产路径不得依赖 weights 或 evaluation；evaluation 不预设 baseline 的评分范式。

## 文件级资产清单

### A. 保留：structural production

- `strategy.ts`：收敛为生产 facade 和结构诊断重导；兼容参数在调用方审计后删除。
- `structural-discard.ts`、`structural-claim.ts`、`structural-turn.ts`：当前生产实现及贴近单测。
- `structural-routes.ts`：七对/特殊路线尚未接入生产，但属于明确的未来结构能力，保留。
- `docs/architecture/shanten.md`：作为结构比较、预算和信息边界的原理文档继续维护。

### B. 保留并通用化：baseline/candidate evaluation

- 通用 `src/evaluation/` 全部保留。
- Junk scenario provider、snapshot/generated、canonical expectations、structural metrics/Pareto、
  bounded/full teacher audit 保留。
- `match/arena.ts`、arena worker 与命令保留对局引擎，移除默认 weighted `strengthPolicy` 绑定，
  改为显式 baseline/candidate policy 输入。
- `policy-loader`、capture、decision diff 保留 Git ref/module/capture 能力；去掉
  `DEFAULT_JUNK_WEIGHTS`、weights JSON 和 weighted export 形状要求。
- `tune-pool.ts` 中通用 worker/policy-match 能力迁出 weighted tune 命名；纯权重优化部分删除。
- trace/report 保留通用机制；`structural compare/trace` 的 weighted/structural 专用壳在通用工具
  覆盖同等证据后删除。

### C. 先提取方案，再决定删除载体

- `analysis.ts` 的 bounded LRU/memo 模式：先记录缓存 key、生命周期和命中测试；只有结构性能
  benchmark 证明需要时才提取为结构缓存，否则随 legacy 删除。
- `two-ply.ts`、`action-scoring.ts` 中的动态筛选、cliff/hurdle、硬预算和提前停止思想：先形成
  不依赖加权总分的算法说明与可重建场景；未来作为独立 structural candidate 重新实现，不保留
  旧权重实现作为模板。
- `tile-probability.ts` 的有限总体抽样函数：审计是否有独立、明确的未来消费者；有则迁为中性
  工具并保留数学测试，无则只保留设计结论后删除。
- policy capture / Git ref 加载机制直接通用化，不因旧策略删除。

### D. 通用化完成后删除：weighted-only production/evaluation

- `default-weights.json`、`weights.ts`、`hand-quality.ts`、`action-scoring.ts`、旧 `two-ply.ts` 及
  `recommend/chooseLegacyWeightedJunkAction`。
- `weights compare/tune` 命令、权重 optimizer/worker、isolation boundary/removal、paired isolation
  validation 与 `scenario validate`。
- `production-weighted` evaluator/task/baseline/schema 名称和资产；先建立 structural baseline 资产，
  再删除，避免出现无基线窗口。
- 只断言权重幅度、softmax、权重写回、isolation 调参或 weighted 内部分数的测试。
- `backlog.md` 中旧权重调参、isolation 删除和 weighted 推广待办。

### E. 测试迁移原则

- 牌型场景有独立价值时保留输入，改断言 structural 动作、结构事实或明确不变量。
- 只证明旧公式某个权重被读取的测试删除。
- arena、worker、loader、capture、diff 的契约测试改为中性 baseline/candidate fixture。
- 每个删除 slice 先用 `rg` 证明无生产/通用消费者，再运行 AI `verify:full` 和根 `pnpm verify`。

## 实施顺序

1. [完成] `baseline-v1`：固定当前 production structural 的版本身份、canonical 行为资产、完整对局合法性
   与性能边界；明确 candidate 从该版本派生。
2. [完成] `neutral-evaluation`：通用化 policy loader、arena、diff/capture 和 worker 命名/API。
3. [完成] `reusable-designs`：逐项记录动态筛选、cliff/hurdle、缓存和概率工具的独立契约与取舍。
4. [下一步] `remove-weighted-tuning`：删除权重调参、isolation 专项和对应测试/待办。
5. `remove-weighted-runtime`：删除 weighted 生产闭包与 legacy facade，收窄公共 API。
6. `docs-and-names`：在各 slice 已同步维护文档的基础上，对 evaluator/fixture/README、架构、
   测试策略、命令说明、注释、backlog 和 plan 做 top-down 最终审计，收敛遗漏的过期命名、链接
   与叙述，并完成依赖审计。

每一步独立提交，并把相关文档更新纳入该步 DoD。若通用化工具尚不能复现 baseline/candidate
对比，禁止进入相应删除步骤。
