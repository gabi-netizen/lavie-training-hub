export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Manus built-in APIs (used on Manus hosting, empty on Railway)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Email
  postmarkApiKey: process.env.POSTMARK_API_KEY ?? "",
  // ActiveCampaign CRM
  activeCampaignApiUrl: process.env.ACTIVECAMPAIGN_API_URL ?? "",
  activeCampaignApiKey: process.env.ACTIVECAMPAIGN_API_KEY ?? "",
  // Clerk auth (Railway deployment)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  // OpenAI (direct API key for Railway)
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  // Deepgram transcription
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  // CloudTalk telephony
  cloudTalkApiKeyId: process.env.CLOUDTALK_API_KEY_ID ?? "",
  cloudTalkApiKeySecret: process.env.CLOUDTALK_API_KEY_SECRET ?? "",
  // AWS S3 / Cloudflare R2 (for Railway file storage)
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  awsRegion: process.env.AWS_REGION ?? "auto",
  awsS3Bucket: process.env.AWS_S3_BUCKET ?? "",
  // Cloudflare R2 custom endpoint (e.g. https://xxxx.r2.cloudflarestorage.com)
  awsEndpointUrl: process.env.AWS_ENDPOINT_URL ?? "",
  // Cloudflare R2 public dev URL (e.g. https://pub-xxx.r2.dev) — makes files publicly accessible without presigning
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",
  // Stripe payment processing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Stripe publishable key (exposed to frontend via VITE_ prefix)
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
};
