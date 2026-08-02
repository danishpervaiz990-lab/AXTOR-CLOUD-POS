import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type StorageLocation = { bucket: string; prefix: string };

function cleanSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function buildBackupStorageKey(businessId: string, jobId: string, requestedAt: Date): string {
  const date = requestedAt.toISOString().slice(0, 10);
  return `${cleanSegment(businessId)}/${date}/${cleanSegment(jobId)}.axtor-backup`;
}

function configuredStorageUrl(): string {
  const value = String(process.env.BACKUP_STORAGE_URL || "").trim();
  if (!value) throw new Error("Backup storage URL is not configured");
  return value;
}

function resolveVolumePath(storageKey: string): string {
  const root = path.resolve(configuredStorageUrl());
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid backup storage key");
  return target;
}

function s3Location(): StorageLocation {
  const url = new URL(configuredStorageUrl());
  if (url.protocol !== "s3:") throw new Error("S3 backup storage URL must use s3://bucket/prefix");
  return { bucket: url.hostname, prefix: url.pathname.replace(/^\/+|\/+$/g, "") };
}

function s3Key(storageKey: string): string {
  const location = s3Location();
  return [location.prefix, storageKey].filter(Boolean).join("/");
}

function s3Client(): S3Client {
  const endpoint = String(process.env.BACKUP_S3_ENDPOINT || "").trim() || undefined;
  return new S3Client({
    region: String(process.env.BACKUP_S3_REGION || "auto").trim(),
    endpoint,
    forcePathStyle: String(process.env.BACKUP_S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false",
    credentials: {
      accessKeyId: String(process.env.BACKUP_S3_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: String(process.env.BACKUP_S3_SECRET_ACCESS_KEY || "").trim(),
    },
  });
}

function provider(): string {
  return String(process.env.BACKUP_PROVIDER || "").trim();
}

export async function uploadBackup(localPath: string, storageKey: string): Promise<number> {
  const file = await stat(localPath);
  if (provider() === "railway-volume") {
    const destination = resolveVolumePath(storageKey);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(localPath, destination);
    return file.size;
  }
  const location = s3Location();
  await s3Client().send(new PutObjectCommand({
    Bucket: location.bucket,
    Key: s3Key(storageKey),
    Body: createReadStream(localPath),
    ContentLength: file.size,
    ContentType: "application/octet-stream",
    Metadata: { encrypted: "aes-256-gcm", format: "axtor-backup-v1" },
  }));
  return file.size;
}

export async function downloadBackup(storageKey: string, localPath: string): Promise<void> {
  if (provider() === "railway-volume") {
    await copyFile(resolveVolumePath(storageKey), localPath);
    return;
  }
  const location = s3Location();
  const result = await s3Client().send(new GetObjectCommand({ Bucket: location.bucket, Key: s3Key(storageKey) }));
  if (!result.Body) throw new Error("Backup object has no content");
  const body = result.Body as unknown as Readable;
  await pipeline(body, createWriteStream(localPath, { flags: "wx", mode: 0o600 }));
}

export async function deleteBackup(storageKey: string): Promise<void> {
  if (provider() === "railway-volume") {
    await rm(resolveVolumePath(storageKey), { force: true });
    return;
  }
  const location = s3Location();
  await s3Client().send(new DeleteObjectCommand({ Bucket: location.bucket, Key: s3Key(storageKey) }));
}
