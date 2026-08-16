# Junk 普通型结构生产切换

## 决策

Junk 生产默认从历史 weighted 策略切换为完整普通标准型结构策略。目标是建立无连续权重、
确定性、可解释且可逐项扩展的新生产基线；这是主动接受已知自对弈强度可能回退的产品决策，
不把它表述为结构策略已经战胜 weighted。

## 边界

- `recommendJunkAction`/`chooseJunkAction` 默认调用完整结构 facade。
- discard 使用支配过滤、最多 5 个首弃的 bounded 2-ply；claim 与 self-turn gang 使用既有
  固定预算结构 continuation；hu/zimo 永远优先，draw 直接透传。
- 当前只经营普通标准型。七对、番型收益、防守、抢杠与行动时机价值尚未纳入构牌目标。
- 旧 weighted 实现、默认权重和诊断工具不删除，改为显式 legacy/evaluation 对照和安全回退；
  自对弈 arena 与历史 policy-loader 必须显式选择 legacy，不能随生产 facade 漂移。
- 旧 `strength`/`weights` 参数暂时保留源代码兼容，但生产 facade 不消费；后续 top-down 整理
  再审计调用方并决定是否收窄公共 API。

## 已知证据

结构 facade 已通过合法动作完整对局、canonical fixture、bounded/full teacher 近似和性能门禁。
既有 paired A/B 同时表明它相对 weighted 的终局表现不稳定且总体偏弱；本次切换将 weighted
降级为历史参照，不再把战胜它作为新基线成立的前置条件。

## 验收

- 生产 facade 与结构 facade 行为一致，传入 legacy strength/weights 不改变结果。
- weighted arena、调权与历史 policy loader 继续显式调用 legacy weighted。
- AI `verify:full`、根 `pnpm verify` 全绿；生产源不依赖 evaluation。
