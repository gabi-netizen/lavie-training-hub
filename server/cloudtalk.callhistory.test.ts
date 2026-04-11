/**
 * CloudTalk Call History Integration Tests
 * Tests that the getCallHistory and fetchRecording functions work with real credentials
 * Note: CloudTalk API can be slow (>10s), so timeouts are set to 30s
 */
import { describe, it, expect } from "vitest";
import { getCallHistory, fetchRecording } from "./cloudtalk";

describe("CloudTalk Call History", () => {
  it("should fetch call history without filters and return valid structure", async () => {
    const result = await getCallHistory({ limit: 5, page: 1 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("calls");
    expect(result).toHaveProperty("totalCount");
    expect(result).toHaveProperty("pageCount");
    expect(Array.isArray(result.calls)).toBe(true);
    expect(typeof result.totalCount).toBe("number");
    expect(typeof result.pageCount).toBe("number");
    console.log(`CloudTalk call history: ${result.totalCount} total calls, ${result.calls.length} returned`);
  }, 60000);

  it("should return call objects with required fields", async () => {
    const result = await getCallHistory({ limit: 3, page: 1 });
    if (result.calls.length > 0) {
      const call = result.calls[0];
      expect(call).toHaveProperty("cdr_id");
      expect(call).toHaveProperty("date");
      expect(call).toHaveProperty("direction");
      expect(call).toHaveProperty("status");
      expect(call).toHaveProperty("recorded");
      expect(["incoming", "outgoing", "internal"]).toContain(call.direction);
      expect(["answered", "missed"]).toContain(call.status);
      console.log(`Sample call: cdr_id=${call.cdr_id}, direction=${call.direction}, status=${call.status}, recorded=${call.recorded}`);
    } else {
      console.log("No calls returned — account may have no call history yet");
    }
  }, 60000);

  it("should accept status filter parameter without error", async () => {
    // CloudTalk API may not perfectly filter by status server-side, but the call should succeed
    const result = await getCallHistory({ limit: 5, page: 1, status: "answered" });
    expect(result).toBeDefined();
    expect(Array.isArray(result.calls)).toBe(true);
    console.log(`Calls returned with status=answered filter: ${result.calls.length}`);
  }, 30000);

  it("fetchRecording should return null for non-existent call ID", async () => {
    const result = await fetchRecording(999999999);
    expect(result).toBeNull();
  }, 30000);
});
