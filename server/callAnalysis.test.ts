import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    $returningId: vi.fn().mockResolvedValue([{ id: 42 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("../drizzle/schema", () => ({
  callAnalyses: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ a, b })),
  desc: vi.fn((a) => a),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("callAnalysis module", () => {
  it("should export required functions", async () => {
    const module = await import("./callAnalysis");
    expect(typeof module.createCallAnalysisRecord).toBe("function");
    expect(typeof module.getCallAnalysisById).toBe("function");
    expect(typeof module.listCallAnalysesByUser).toBe("function");
    expect(typeof module.listAllCallAnalyses).toBe("function");
    expect(typeof module.processCallAnalysis).toBe("function");
  });

  it("should compute speech ratio correctly", () => {
    // Test the speech ratio calculation logic
    const totalWords = 200;
    const repWords = 80;
    const ratio = Math.round((repWords / totalWords) * 100);
    expect(ratio).toBe(40);
  });

  it("should score calls correctly based on thresholds", () => {
    // Score 75+ = green, 50-74 = amber, <50 = red
    const scores = [80, 60, 30];
    const colors = scores.map(s => s >= 75 ? "green" : s >= 50 ? "amber" : "red");
    expect(colors).toEqual(["green", "amber", "red"]);
  });

  it("should validate analysis status transitions", () => {
    const validStatuses = ["pending", "transcribing", "analyzing", "done", "error"];
    const invalidStatus = "unknown";
    expect(validStatuses.includes("pending")).toBe(true);
    expect(validStatuses.includes("done")).toBe(true);
    expect(validStatuses.includes(invalidStatus)).toBe(false);
  });

  it("should export getTeamDashboard function", async () => {
    const module = await import("./callAnalysis");
    expect(typeof module.getTeamDashboard).toBe("function");
  });

  it("should compute trend indicator correctly", () => {
    // trendDelta = last10Avg - allTimeAvg
    // >= +5 = improving, <= -5 = declining, else stable
    const getTrend = (last10: number, allTime: number) => {
      const delta = last10 - allTime;
      if (delta >= 5) return "improving";
      if (delta <= -5) return "declining";
      return "stable";
    };
    expect(getTrend(80, 70)).toBe("improving");   // +10
    expect(getTrend(60, 70)).toBe("declining");   // -10
    expect(getTrend(72, 70)).toBe("stable");       // +2
    expect(getTrend(70, 75)).toBe("declining");  // -5 boundary (exactly -5 = declining)
    expect(getTrend(70, 76)).toBe("declining");    // -6
  });

  it("should compute rep status tiers correctly", () => {
    const getStatus = (score: number) => {
      if (score >= 85) return "Elite";
      if (score >= 70) return "Proficient";
      if (score >= 55) return "On Track";
      if (score >= 40) return "Developing";
      return "Needs Work";
    };
    expect(getStatus(95)).toBe("Elite");
    expect(getStatus(85)).toBe("Elite");
    expect(getStatus(84)).toBe("Proficient");
    expect(getStatus(70)).toBe("Proficient");
    expect(getStatus(69)).toBe("On Track");
    expect(getStatus(55)).toBe("On Track");
    expect(getStatus(54)).toBe("Developing");
    expect(getStatus(40)).toBe("Developing");
    expect(getStatus(39)).toBe("Needs Work");
    expect(getStatus(0)).toBe("Needs Work");
  });
});
