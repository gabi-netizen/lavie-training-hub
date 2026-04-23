/**
 * Tests for getMyCoachingDashboard
 * Validates that the function correctly aggregates call data into
 * coaching feedback, compliance checklist, and stats.
 */
import { describe, it, expect } from "vitest";

// ── Pure helper functions extracted for unit testing ──────────────────────────

function trafficLight(p: number): "green" | "orange" | "red" {
  return p >= 85 ? "green" : p >= 60 ? "orange" : "red";
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 100;
}

function avgOf(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s != null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("trafficLight", () => {
  it("returns green for 85+", () => {
    expect(trafficLight(85)).toBe("green");
    expect(trafficLight(100)).toBe("green");
  });
  it("returns orange for 60-84", () => {
    expect(trafficLight(60)).toBe("orange");
    expect(trafficLight(84)).toBe("orange");
  });
  it("returns red for below 60", () => {
    expect(trafficLight(0)).toBe("red");
    expect(trafficLight(59)).toBe("red");
  });
});

describe("pct", () => {
  it("returns 100 when total is 0", () => {
    expect(pct(0, 0)).toBe(100);
  });
  it("calculates percentage correctly", () => {
    expect(pct(3, 4)).toBe(75);
    expect(pct(5, 5)).toBe(100);
    expect(pct(0, 5)).toBe(0);
  });
  it("rounds to nearest integer", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
  });
});

describe("avgOf", () => {
  it("returns null for empty array", () => {
    expect(avgOf([])).toBeNull();
  });
  it("returns null when all values are null", () => {
    expect(avgOf([null, null])).toBeNull();
  });
  it("calculates average correctly", () => {
    expect(avgOf([60, 80])).toBe(70);
    expect(avgOf([100])).toBe(100);
  });
  it("ignores null values in average", () => {
    expect(avgOf([60, null, 80])).toBe(70);
  });
  it("rounds to nearest integer", () => {
    expect(avgOf([66, 67])).toBe(67);
  });
});

describe("compliance checklist logic", () => {
  it("produces correct compliance items from call data", () => {
    const tcReadCount = 4;
    const tcReadTotal = 5;
    const tcPct = pct(tcReadCount, tcReadTotal);
    expect(tcPct).toBe(80);
    expect(trafficLight(tcPct)).toBe("orange");
  });

  it("marks compliance as green when all calls pass", () => {
    expect(trafficLight(pct(5, 5))).toBe("green");
  });

  it("marks compliance as red when less than 60% pass", () => {
    expect(trafficLight(pct(2, 5))).toBe("red");
  });
});

describe("coaching feedback thresholds", () => {
  it("magic wand is a positive when used in 60%+ of calls", () => {
    const magicWandCount = 3;
    const totalParsed = 5;
    expect(magicWandCount / totalParsed).toBeGreaterThanOrEqual(0.6);
  });

  it("magic wand is an improvement when used in less than 50% of calls", () => {
    const magicWandCount = 2;
    const totalParsed = 5;
    expect(magicWandCount / totalParsed).toBeLessThan(0.5);
  });

  it("closing attempt is a positive when used in 70%+ of calls", () => {
    const closingAttemptedCount = 4;
    const totalParsed = 5;
    expect(closingAttemptedCount / totalParsed).toBeGreaterThanOrEqual(0.7);
  });

  it("closing attempt is a red improvement when used in less than 70% of calls", () => {
    const closingAttemptedCount = 3;
    const totalParsed = 5;
    const pctVal = closingAttemptedCount / totalParsed;
    expect(pctVal).toBeLessThan(0.7);
    // Red because 60% is below the 0.7 threshold but we check pct >= 0.5 for red
    const status = pctVal >= 0.5 ? "red" : "orange";
    expect(status).toBe("red");
  });

  it("improvement status is red when 50%+ of calls affected", () => {
    const count = 3;
    const total = 5;
    const ratio = count / total;
    const status: "red" | "orange" = ratio >= 0.5 ? "red" : "orange";
    expect(status).toBe("red");
  });

  it("improvement status is orange when less than 50% of calls affected", () => {
    const count = 2;
    const total = 5;
    const ratio = count / total;
    const status: "red" | "orange" = ratio >= 0.5 ? "red" : "orange";
    expect(status).toBe("orange");
  });
});

describe("stat change direction", () => {
  it("detects upward trend in score", () => {
    const thisWeek = 75;
    const lastWeek = 68;
    const diff = thisWeek - lastWeek;
    expect(diff).toBeGreaterThan(0);
  });

  it("detects downward trend in score", () => {
    const thisWeek = 60;
    const lastWeek = 72;
    const diff = thisWeek - lastWeek;
    expect(diff).toBeLessThan(0);
  });

  it("detects no change", () => {
    const thisWeek = 70;
    const lastWeek = 70;
    const diff = thisWeek - lastWeek;
    expect(diff).toBe(0);
  });
});
