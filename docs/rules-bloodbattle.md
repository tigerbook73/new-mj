# 血战到底规则（rulesetId: `bloodbattle`）——草案

> 状态：草案 v1。按 D8 结构组织：标准配置 + 可配置项清单
> 定稿期限：阶段 1.5 开始前（可与阶段 1 并行批注）
> 基准：成都主流规则；各【待确认】处需批注

## 1. 牌集与开局

- 108 张：仅万、筒、条（无字牌、无花牌）
- 4 人；庄家 14 张、闲家 13 张
- **换三张**（标准配置开启）：各家选 3 张同花色牌，按随机方向（顺/逆/对家，由 seed 决定）交换
- **定缺**（必选阶段）：各家选定一门花色；胡牌时手牌不得含缺门牌

## 2. 行牌

- 无吃。声明窗口优先级：**胡 > 杠 > 碰**
- 杠：明杠、暗杠、补杠；杠后从牌墙尾部补摸
- 含缺门牌时不得碰/杠/胡（缺门牌只能打出）

## 3. 胡牌与血战流程

- 胡牌前提：手牌缺一门 + 基本型（4 面子 + 1 对）或七对
- **胡后不结束**：胡家离场（牌留桌面），其余继续，直至三家胡牌或牌墙摸完
- 一炮多响：标准配置**允许**，多家均胡，点炮者分别支付
- 抢杠胡：允许（他家补杠时可抢）

## 4. 计分

底分 1 分，得分 = 底分 × 2^番数（封顶见 config）。

**番型表（标准配置）**：

| 番型 | 番数 | 说明 |
|------|------|------|
| 平胡 | 0 番（1 倍） | 基本型 |
| 对对胡 | 1 番 | 4 刻子 + 对 |
| 清一色 | 2 番 | 单一花色 |
| 七对 | 2 番 | 7 个对子 |
| 金钩钓 | 1 番 | 手牌仅剩 1 张单钓 |
| 清对 | 3 番 | 清一色 + 对对胡 |
| 龙七对 | 3 番 | 七对含 4 张相同 |
| 清七对 | 4 番 | 清一色 + 七对 |
| 清龙七对 | 5 番 | 清一色 + 龙七对 |
| 清金钩钓 | 3 番 | 清一色 + 金钩钓 |
| 根 | +1 番/个 | 每副 4 张相同（含杠） |
| 自摸 | +1 番 | 标准配置：加番（可配加底） |
| 杠上花 / 杠上炮 / 抢杠胡 | +1 番 | 杠相关即时番 |
| 海底捞月 / 海底炮 | +1 番 | 最后一张 |

**杠的即时结算（刮风下雨）**：
- 明杠（含补杠）：放杠者付 1 分 ——【待确认：或三家各 1】
- 暗杠：三家各付 2 分
- **呼叫转移/退税**（标准配置开启）：杠后未胡即被查（花猪/大叫不成立时），杠钱退还——【待确认：细则版本较多，需选定一种】

## 5. 终局结算

- **查花猪**：终局仍含三门花色者，向每位非花猪家付封顶分
- **查大叫**：终局未听牌者，向每位听牌未胡家付其最大可能番的分
- 流局：牌墙尽且不足三家胡 → 进入查花猪/查大叫结算

## 6. config 清单

| 键 | 标准值 | 备选 |
|----|--------|------|
| `exchangeThree` | true | false |
| `capFan` | 4（极品） | 3 / 5 / 不封顶 |
| `multiWinOnDiscard` | true（一炮多响） | false（头跳） |
| `robKong` | true | false |
| `checkHuaZhu` | true | false |
| `checkDaJiao` | true | false |
| `gangRefund` | true | false |
| `selfDrawBonus` | 'addFan' | 'addBase'（自摸加底） |
| 番型表 | 上表 | 数据可调 |

## 7. variantState（血战私有状态预告）

定缺选择、各家已胡标记与胡牌快照、换三张阶段数据、杠分流水（供退税）——均入 `variantState`，不进公共字段（D6）。

---

# 番型用例表——格式定义 + 首批样例

> 用例即测试 fixture。Project 侧只定格式与样例；批量编写在 Claude Code 中进行（边写边跑，§6 分工）

## 格式（YAML）

```yaml
# cases/bloodbattle-scoring.yaml
- id: bb-001
  desc: 平胡·点炮
  config: standard            # 或内联覆盖项 { capFan: 5 }
  hand: [1m,2m,3m, 4p,5p,6p, 7p,8p,9p, 2s,3s,4s, 9s]   # 胡牌前手牌
  melds: []                   # 副露，如 [{type: peng, tiles: [5m,5m,5m]}]
  lack: s?                    # 定缺门（血战必填）……示例应为不含缺门的合法手牌
  win: { tile: 9s, by: discard }   # by: discard | zimo | robKong | kongFlower
  context: {}                 # 海底、杠上等标志位
  expect:
    hu: true
    fanTypes: [pinghu]
    fan: 0
    multiplier: 1

- id: bb-002
  desc: 清一色+根·自摸
  config: standard
  hand: [1m,1m,1m, 2m,3m,4m, 5m,6m,7m, 8m,8m,8m, 9m]
  melds: []
  lack: p
  win: { tile: 9m, by: zimo }
  context: {}
  expect:
    hu: true
    fanTypes: [qingyise, gen, gen, zimo]   # 两个根：111m、888m
    fan: 5                                  # 2+1+1+1
    multiplier: 16                          # capFan=4 封顶 → 2^4
    cappedAt: 4

- id: bb-003
  desc: 含缺门牌不可胡（负例）
  config: standard
  hand: [1m,2m,3m, 4p,5p,6p, 7p,8p,9p, 2s,3s,4s, 9s]
  lack: m                    # 定缺万但手上有万
  win: { tile: 9s, by: discard }
  expect: { hu: false, reason: LACK_SUIT_PRESENT }
```

## 约定

- `expect.fanTypes` 为**集合语义**（顺序无关，重复项表多个根）
- 封顶用例须同时给出 `fan`（原始）与 `cappedAt`，验证封顶逻辑独立可测
- 负例（`hu: false`）必须带机器可读 `reason`
- 每个番型至少：1 正例、1 边界例、1 与相邻番型的区分例（如清对 vs 清一色+对对胡分开计的错误写法）
- 垃圾胡用例同格式（`config: junk-standard`，expect 仅 `hu: true/false`），量很小
