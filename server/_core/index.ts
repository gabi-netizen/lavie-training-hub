import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import multer from "multer";
import { registerClerkRoutes } from "./clerkRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { handleCloudTalkWebhook } from "../webhooks/cloudtalk";
import { handleStripeBillingWebhook } from "../webhooks/stripeWebhook";
import { handleGmailWebhook } from "../webhooks/gmail";
import { handlePostmarkInbound } from "../webhooks/postmarkInbound";
import { handleWhatsAppIncoming } from "../webhooks/whatsappIncoming";
import { handleWhatsAppStatus } from "../webhooks/whatsappStatus";
import { handleSMSIncoming } from "../webhooks/smsIncoming";
import { ensureSupportTicketsTable } from "../ensureTables";
import { ensureShareTokenColumn } from "../ensureShareToken";
import { ensureTemplateVisibilityColumn } from "../ensureTemplateVisibility";
import { ensureBrandsColumn } from "../ensureBrandsColumn";
import { ensureEmailTrackingTables } from "../ensureEmailTables";
import { ensureStripeTables } from "../ensureStripeTables";
import { ensureClientSubscriptionsTable } from "../ensureClientSubscriptions";
import { seedClientSubscriptionsFromFile } from "../importClientSubscriptions";
import { syncUnsyncedContactsToCloudTalk } from "../contacts";
import { createPaymentIntent, handleStripeWebhook } from "../stripe";
import { getPaymentPageHtml } from "../payment-html";
import { handleEmailTrackPixel, handleEmailLinkClick } from "../emailTracking";
import { startNightlyCron } from "../cron/nightlyCoolingPool";
import { startTicketAutoUnassignCron } from "../cron/ticketAutoUnassign";
import { startCallbackReminderCron } from "../cron/callbackReminder";
import { startClientSubscriptionsSync } from "../syncClientSubscriptions";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Multer: store in memory, max 200MB (for long call recordings)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/mp4", "video/mp4", "audio/webm", "audio/x-m4a"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|m4a|mp4|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Please upload an audio file."));
    }
  },
});

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Stripe Webhook (legacy — payment form) ────────────────────────────────
  // MUST be registered BEFORE express.json() because Stripe requires the raw body
  // to verify the webhook signature.
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );

  // ─── Stripe Billing Webhook (new — subscriptions, invoices, disputes) ──────
  // Separate endpoint for the full billing infrastructure webhook.
  // Also requires raw body for signature verification.
  app.post(
    "/api/webhooks/stripe-billing",
    express.raw({ type: "application/json" }),
    handleStripeBillingWebhook
  );

  // Configure body parser with larger size limit for file uploads (250MB for long call recordings)
  app.use(express.json({ limit: "250mb" }));
  app.use(express.urlencoded({ limit: "250mb", extended: true }));

  // Clerk auth routes (replaces Manus OAuth)
  registerClerkRoutes(app);

  // ─── CloudTalk Webhook ─────────────────────────────────────────────────────
  // CloudTalk sends POST requests here when a call ends.
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/webhooks/cloudtalk", handleCloudTalkWebhook);

  // ─── Gmail Webhook ────────────────────────────────────────────────────────
  // Google Apps Script sends POST requests here when a new email arrives
  // in the support@lavielabs.com inbox.
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/webhooks/gmail", handleGmailWebhook);

  // ─── Postmark Inbound Webhook ─────────────────────────────────────────────
  // Postmark pushes inbound emails here when trial@lavielabs.com receives mail
  app.post("/api/webhooks/postmark-inbound", handlePostmarkInbound);

  // ─── WhatsApp Incoming Webhook ─────────────────────────────────────────────
  // Twilio sends application/x-www-form-urlencoded POST requests here.
  // Registered AFTER express.urlencoded() (line above) so req.body is correctly
  // parsed as form fields (Body, From, To, MessageSid, etc.).
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/whatsapp/incoming", handleWhatsAppIncoming);

  // ─── SMS Incoming Webhook ───────────────────────────────────────────────────
  // Twilio sends application/x-www-form-urlencoded POST requests here.
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/webhooks/sms-incoming", handleSMSIncoming);

  // ─── WhatsApp Status Callback Webhook ─────────────────────────────────────────
  // Twilio sends delivery/read status updates here (sent → delivered → read).
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/whatsapp/status", handleWhatsAppStatus);

  // ─── Email Tracking Endpoints (public, no auth) ────────────────────────────
  // Tracking pixel — records email opens
  app.get("/api/email-track/:emailLogId.png", handleEmailTrackPixel);
  // Link click tracking — records clicks and redirects to original URL
  app.get("/api/email-link/:emailLogId/:linkIndex", handleEmailLinkClick);

  // ─── Stripe PaymentIntent creation ────────────────────────────────────────
  // Public endpoint — called by the payment page to initiate a Stripe payment.
  app.post("/api/stripe/create-payment-intent", createPaymentIntent);

  // ─── File upload endpoint ─────────────────────────────────────────────────
  app.post(
    "/api/call-upload",
    upload.single("audio"),
    async (req: express.Request, res: express.Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "No audio file provided" });
          return;
        }

        const suffix = Date.now().toString(36);
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `call-recordings/${suffix}-${safeName}`;

        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

        res.json({ fileKey, url, fileName: req.file.originalname });
      } catch (err) {
        console.error("[upload] error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
  );

  // ─── Ticket attachment upload endpoint ─────────────────────────────────────
  const ticketAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
  });
  app.post(
    "/api/ticket-attachment-upload",
    ticketAttachmentUpload.array("files", 5), // max 5 files
    async (req: express.Request, res: express.Response) => {
      try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          res.status(400).json({ error: "No files provided" });
          return;
        }
        const uploaded = files.map((f) => ({
          filename: f.originalname,
          contentType: f.mimetype,
          size: f.size,
          buffer: f.buffer.toString("base64"),
        }));
        res.json({ files: uploaded });
      } catch (err) {
        console.error("[ticket-attachment-upload] error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
  );

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Temporary debug endpoint — remove after key issue is resolved ──────────
  app.get("/api/debug-key", (_req, res) => {
    const sk = process.env.STRIPE_SECRET_KEY ?? "";
    const pk = process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
    res.json({
      sk_prefix: sk.substring(0, 8),
      sk_length: sk.length,
      pk_prefix: pk.substring(0, 8),
      pk_length: pk.length,
    });
  });

  app.get("/api/debug-twilio", async (_req, res) => {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    const from = process.env.TWILIO_WHATSAPP_FROM ?? "";

    // Also try calling Twilio Content API directly
    let apiResult = "not tested";
    try {
      const credentials = Buffer.from(`${sid}:${authToken}`).toString("base64");
      const r = await fetch("https://content.twilio.com/v1/Content", {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      });
      if (r.ok) {
        const data = await r.json();
        apiResult = `OK - ${(data.contents || []).length} templates`;
      } else {
        const errText = await r.text().catch(() => "");
        apiResult = `ERROR ${r.status}: ${errText.substring(0, 200)}`;
      }
    } catch (e: any) {
      apiResult = `EXCEPTION: ${e.message}`;
    }

    res.json({
      TWILIO_ACCOUNT_SID: sid ? sid.substring(0, 6) + "..." : "NOT SET",
      TWILIO_AUTH_TOKEN: authToken ? "set (" + authToken.length + " chars)" : "NOT SET",
      TWILIO_WHATSAPP_FROM: from || "NOT SET (will use default)",
      apiResult,
    });
  });

  // ─── Standalone Payment Page ───────────────────────────────────────────────
  // Pure HTML/JS page — no React, no tRPC, no Clerk auth.
  // HTML is inlined as a TS string (via payment-html.ts) so esbuild bundles it
  // into dist/index.js — no file-copy step needed on Railway.
  // MUST be registered BEFORE serveStatic/setupVite so the React catch-all
  // never intercepts this path.
  // Usage: /payment-link-lavielabs?agent=AgentName
  app.get("/payment-link-lavielabs", (_req, res) => {
    const html = getPaymentPageHtml(process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Set server-level timeout to 35 minutes for long AI analysis requests
  server.timeout = 2_100_000; // 35 minutes in ms
  server.keepAliveTimeout = 2_100_000;
  server.headersTimeout = 2_100_100;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Ensure support_tickets table exists
    setTimeout(() => {
      ensureSupportTicketsTable().catch((err) =>
        console.error("[DB] Error ensuring support_tickets table:", err)
      );
    }, 3000);
    // Ensure shareToken column exists on call_analyses
    setTimeout(() => {
      ensureShareTokenColumn().catch((err) =>
        console.error("[DB] Error ensuring shareToken column:", err)
      );
    }, 4000);
    // Ensure visibility column exists on email_templates
    setTimeout(() => {
      ensureTemplateVisibilityColumn().catch((err) =>
        console.error("[DB] Error ensuring template visibility column:", err)
      );
    }, 5000);
    // Ensure brands column exists on contacts
    setTimeout(() => {
      ensureBrandsColumn().catch((err) =>
        console.error("[DB] Error ensuring brands column:", err)
      );
    }, 6000);
    // Background: sync any contacts that missed CloudTalk sync during hibernation
    setTimeout(() => {
      syncUnsyncedContactsToCloudTalk().catch((err) =>
        console.error("[CloudTalk] Startup sync error:", err)
      );
    }, 5000); // 5s delay to let the server fully warm up first
    // Ensure email tracking tables/columns exist
    setTimeout(() => {
      ensureEmailTrackingTables().catch((err) =>
        console.error("[DB] Error ensuring email tracking tables:", err)
      );
    }, 7000);
    // Ensure Stripe billing tables exist
    setTimeout(() => {
      ensureStripeTables().catch((err) =>
        console.error("[DB] Error ensuring Stripe tables:", err)
      );
    }, 8000);
    // Ensure client_subscriptions table exists, then start background Zoho sync
    setTimeout(() => {
      ensureClientSubscriptionsTable()
        .then(() => {
          // Start background sync: initial sync + every 30 minutes
          startClientSubscriptionsSync();
        })
        .catch((err) =>
          console.error("[DB] Error ensuring client_subscriptions / starting sync:", err)
        );
    }, 9000);
    // Start nightly Cooling Pool cron (23:00 UTC — moves N/A leads to unassigned)
    setTimeout(() => {
      startNightlyCron();
      startTicketAutoUnassignCron();
      startCallbackReminderCron();
    }, 8000);
  });
}

startServer().catch(console.error);
