import { describe, it, expect } from "vitest";

/**
 * Test that the VITE_CLERK_PUBLISHABLE_KEY env var is present and
 * that we can derive a valid JWKS URL from it.
 */
describe("Clerk publishable key", () => {
  it("VITE_CLERK_PUBLISHABLE_KEY is set", () => {
    const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
    expect(key).toMatch(/^pk_(test|live)_/);
  });

  it("derives a valid JWKS URL from the publishable key", () => {
    const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
    const base64Part = key.replace(/^pk_(test|live)_/, "").replace(/\$$/, "");
    const host = Buffer.from(base64Part, "base64").toString("utf-8").replace(/\$$/, "");
    expect(host).toContain(".");
    const jwksUrl = `https://${host}/.well-known/jwks.json`;
    expect(jwksUrl).toMatch(/^https:\/\/.+\/.well-known\/jwks\.json$/);
    console.log("Derived JWKS URL:", jwksUrl);
  });

  it("JWKS endpoint is reachable", async () => {
    const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
    const base64Part = key.replace(/^pk_(test|live)_/, "").replace(/\$$/, "");
    const host = Buffer.from(base64Part, "base64").toString("utf-8").replace(/\$$/, "");
    const jwksUrl = `https://${host}/.well-known/jwks.json`;
    const res = await fetch(jwksUrl);
    expect(res.ok).toBe(true);
    const data = await res.json() as { keys: unknown[] };
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.keys.length).toBeGreaterThan(0);
    console.log("JWKS keys count:", data.keys.length);
  }, 10000);
});
