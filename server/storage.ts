/**
 * Storage helpers — supports two backends:
 *  1. Manus built-in storage proxy (when BUILT_IN_FORGE_API_URL is set) — used on Manus hosting
 *  2. AWS S3 directly (when AWS_ACCESS_KEY_ID is set) — used on Railway
 */
import { ENV } from "./_core/env";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// --- AWS S3 backend ---

function getS3Client(): S3Client {
  // Cloudflare R2 uses a custom endpoint; fall back to standard AWS if no endpoint is set
  const endpoint = ENV.awsEndpointUrl;
  return new S3Client({
    region: ENV.awsRegion || "auto",
    endpoint: endpoint || undefined,
    credentials: {
      accessKeyId: ENV.awsAccessKeyId,
      secretAccessKey: ENV.awsSecretAccessKey,
    },
    // R2 requires path-style URLs
    forcePathStyle: Boolean(endpoint),
  });
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const s3 = getS3Client();
  const bucket = ENV.awsS3Bucket;
  const key = relKey.replace(/^\/+/, "");
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as Uint8Array);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  // Build public URL:
  // 1. If R2 public dev URL is configured, use it (no auth needed)
  // 2. If custom R2 endpoint, build path-style URL
  // 3. Fall back to standard AWS S3 URL
  const r2PublicUrl = ENV.r2PublicUrl;
  const endpoint = ENV.awsEndpointUrl;
  const url = r2PublicUrl
    ? `${r2PublicUrl.replace(/\/+$/, "")}/${key}`
    : endpoint
    ? `${endpoint.replace(/\/+$/, "")}/${bucket}/${key}`
    : `https://${bucket}.s3.${ENV.awsRegion || "us-east-1"}.amazonaws.com/${key}`;
  return { key, url };
}

async function s3Get(relKey: string, expiresIn = 3600): Promise<{ key: string; url: string }> {
  const s3 = getS3Client();
  const bucket = ENV.awsS3Bucket;
  const key = relKey.replace(/^\/+/, "");
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  return { key, url };
}

// --- Manus storage proxy backend ---

type StorageConfig = { baseUrl: string; apiKey: string };

function getManusStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, { method: "GET", headers: buildAuthHeaders(apiKey) });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as unknown as BlobPart], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function manusPut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getManusStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, { method: "POST", headers: buildAuthHeaders(apiKey), body: formData });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function manusGet(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getManusStorageConfig();
  const key = normalizeKey(relKey);
  return { key, url: await buildDownloadUrl(baseUrl, key, apiKey) };
}

// --- Public API — auto-selects backend ---

function isAwsConfigured(): boolean {
  return Boolean(ENV.awsAccessKeyId && ENV.awsSecretAccessKey && ENV.awsS3Bucket);
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  if (isAwsConfigured()) return s3Put(relKey, data, contentType);
  return manusPut(relKey, data, contentType);
}

export async function storageGet(relKey: string, expiresIn = 3600): Promise<{ key: string; url: string }> {
  if (isAwsConfigured()) return s3Get(relKey, expiresIn);
  return manusGet(relKey);
}
