# 系统总览：部署、拓扑、工程结构

> 叙事文档：讲"现在系统实际长什么样、部署在哪、包怎么依赖"。取舍理由不在本文重复，见 `decisions.md`（D1/D10/D13/D17）；部署选型（Render+Supabase）的理由已直接写在 §2，不再指回 `decisions.md`（原 D3）。

## 1. 系统图

```
 web (React SPA，阶段 3-5 已交付)    mobile (Expo, 阶段 7)
        \                /
         Socket.IO（唯一业务通道；OAuth 走 Supabase SDK 直连）
                 |
   server (NestJS)：GameRoom = 有状态对象
   ├─ 握手鉴权（JWT/Supabase token → socket.data.userId，阶段 5）
   ├─ RoomManager（单进程内存 Map）
   ├─ 计时器（超时代提交 pass；deadline 广播）
   └─ 事件分发（按可见性过滤）
                 |
   core（纯函数引擎，零依赖）
   applyAction(state, seat, action) → { state', events } | { error }
                 |
   PG(Supabase)：profiles/game_logs/room_sessions（阶段 5 已交付，见 contracts/session-mechanics.md §11；待接真实 Supabase 项目，见下）
```

## 2. 部署视图

- **server**：Render（付费档）。原因是 WebSocket 长连接需要长驻进程，排除了 Vercel 一类 serverless 平台；回合制麻将对延迟不敏感，不需要 Fly.io 式多区域部署。
- **鉴权 + 数据库**：Supabase，开箱提供 OAuth（Google/GitHub）与 PG——代码侧阶段 5 已接入（`auth.middleware.ts` 的 Supabase 校验分支、web 的 OAuth 登录按钮、Prisma schema/持久化），但仓库里还没有绑定一个真实 Supabase 项目/OAuth Client secret，本地开发默认走 `supabase start` + D16 的开发态假登录，见 `decisions.md` D22。
- **web**：静态托管（SPA），阶段 3 已交付（Vite + React + React Router + Tailwind + shadcn/ui + Zustand，见 D17 与 `apps/web/AGENTS.md`）。
- **mobile**：Expo，阶段 7 交付，路线未定（是否 react-native-web 统一见 `process/plan.md` 待办）。
- **除 OAuth 外全走 Socket.IO**：没有独立的 REST/tRPC 层，查询用 ack 模式实现；服务端仅暴露 `/health`。

## 3. 包拓扑（依赖方向 = 架构本体，dependency-cruiser 强制）

```
core ← ai            core：零依赖（纯函数可测试性的前提）
core ← server → protocol
        web/mobile → protocol（只依赖协议与类型，不 import 引擎实现）
```

## 4. 工程结构

- Monorepo（pnpm workspace + Turbo）。
- 模块系统：`apps/server` 是仓库里唯一的 CommonJS 包（其余 ESM），跟随 NestJS 官方默认构建方式；`core`/`protocol`/`ai` 用 tsup 双发 CJS+ESM 兼容两边。生产构建消费 `dist`；本地开发态 `apps/server`/`apps/web` 直接消费 shared package 的 `src`（`development` export 条件，见 `decisions.md` D24），不经过 `dist`。
- 依赖方向由 dependency-cruiser 在 CI 强制检查，不是靠约定。
- 测试运行时按包生态选择（Vitest for core/protocol/ai，Jest for server），不强求全仓统一 runner；细则见 `testing-strategy.md`。

## 5. 一条动作的旅程

玩家点"碰"：client 发 `game:action {peng}`（ack 仅回执受理）→ Room 将其入队（每房间串行）→ 调 `applyAction` → 得到新 state 与 events → Room 替换 state 引用 → 按每个事件的 visibility 标注分发（含发起者本人）→ 各客户端把事件应用到本地视图。客户端状态永远 = 入局快照 + 事件流；服务端持唯一权威 GameState。

## 6. 账号级会话仲裁

同一账号可能同时从"同一个 tab 刷新""同一浏览器另一个 tab""不同浏览器/设备"这三种关系发起新连接，server 靠握手时客户端带的 `tabId`（`sessionStorage`）/`browserId`（`localStorage`）身份信号确定性区分，不再靠"大概率是自己刷新前的旧连接"这类猜测：同 tab 静默接管；同浏览器另一个活跃 tab 硬拒绝，客户端跳独立死路页（不清共享凭证，避免把还在用的那个 tab 一起挤下线）；不同浏览器才弹确认框、用户可选择接管或换号登录。完整分支逻辑与错误码见 `contracts/session-mechanics.md`"账号级并发连接约束"；决策记录见 `decisions.md` D27。

字段与消息契约见 `contracts/engine-contract.md`、`contracts/protocol-shared.md`；具体玩法规则见 `variants/*.md`；设计模式叙事见 `key-designs.md`；取舍理由见 `decisions.md`。
