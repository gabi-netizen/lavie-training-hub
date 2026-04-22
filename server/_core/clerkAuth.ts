/**
 * Clerk-based authentication for Railway deployment.
 * Uses JWKS-based JWT verification via the jose library.
 *
 * Flow:
 *  1. Frontend (ClerkProvider) issues a short-lived JWT after sign-in.
 *  2. Frontend sends the JWT in the Authorization header: "Bearer <token>"
 *  3. This module verifies the JWT using Clerk's JWKS endpoint.
 *  4. On success, upserts the user in our DB and returns the User row.
 */

import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as db from "../db";

// Clerk instance-specific JWKS URL.
// Derived from VITE_CLERK_PUBLISHABLE_KEY at runtime so it works for both
// Dev (caring-duck-98.clerk.accounts.dev) and Production instances.
function getClerkJwksUrl(): string {
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
  if (publishableKey) {
    try {
      // pk_test_<base64url(frontendApiHost)>$ or pk_live_<base64url(frontendApiHost)>$
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, "").replace(/\$$/, "");
      const frontendApiHost = Buffer.from(base64Part, "base64").toString("utf-8").replace(/\$$/, "");
      if (frontendApiHost && frontendApiHost.includes(".")) {
        console.log("[clerkAuth] Derived frontend API host:", frontendApiHost);
        return `https://${frontendApiHost}/.well-known/jwks.json`;
      }
    } catch {
      // fall through to default
    }
  }
  // Fallback: known Clerk dev instance
  return `https://caring-duck-98.clerk.accounts.dev/.well-known/jwks.json`;
}

// Lazy-init JWKS so the URL is computed at first request (env vars available)
let _JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_JWKS) {
    const url = getClerkJwksUrl();
    console.log("[clerkAuth] Using JWKS URL:", url);
    _JWKS = createRemoteJWKSet(new URL(url));
  }
  return _JWKS;
}

interface ClerkJwtPayload {
  sub: string;           // Clerk user ID (e.g. "user_2abc...")
  [key: string]: unknown;
}

async function verifyClerkToken(token: string): Promise<ClerkJwtPayload> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      algorithms: ["RS256"],
    });
    if (!payload.sub) {
      throw new Error("JWT missing sub claim");
    }
    return payload as ClerkJwtPayload;
  } catch (err) {
    throw new Error(`Clerk JWT verification failed: ${err}`);
  }
}

async function getClerkUserDetails(clerkUserId: string): Promise<{ email: string | null; name: string | null }> {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) {
      console.warn("[clerkAuth] Failed to fetch user details:", res.status);
      return { email: null, name: null };
    }
    const data = (await res.json()) as {
      email_addresses?: Array<{ email_address: string; id: string }>;
      primary_email_address_id?: string;
      first_name?: string;
      last_name?: string;
    };
    const primaryEmail = data.email_addresses?.find(
      e => e.id === data.primary_email_address_id
    )?.email_address ?? data.email_addresses?.[0]?.email_address ?? null;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    return { email: primaryEmail, name };
  } catch {
    return { email: null, name: null };
  }
}

export async function authenticateClerkRequest(req: Request): Promise<import("../../drizzle/schema").User> {
  // Extract token from Authorization header or __session cookie (Clerk default)
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // Also check __session cookie (Clerk's default cookie name)
  if (!token) {
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map(c => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );
    token = cookies["__session"] ?? cookies["__clerk_db_jwt"];
  }

  if (!token) {
    throw new Error("No Clerk session token found");
  }

  const payload = await verifyClerkToken(token);
  const clerkUserId = payload.sub;

  if (!clerkUserId) {
    throw new Error("Invalid Clerk token: missing sub");
  }

  // Check if user exists in DB
  let user = await db.getUserByOpenId(clerkUserId);

  if (!user) {
    // Fetch full user details from Clerk API
    const { email, name } = await getClerkUserDetails(clerkUserId);

    await db.upsertUser({
      openId: clerkUserId,
      name: name,
      email: email,
      loginMethod: "clerk",
      lastSignedIn: new Date(),
    });
    user = await db.getUserByOpenId(clerkUserId);
  } else {
    // Update lastSignedIn
    await db.upsertUser({
      openId: clerkUserId,
      lastSignedIn: new Date(),
    });
    user = await db.getUserByOpenId(clerkUserId);
  }

  if (!user) {
    throw new Error("Failed to get or create user");
  }

  return user;
}
