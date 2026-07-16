import { test, expect, type Browser, type Page } from "@playwright/test";

async function loginAs(browser: Browser, nickname: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill(nickname);
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
  return page;
}

// 3d 的核心验证：4 个独立浏览器 context 模拟 4 个真人玩家，走完建房 → 加入 →
// ready → start 的完整房间生命周期，全靠 room:playerJoined/room:readyChanged
// 广播和 game:snapshot 单播驱动，不依赖任何命令 ack 更新状态（架构铁律 5）。
test("4 players create, join, ready up, and start a junk room together", async ({ browser }) => {
  const [host, p2, p3, p4] = await Promise.all([
    loginAs(browser, "host"),
    loginAs(browser, "p2"),
    loginAs(browser, "p3"),
    loginAs(browser, "p4"),
  ]);
  const players = [host, p2, p3, p4];

  // page.goto() would be a full page reload, wiping the in-memory Zustand
  // session (socket/userId) — navigate the same way a real user would,
  // through React Router's client-side transition from the picker button.
  for (const page of players) {
    await page.getByRole("button", { name: "Junk Hu" }).click();
    await expect(page).toHaveURL(/\/lobby\/junk$/, { timeout: 10_000 });
  }

  await host.getByRole("button", { name: "Create room" }).click();
  const heading = host.getByRole("heading", { name: /^Room / });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  const roomId = (await heading.textContent())!.replace("Room", "").trim();
  expect(roomId).toMatch(/^[0-9a-f-]{36}$/);

  for (const page of [p2, p3, p4]) {
    await page.getByPlaceholder("Room ID").fill(roomId);
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByRole("heading", { name: /^Room / })).toBeVisible({ timeout: 10_000 });
  }

  // 每个客户端各自看到 4 个座位都到齐（room:playerJoined 广播驱动的实时同步）。
  for (const page of players) {
    await expect(page.getByRole("listitem")).toHaveCount(4, { timeout: 10_000 });
  }

  for (const page of players) {
    await page.getByRole("checkbox").check();
  }

  // 房主等所有人都显示 Ready 再点开始，避免 canStart() 因还没同步到而拒绝。
  await expect(host.getByText("(Ready)")).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start" }).click();

  for (const page of players) {
    await expect(page).toHaveURL(new RegExp(`/room/${roomId}$`), { timeout: 10_000 });
  }

  for (const page of players) {
    await page.context().close();
  }
});

// 阶段 4 AI 补位的验收路径：单人开房，补满 3 个 bot 座位，能自己 ready + start，
// 不需要另外 3 个真人浏览器 context——这是"一个人也能玩"的大厅层前置条件。
test("host fills remaining seats with bots and starts solo", async ({ browser }) => {
  const host = await loginAs(browser, "host");
  await host.getByRole("button", { name: "Junk Hu" }).click();
  await expect(host).toHaveURL(/\/lobby\/junk$/, { timeout: 10_000 });

  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByRole("heading", { name: /^Room / })).toBeVisible({ timeout: 10_000 });

  // players 是固定 4 长的座位元组（空座位也渲染一个"空"的 <li>），listitem
  // 数量从一开始就恒为 4，不能拿来判断补了几个 bot——改成认每个 bot 各自的
  // 座位昵称，addBot() 按空位顺序补，昵称是 `AI-${座位号+1}`。
  for (const nickname of ["AI-2", "AI-3", "AI-4"]) {
    await host.getByRole("button", { name: "Add Bot" }).click();
    await expect(host.getByText(nickname, { exact: false })).toBeVisible({ timeout: 10_000 });
  }
  // 房间坐满后 Add Bot 按钮应该自己消失，不给出无意义的第 5 次点击入口。
  await expect(host.getByRole("button", { name: "Add Bot" })).toHaveCount(0);

  await host.getByRole("checkbox").check();
  await expect(host.getByText("(Ready)")).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 10_000 });

  await host.context().close();
});

// 轻量冒烟：只验证大厅层本身不写死 junk，bloodbattle 一样能建房、看到自己入座
// 第 0 座——不重复整套 4 人流程（那部分逻辑与玩法无关，已经在上面测过）。
test("bloodbattle lobby creates a room and seats the host at seat 0", async ({ browser }) => {
  const page = await loginAs(browser, "host");
  await page.getByRole("button", { name: "Bloodbattle" }).click();
  await expect(page).toHaveURL(/\/lobby\/bloodbattle$/, { timeout: 10_000 });

  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: /^Room / })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("listitem").first()).toContainText("host");

  await page.context().close();
});
