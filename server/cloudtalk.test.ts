import { describe, it, expect } from "vitest";

// Validate CloudTalk API credentials by calling the agents endpoint
describe("CloudTalk API credentials", () => {
  it("should authenticate and return agents list", async () => {
    const keyId = process.env.CLOUDTALK_API_KEY_ID;
    const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;

    expect(keyId, "CLOUDTALK_API_KEY_ID must be set").toBeTruthy();
    expect(keySecret, "CLOUDTALK_API_KEY_SECRET must be set").toBeTruthy();

    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(
      "https://my.cloudtalk.io/api/agents/index.json?limit=1",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
        },
      }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      responseData: { itemsCount: number; data: unknown[] };
    };
    expect(data.responseData).toBeDefined();
    expect(typeof data.responseData.itemsCount).toBe("number");
    expect(data.responseData.itemsCount).toBeGreaterThan(0);
  });
});
