# Junk 普通型结构组件消融

## 目标与边界

在既有普通型路线门禁内，分别只启用结构 turn/discard 或结构 claim，定位完整结构候选的质量
退化来源。七对、清/混一色、碰碰胡倾向和路线打平节点继续回退 weighted；不调权重、不改
结构算法、不切生产默认入口。

## 固定候选

- `--component turn`：`ordinary-standard` 的 self-turn/discard 使用 structural，claim 使用 weighted。
- `--component claim`：`ordinary-standard` 的 claim 使用 structural，self-turn/discard 使用 weighted。
- `--component all`：保留完整普通型结构候选，作为既有对照。

`structural compare` 对每个候选继续运行两个换位 split，报告总分、胜场、失败、路线节点数、
单次决策延迟和 candidate 的 even/odd split 分数。每份报告均为临时可重建数据，不归档。

## 首轮结果

- `turn`：顶层 seed `20260819`，15 seeds / 30 场；无失败，候选/weighted 总分 `22/-22`，
  胜场 `14/13`、3 平，candidate even/odd 为 `83/-61`，P95 `25.787ms`。
- `claim`：顶层 seed `20260820`，15 seeds / 30 场；无失败，候选/weighted 总分 `40/-40`，
  胜场 `17/10`、3 平，candidate even/odd 为 `18/22`，P95 `24.337ms`。

两个组件单独均通过首轮总分与性能筛查，不能把完整候选的负分直接归因于其中一个组件。
由于两组使用不同 seed，当前证据也不能区分组件交互与样本波动；尤其 turn 的 split 方差很大。

## 同 seed 矩阵

顶层 seed `20260821` 生成同一批 15 seeds，三路各运行 30 场换位 match，均无失败：

- `turn`：候选/weighted `-57/57`，胜场 `11/19`，even/odd `-30/-27`，P95 `27.494ms`。
- `claim`：候选/weighted `-18/18`，胜场 `12/12`、6 平，even/odd `8/-26`，P95 `25.184ms`。
- `all`：候选/weighted `-20/20`，胜场 `14/15`、1 平，even/odd `4/-24`，P95 `27.725ms`。

逐 seed/split 的 `all - turn - claim` 候选分数残差合计 `+55`；30 项中 15 正、11 负、4 为
零，范围 `[-8, 12]`。它是同初始随机输入下的轨迹级诊断，不是可加的因果效应：不同策略会
改变后续状态，三路并不共享同一决策轨迹。结果只能说明完整组合没有呈现额外负残差；更关键的
结论是 turn 与 claim 的首轮正分均未在新 seeds 上复现，任何结构组件都尚无稳定生产证据。
