/**
 * Clerk auth routes for Railway deployment.
 * Replaces the Manus OAuth callback routes.
 *
 * The frontend (ClerkProvider) handles all sign-in/sign-up UI.
 * The backend just needs to:
 *  1. Provide a /api/auth/me endpoint (handled via tRPC auth.me)
 *  2. Provide a /api/auth/logout endpoint (clears any server-side state)
 *  3. Optionally handle Clerk webhooks for user sync
 */

import type { Express, Request, Response } from "express";

export function registerClerkRoutes(app: Express) {
  // Health check / auth status (used by frontend to check if backend is up)
  app.get("/api/auth/status", (_req: Request, res: Response) => {
    res.json({ ok: true, auth: "clerk" });
  });

  // Logout endpoint - Clerk handles session invalidation on the frontend
  // This just returns success; the frontend calls Clerk's signOut()
  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
}
