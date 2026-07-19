import { HealthController } from "./health.controller";

const makePrisma = () => ({ $queryRaw: jest.fn() });

describe("HealthController", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = originalDatabaseUrl;
  });

  it("reports a degraded health result when no database is configured", async () => {
    delete process.env["DATABASE_URL"];
    const prisma = makePrisma();
    const controller = new HealthController(prisma as never);

    const result = await controller.check();

    expect(result).toMatchObject({ ok: false, database: { configured: false, ok: false } });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it("checks the configured database connection", async () => {
    process.env["DATABASE_URL"] = "postgresql://localhost/test";
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const controller = new HealthController(prisma as never);

    const result = await controller.check();

    expect(result).toMatchObject({ ok: true, database: { configured: true, ok: true } });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("reports the database as unhealthy when the query fails", async () => {
    process.env["DATABASE_URL"] = "postgresql://localhost/test";
    const prisma = makePrisma();
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    const controller = new HealthController(prisma as never);

    const result = await controller.check();

    expect(result).toMatchObject({ ok: false, database: { configured: true, ok: false } });
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});
