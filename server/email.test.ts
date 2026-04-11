import { describe, it, expect } from "vitest";
import "dotenv/config";

describe("Postmark API Key", () => {
  it("should be able to reach Postmark API with the provided key", async () => {
    const apiKey = process.env.POSTMARK_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");

    // Verify the API key by calling Postmark's server info endpoint
    const response = await fetch("https://api.postmarkapp.com/server", {
      headers: {
        "Accept": "application/json",
        "X-Postmark-Server-Token": apiKey!,
      },
    });

    // 200 = valid key, 401 = invalid key
    expect(response.status).toBe(200);
    const data = await response.json() as { Name: string };
    expect(data.Name).toBeDefined();
    console.log("Postmark server name:", data.Name);
  });
});
