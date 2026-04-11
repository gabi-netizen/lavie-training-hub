import { describe, it, expect } from "vitest";
import "dotenv/config";

describe("ActiveCampaign API credentials", () => {
  it("should authenticate and return account info", async () => {
    const apiUrl = process.env.ACTIVECAMPAIGN_API_URL;
    const apiKey = process.env.ACTIVECAMPAIGN_API_KEY;

    expect(apiUrl).toBeDefined();
    expect(apiKey).toBeDefined();

    const response = await fetch(`${apiUrl}/api/3/users/me`, {
      headers: {
        "Accept": "application/json",
        "Api-Token": apiKey!,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json() as { user: { email: string; username: string } };
    expect(data.user).toBeDefined();
    console.log("ActiveCampaign user:", data.user.email);
  });
});
