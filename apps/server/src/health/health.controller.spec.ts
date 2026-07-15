import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports ok and a non-negative uptime", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const controller = moduleRef.get(HealthController);

    const result = controller.check();

    expect(result.ok).toBe(true);
    expect(result.uptime).toBeGreaterThanOrEqual(0);

    await moduleRef.close();
  });
});
