import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import multer from "multer";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { handleCloudTalkWebhook } from "../webhooks/cloudtalk";

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

// Multer: store in memory, max 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── CloudTalk Webhook ─────────────────────────────────────────────────────
  // CloudTalk sends POST requests here when a call ends.
  // Must be registered BEFORE tRPC middleware.
  app.post("/api/webhooks/cloudtalk", handleCloudTalkWebhook);

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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
