/**
 * Clerk-based authentication for Railway deployment.
 * Replaces the Manus OAuth SDK session verification.
 *
 * Flow:
 *  1. Frontend (ClerkProvider) issues a short-lived JWT after sign-in.
 *  2. Frontend sends the JWT in the Authorization header: "Bearer <token>"
 *  3. This module verifies the JWT with Clerk's public key (JWKS endpoint).
 *  4. On success, upserts the user in our DB and returns the User row.
 */

import type { Request } from "express";
import * as db from "../db";

const CLERK_JWKS_URL = `https://api.clerk.dev/v1/jwks`;

// Cache JWKS to avoid fetching on every request
let cachedJwks: { keys: JsonWebKey[] } | null = null;
let jwksCachedAt = 0;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getJwks(): Promise<{ keys: JsonWebKey[] }> {
  const now = Date.now();
  if (cachedJwks && now - jwksCachedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks;
  }
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  const res = await fetch(CLERK_JWKS_URL, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Clerk JWKS: ${res.status}`);
  }
  cachedJwks = (await res.json()) as { keys: JsonWebKey[] };
  jwksCachedAt = now;
  return cachedJwks;
}

interface ClerkJwtPayload {
  sub: string;           // Clerk user ID (e.g. "user_2abc...")
  email?: string;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  // Clerk puts email in email_addresses claim or in the token directly
  [key: string]: unknown;
}

async function verifyClerkToken(token: string): Promise<ClerkJwtPayload> {
  // Use Clerk's verify endpoint for simplicity and reliability
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  const res = await fetch("https://api.clerk.dev/v1/tokens/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk token verification failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as ClerkJwtPayload;
  return data;
}

async function getClerkUserDetails(clerkUserId: string): Promise<{ email: string | null; name: string | null }> {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  try {
    const res = await fetch(`https://api.clerk.dev/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return { email: null, name: null };
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
