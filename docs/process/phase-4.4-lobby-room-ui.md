# 阶段 4.4：大厅/房间 UI 重做

> 过程性文档：本子阶段的详细实施计划，由 `plan.md`/`phase-4-junk-complete.md` 链接过来。收尾时把耐久内容按 `doc-map.md` §6 吸纳到对应文档，再删除本文件。

## 用户需求（原话整理）

1. 除了麻将相关的术语（table 页），不使用中文——非 table 页的界面文案全部英文，table 页里的麻将术语（吃/碰/杠/胡等）可以保留中文，但页面上其他非术语文案同样应该英文。
2. `LoginView` 直接用 shadcn 的 `login-03` block，不再手写表单布局。
3. 登录后玩法用标签页管理：用户切换标签，下方联动显示对应玩法的大厅内容（替换现在"选玩法进两个按钮"的 `GamePickerView`）。
4. 大厅改列表形式：上方有搜索条；点击列表项进入房间页；房间页里玩家可以自己选座位，也可以为指定的空座位加 bot（不再是"总是补最靠前的空位"）。
5. 用户可以主动离开房间：
   - 房间还没开局（`waiting`）时离开——回到大厅列表；如果是房主（座位 0）离开，整个房间销毁，其余在等待的人也被踢回大厅。
   - 房间已经在对局中（`in-game`）时离开——不销毁、不真正移除，行为等同断线（复用阶段 4.2 的 `isAutoPiloted` 机制），继续打到局终。这条是跟用户确认过的（详见下方问答记录）。
6. table 页要不要参照现成实现：没有能确认可靠的参考可以照抄，决定先把 1-5 做完，牌桌之外的骨架稳定后再单独设计 table 页——**本文件不含 table 页重做，明确排除在外**。

**确认过的两个设计点**（AskUserQuestion 记录）：

- 对局中的"离开"按钮：提供，行为与断线一致（转托管，不删房、不移除座位）。
- 搜索条搜什么：现在房间没有名字，加一个房间名称字段（`room:create` 时房主可填，不填给默认值），列表和搜索都基于这个名字，不是 UUID。

## 现状（改动前）

- 路由：`/login` → `/games`（`GamePickerView`，两个按钮进 `/lobby/:rulesetId`）→ `/lobby/:rulesetId`（`LobbyView`，建房/按 roomId 加入/ready/start，start 后靠 `game:snapshot` 跳 `/room/:roomId`）→ `/room/:roomId`（`TableView`，对局中，不改动）。
- `room:join`/`RoomService.join()`/`addBot()` 都是"自动找第一个空座位"，玩家/房主不能指定座位。
- 没有 `lobby:list`：加入房间只能手动输入 roomId（`session-mechanics.md` §8 一直标"❌"）。
- 没有 `room:leave`：`session-mechanics.md` §6 一直标"尚未实现"，`room:leave` 转托管本身也没做。
- `Room`/`RoomInfo` 没有名字字段，只有 UUID。
- `ERROR_CODES` 没有"座位已被占用"这个语义，复用 `ROOM_FULL` 不准确。

## 子步骤路线（各自验证后提交，照阶段 3/4 系列的做法）

> **执行顺序调整**：4.4.3（标签页框架）动手时发现它跟 4.4.5（大厅列表+房间页）耦合太紧——"标签切换但下面内容不变"这种中间态没有独立验证价值，做完马上要在 4.4.5 整个推翻重做。改成先做 4.4.4（协议+server，纯后端，不依赖 4.4.3），4.4.3 和 4.4.5 合并成一步一起做（标签框架直接接真实的房间列表内容，不留中间态）。下表编号保留，只是实现顺序变成 4.4.1 → 4.4.2 → 4.4.4 → (4.4.3+4.4.5 合并) → 4.4.6。

| 步骤                        | 内容                                                                                                                                                                                 | 验证方式                                                                    | 状态 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---- |
| **4.4.1 i18n**              | 现有非 table 页文案（`LoginView`/`GamePickerView`/`LobbyView`）全部换英文；table 页（`TableView`）里跟麻将规则相关的术语保留中文，其余（按钮/提示语）也换英文                        | 浏览器手测走一遍现有流程，确认没有遗漏的中文（table 页术语除外）            | ✅   |
| **4.4.2 login-03**          | `LoginView` 换成 shadcn `login-03` block（`npx shadcn@latest add login-03`），适配现有 `devAuth`/`connect` 登录逻辑，不改鉴权流程本身                                                | 现有 3 条 `app.e2e-spec.ts` 用例照常通过（选择器可能要跟着新 DOM 结构调整） | ✅   |
| **4.4.3 标签页大厅入口**    | `/games` 从"两个按钮"改成 Tabs（junk / bloodbattle），下方联动显示对应大厅内容（这一步先只做标签框架，大厅内容本身留给 4.4.5 一起改）                                                | e2e：切换标签内容跟着变                                                     |      |
| **4.4.4 协议 + server**     | 见下方"协议改动"完整清单：房间名称字段、`lobby:list`、`room:join`/`room:addBot` 支持指定座位、新增 `room:leave`、新增 `SEAT_TAKEN` 错误码、新增 `room:playerLeft`/`room:closed` 事件 | `RoomService` 单测覆盖每条新分支；`apps/server` e2e 补一条真实 socket 场景  | ✅   |
| **4.4.5 大厅列表 + 房间页** | web：房间列表（名称 + 座位占用 + 搜索）、`room:peek` 展示房间页（选座位/为空位加 bot/ready/start）                                                                                   | e2e：创建房间→在列表搜到→点进去→选座位→ready→start 全流程                   |      |
| **4.4.6 离开房间**          | web：房间页加"离开"按钮，等待阶段调用 `room:leave`（房主离开会被踢回大厅并看到房间已关闭提示，非房主离开正常回大厅）；对局中同样提供离开按钮，效果同断线                             | e2e：非房主离开、房主离开、对局中离开三条路径                               |      |

**明确不在本轮范围内**：table 页重做（见上面第 6 点）；重连恢复真人操控（`isAutoPiloted`/离开后的座位永远回不去，跟阶段 4.2 保持一致）；`lobby:list` 的实时推送（房间列表现在是查询一次的快照，不随其他人建房/离开自动刷新，需要的话手动切标签/重新搜索会重新查）。

## 协议改动（4.4.4 的完整清单）

- **`RoomInfoSchema`/`RoomSummarySchema`** 新增 `name: z.string()`。
- **`RoomCreateRequestSchema`** 新增 `name: z.string().optional()`——不填时 server 给默认值（默认值同样是英文，形如 `${nickname}'s room`，不违反"非 table 页不用中文"）。
- **`lobby:list`**（新 ack 查询）：请求 `{ rulesetId: string; search?: string }` → 响应 `RoomSummary[]`，服务端按 `rulesetId` + `phase === "waiting" && status === "open"` 过滤（对局中/已结束的房间不会出现在列表——同 MVP 一贯的"不做观战"边界），`search` 按房间名称大小写不敏感子串匹配。
- **`room:peek`**（新 ack 查询）：请求 `{ roomId: string }` → 响应 `RoomInfo`，纯读不产生副作用（不占座）——房间页在玩家真正选座位前，靠这个展示当前座位占用情况；一次性快照，不实时更新，选座位时 `room:join` 由 server 校验，真被别人抢了会拿到 `SEAT_TAKEN`。
- **`room:join`** 请求加 `seat: SeatIdSchema.optional()`——给了就必须是当前空座位（否则 `SEAT_TAKEN`），不给保留现在"自动找第一个空位"的行为（向后兼容，e2e 里已有用例这么用）。
- **`room:addBot`** 请求从"空对象"改成 `{ seat: SeatIdSchema.optional() }`，语义同 `room:join`。
- **新增错误码 `SEAT_TAKEN`**：加进 `ERROR_CODES`，指定座位已被占用时用，区别于 `ROOM_FULL`（房间整体没位置了）。
- **新增 `room:leave`**（ack 命令，无 payload，身份取自连接）：
  - `waiting` 阶段：房主（座位 0）离开 → 删除整个房间，向房间内其余连接广播 `room:closed { reason: "hostLeft" }`；非房主离开 → 座位置空，广播 `room:playerLeft { seat }`。
  - `in-game` 阶段：复用 `RoomService` 内部同一条"标记 `isAutoPiloted` + 跑 `autoPlayBots`"路径（`handleDisconnect` 用的那条），不删房、不置空座位——跟断线是同一个效果，只是触发方式从"socket 断开"变成"主动调用"。
  - `finished` 阶态：no-op。
  - gateway 侧：ack 成功后做 `client.leave(roomId)`（退出 Socket.IO 房间，不再收该房间后续广播）+ `connections.untrack(client)`（跟断线时一样的清理），但**不断开 socket 本身**——用户还要留在大厅继续用同一个连接建房/搜房。
- **新增事件 `room:playerLeft`**：payload `{ seat: SeatId }`（`session-mechanics.md` 早就在"未实现"列表里预留了这个名字）。
- **新增事件 `room:closed`**：payload `{ reason: "hostLeft" | "allPlayersLeft" }`（类型留字面量联合，见下一条）。
- **全部真人退出即关房**（用户在实施过程中补充的需求）：`handleDisconnect`（阶段 4.2 已实现）和新增的 `room:leave`（`in-game` 分支）共享同一条"标记 `isAutoPiloted`"私有方法——这个方法标记完之后，如果房间里已经**没有任何真人座位**（每个座位要么本来就是 `isBot`，要么都被标了 `isAutoPiloted`），就不再调用 `autoPlayBots` 继续跑，而是直接把房间标记 `phase: "finished"`/`status: "closed"`，广播 `room:closed { reason: "allPlayersLeft" }`——避免没有任何人观战的房间里 bot 互相打到底白白占资源。这条检查要**同时**补进阶段 4.2 已经上线的 `handleDisconnect`，不是只有新的 `room:leave` 才有。

## 路由改动（4.4.5 涉及）

- `/games`：`GamePickerView` 改造成 Tabs + 房间列表 + 搜索条 + "创建房间"入口，不再是"两个按钮各自跳转"。
- `/lobby/:roomId`（参数从 `:rulesetId` 改成 `:roomId`）：新的"房间页"——`room:peek` 展示座位占用，空座位可点击坐下（`room:join`）或加 bot（`room:addBot`），ready 勾选，房主可见 start，所有人可见 leave。这是 `LobbyView` 的重做，不是新文件。
- `/room/:roomId`：不变，仍是 `TableView`（对局中），不在本轮改动范围。

## 待办（不阻塞本轮，但相关）

- `lobby:list` 目前是一次性查询，不是实时推送；如果以后觉得"大厅列表要跟着别人建房实时更新"是必须的，需要另立一轮设计（新增 lobby 级广播机制），不在这轮直接做。
