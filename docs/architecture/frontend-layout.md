# 前端布局架构：几何数据层 / 渲染层 / 动作逻辑层

> 叙事文档：讲 web 端跨屏适配"是什么、为什么"。吸纳自 `process/multi-screen-refactor.md`（讨论草稿，内容已并入本文件后删除，原文见 git 历史）。取舍理由见 `decisions.md` D30。目标状态与已落地状态混杂在同一份代码里，本文件用「已实现」/「目标状态」标注区分。

## 1. 为什么不用连续 responsive

麻将桌是空间化布局——座位、弃牌区、手牌区的相对位置本身就是语义（谁是对家、弃牌堆在谁面前），不是"内容重排"式的信息流。经典 responsive design（流式重排 + 连续媒体查询断点）针对文字/卡片这类可以自由折叠、堆叠、隐藏的内容，不适合牌桌这种几何布局。

改用离散 `layoutMode`（如 landscape/portrait）：每个 mode 定义自己的参照画布（reference canvas）和区域配置，整体用固定宽高比 + 整体缩放去适配实际视口，不做连续插值断点。判断标准见 `decisions.md` D30。

这只覆盖 web 端内部（同一 SPA，从手机浏览器窄屏到桌面宽屏）；web vs mobile App（Expo/React Native）是不同渲染栈，要不要 `react-native-web` 统一是另一个待决架构问题（见 `process/plan.md` 待办），不在本文档范围。

## 2. 三层解耦架构

- **几何数据层**：纯数据，不含 React/DOM，描述每个区域（Zone）的位置、尺寸、旋转角度、内部排布方式。**目标状态**，见 §4 Zone schema。
- **渲染层**：一组"翻译"组件，把 Zone 数据转成实际 CSS/DOM，只认坐标不认业务。**部分已实现**：旋转/锚定原语（§3）已经是生产代码；把 Zone 树整体翻译成 DOM 的通用渲染组件是目标状态。
- **动作/逻辑层**：集中的会话控制器，持有当前合法动作、派发函数；展示组件是"哑"组件，只消费数据、触发回调，不直接碰协议/引擎。**目标状态**——`TableView.tsx` 目前直接订阅 socket、派生视图、派发动作，是本层要拆解的对象，具体拆解安排在 Table UX 计划的 Phase 4（见 `process/table-ux-plan.md`）。

这样设计的核心价值：布局因为适配屏幕而重新组合（比如某个信息区在竖屏下换到完全不同的组件树位置）时，不会牵连业务逻辑；业务逻辑改动也不需要关心自己被渲染在哪个屏幕方向下。这跟 `RoomService` 不知道 socket 映射（D14）是同一思路在前端的延伸。

## 3. 座位旋转技巧（已实现）

每个玩家的手牌/弃牌区永远按同一套"本地/自然朝向"坐标写死（统一从左到右），外层套一个 CSS `transform: rotate()` 摆到该座位的实际角度——`apps/web/src/components/mahjong/TableGeometry.tsx` 的 `DirectionalSurface` 就是这个技巧：`absolute top-1/2 left-1/2` + `translate(-50%,-50%) rotate(...)`，中心点旋转前后不变；旋转角度只有 `apps/web/src/lib/seatLayout.ts` 的 `SEAT_ROTATION`（`bottom:0 left:90 top:180 right:-90`）四种，子内容只在这一层容器上设置一次旋转，子孙元素不重复设置角度、靠 CSS 层叠自动继承（`transform` 只影响绘制阶段，不影响子元素 `left/top` 的布局基准）。

要区分两种旋转，不能混用同一套处理方式：

- **座位旋转**（对家倒过来、左右家竖着）——上面这套技巧，跟设备方向无关，任何 `layoutMode` 下都适用，已实现。
- **设备方向切换**（手机横屏↔竖屏）——不能靠把横屏设计整体转 90 度复用，宽高比会变，直接转会挤压或留白。应该是两套独立的 `layoutMode` 参照画布配置，只是每套内部仍然复用座位旋转技巧。

**Tile 本身**：排列方向不需要 Tile 自己管，完全是容器级的事（上面这套技巧已解决），`Tile.tsx` 不需要知道自己在哪个座位。牌面朝向（文字/花色是否要保持正读）是独立的产品体验决策，不是技术限制——容器整体旋转后牌面内容也会跟着转，如果要"始终易读"需要 Tile 内部再套一层独立的反向 `transform`，架构上可以做成 Tile 的可选 prop，目前未实现，是否需要留待未决（见 §7）。

## 4. Zone/LayoutPreset schema（目标状态）

```ts
type Zone = {
  id: string;
  anchorCenter: { x: number; y: number }; // 中心点锚点，旋转前后不变
  localSize: { w: number; h: number }; // 旋转前（本地朝向）的宽高
  rotationDeg: 0 | 90 | 180 | -90;
  arrangement:
    | { mode: "flex"; direction: "row" | "column"; gap: number; align: string }
    | { mode: "grid"; cols: number; rows: number; gap: number }
    | { mode: "absolute"; points: { x: number; y: number }[] };
  children?: Zone[]; // 坐标相对父级本地坐标系（旋转前），随父级一起旋转
};

type LayoutPreset = {
  name: string; // 如 "desktop" / "landscape" / "portrait"，按 layoutMode 命名，不按阶段命名
  referenceCanvas: { w: number; h: number };
  root: Zone;
};
```

关键设计点：

- **锚点用中心点，不用左上角**：与 §3 已实现的旋转技巧同一套心智——CSS `transform: rotate()` 默认绕元素中心旋转，`anchorCenter` 在旋转前后是同一个值，省掉一次换算。
- **`localSize` 存旋转前尺寸**，内部排布逻辑（flex/grid/absolute）永远按本地朝向写，不关心自己会被转多少度。旋转后的最终尺寸按"90 度整数倍时宽高互换，0°/180° 不互换"从 `localSize`+`rotationDeg` 推导，这条规则只对 90 的整数倍角度成立（麻将四座位场景恰好都是这几个角度）。
- **`rotationDeg` 的语义**：类型上每个 Zone 都能设，但实践中绝大多数 Zone 的 `rotationDeg` 应该是 `0`——只有代表"某个座位的整个区域"的根 Zone 才设非零值（对应 §3 `DirectionalSurface` 的用法），子孙 Zone 不需要、也不应该在渲染时把自己的角度和父级角度相加。渲染翻译组件实现时应该只在这一类"座位根"节点上应用 CSS 旋转，其余节点旋转恒为 0，避免被理解成"每层都要算旋转叠加"。
- **保留父子层级，不拍平**：子区域坐标相对父级本地坐标系书写，父级一转，子级自动跟着转。拍平会导致两个问题：一是旋转要在每个子元素上单独计算，重新引入"每张牌自己算三角函数"的问题；二是层叠顺序失去 DOM 树天然的父子级作用域，需要维护一份全局 `z-index` 表，还会撞上"带 `transform` 的元素各自创建新层叠上下文"这个 CSS 坑。保留层级则两个问题都不存在，`z-index` 只需要在同一父容器内局部唯一。
- **不引入 Yoga 或 canvas 类库**（react-konva/pixi）：D2 已定 UI 用 DOM + Motion，浏览器自带的 CSS 排版就是这层要用的引擎。

区域内部（如一手牌）用 flex/grid 排布即可，不需要精确到每张牌的坐标，浏览器算行内位置比手写坐标表更稳；`absolute` 模式留给确实需要精确定位的场景。

## 5. 区域组合：原子 vs 组合（目标状态）

拆成"展示原子"和"组合方式"两层：Tile、ActionButton 这类最小展示单元跨 `layoutMode` 复用，不感知自己被摆在哪；"多个展示原子怎么分组排布"（独立弃牌区 vs 合并牌河）是真正因布局而异的部分，值得写成不同的组合组件，但消费同一份底层数据，不出现两套平行的数据处理逻辑。空间受限的 `layoutMode`（尤其竖屏）可能需要把多个区域合并显示（如四家弃牌合并成一个带来源标记的公共牌河）；目前只有桌面+计划中的横竖屏几种，几个组合组件就够，不需要提前搭一个通用的动态拼装引擎。

## 6. 跨区域动画（目标状态）

区域内部排布用 flex/grid 天然连续，不需要特殊处理。真正需要坐标的场景是跨区域移动（摸牌飞入手牌、打出的牌飞到弃牌堆、吃碰杠汇聚成一组）——这类跨容器动画普通 CSS transition 做不到平滑过渡（DOM 节点换父容器动画会断）。D2 已定 UI 用 Motion，其 `layoutId` 共享布局动画机制正是为这个场景设计的，自动计算元素跨容器移动前后的位置差值做插值。

**用 TileId 复用为 `layoutId`**：不强制每张牌都要有，但给客户端知道真实身份的牌配上成本很低。评审点 A 已决定牌用实例 ID（TileId）作为 React key，直接复用同一个 TileId 作为 `layoutId` 即可，不用另起一套判断逻辑。

**例外——对手未公开的牌**：按可见性模型（`key-designs.md` §2），这类牌的真实 TileId 客户端根本不知道，只知道数量，只能渲染成占位牌，靠位置/序号做简单过渡，不存在身份延续。等它被打出/吃碰/亮牌后才拿到真实 TileId，从那一刻起才能用 `layoutId` 做身份延续动画；占位牌切换到真身这个瞬间用简单淡入/替换处理即可，不强求做成无缝共享布局过渡。

`motion`/`framer-motion` 目前不是 `apps/web` 的依赖，引入时机随 Table UX 计划 Phase 5（事件驱动牌桌动画）落地。

## 7. 动画的场景化与降级策略（目标状态）

动画需要因场景（`layoutMode`、设备性能、事件密集程度如一炮多响/抢杠胡、`prefers-reduced-motion`）调整表现，但有一条不可破的底线：**动画只影响观感，绝不影响最终状态正确性**。这呼应核心不变量"事件重建 ≡ 直接派生"（`key-designs.md` §4）——不管动画放不放、放多快，应用完事件流之后的 UI 状态必须收敛到跟 `getPlayerView` 直接派生的结果一致。

建议在事件流和渲染层之间加一个轻量动画调度层：接收事件，根据当前场景信号（`layoutMode` 性能预算、`prefers-reduced-motion`、短时间内事件积压量）决定"这次完整播放/简化/直接跳到终态"。各展示组件不需要自己判断该不该播动画，调度层已经决定好该给它什么样的过渡。具体阈值/规则留到 Table UX 计划 Phase 5 实现时再定，先用最简单的规则（事件积压超过阈值就跳过动画）。

## 8. 动作/逻辑层与 store 边界（目标状态）

业务逻辑（判断合法动作、调用协议/引擎、派发动作）集中在一处，展示组件只接受数据 + 回调，不直接调用协议/引擎，也不自己维护业务状态。集中方式 hook/context/store 都可以，关键规则是"业务逻辑只有一个来源，展示组件不能绕过它自己实现"。考虑到布局会因 `layoutMode` 大幅重组（同一组件在不同布局下可能出现在组件树完全不同的位置），用现有的 Zustand（`useSessionStore`）让组件不管自己在树的哪个位置都能直接订阅，比强行按 props 一层层传更合适。

用 store 时保持一条边界：把"游戏领域状态"（PlayerView、合法动作、派发函数）和"视图/布局状态"（当前 `layoutMode`、动画降级标志）分成清楚独立的 slice，即使用同一个 store 库也不要混在一起——`useSessionStore`（领域）与 `useTableLayoutStore`（视图，目前只存 tile 主题）已经是这个模式的雏形，新增 `layoutMode`/动画降级状态时延续这个拆分，不要往 `useSessionStore` 里加"根据 `layoutMode` 判断能不能碰"这类逻辑。

## 9. 起草工具

沿用现有 Lab 模式（`/dev/table-layout`，滑块+数字输入实时调参、localStorage 持久化）——这套模式已经在 P4.1 桌面布局的真实验收里证明够用，不需要引入 `react-moveable` 之类的拖拽/旋转可视化编辑工具，除非滑块方式被证明不够用。Table UX 计划 Phase 1 会把这个工具升级为能编辑/导出 §4 的 `LayoutPreset` JSON，工具内部实现细节（是否需要扁平存储+导出时计算旋转前坐标）留到那时再定。

## 10. 已上线代码的迁移路径

`TableLayoutConfig`（`apps/web/src/lib/tableLayoutLab.ts`）是 P4.1 已合入 main、经过真实浏览器验收的桌面布局配置，不因为"有了新抽象"就冲动重写。迁移策略：用现有桌面布局（唯一已验证、有完整 Playwright 回归覆盖的场景）作为 Zone/LayoutPreset schema 的第一个消费者——用既有回归测试当安全网，把 `TableLayoutConfig` 的数值手工翻译成一份桌面 `LayoutPreset`，验证 schema 设计本身站不站得住脚，视觉零变化才算通过。新的 `layoutMode`（手机横屏/竖屏）之后直接基于这份 schema 设计，不再各自摸索一套平行的扁平 config。

## 11. 未决问题

- **设备方向实时切换**：是否允许同一局游戏中旋转设备切换横竖屏（而非锁定方向）？如果允许，需要专门验证 `layoutMode` 切换时动画状态、正在进行的跨区域过渡不会丢失或错乱。
- **牌面是否需要反向旋转保持正读**：产品体验决策，见 §3；架构上预留可选 prop，用不用没有定。
