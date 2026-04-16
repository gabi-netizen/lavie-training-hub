import { describe, it, expect } from "vitest";

describe("CloudTalk contact sync", () => {
  it("should have CLOUDTALK_API_KEY_ID and CLOUDTALK_API_KEY_SECRET set", () => {
    expect(process.env.CLOUDTALK_API_KEY_ID).toBeTruthy();
    expect(process.env.CLOUDTALK_API_KEY_SECRET).toBeTruthy();
  });

  it("should be able to reach CloudTalk contacts API", async () => {
    const keyId = process.env.CLOUDTALK_API_KEY_ID!;
    const keySecret = process.env.CLOUDTALK_API_KEY_SECRET!;
    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://my.cloudtalk.io/api/contacts/index.json?limit=1", {
      headers: { Authorization: auth },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data?.responseData?.itemsCount).toBeGreaterThanOrEqual(0);
  });

  it("syncContactToCloudTalk should not throw", async () => {
    const { syncContactToCloudTalk } = await import("./cloudtalk");
    // Use a clearly test-only name so it won't be confused with real contacts
    await expect(
      syncContactToCloudTalk({
        name: "TEST_VITEST_CONTACT_DO_NOT_USE",
        email: "vitest-test@example.com",
        phone: null,
      })
    ).resolves.not.toThrow();
  });
});
