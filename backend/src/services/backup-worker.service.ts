import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { decryptBackup, encryptBackup, sha256File } from "./backup-crypto.service.js";
import { getBackupProviderStatus } from "./backup-provider.service.js";
import { buildBackupStorageKey, deleteBackup, downloadBackup, uploadBackup } from "./backup-storage.service.js";

const RESTORE_CONFIRMATION = "I_UNDERSTAND_THIS_DATABASE_WILL_BE_REPLACED";
let timer: NodeJS.Timeout | null = null;
let working = false;

function positiveInt(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function redactedError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error || "Backup failed");
  const withoutUrls = raw.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]");
  return { code: "BACKUP_JOB_FAILED", message: withoutUrls.slice(0, 500) };
}

async function command(commandName: string, args: string[], databaseUrl?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      shell: false,
      env: { ...process.env, ...(databaseUrl ? { PGDATABASE: databaseUrl } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), positiveInt("BACKUP_COMMAND_TIMEOUT_SECONDS", 1800, 7200) * 1000);
    child.stdout.on("data", (chunk) => { stdout += String(chunk).slice(0, 100_000); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 100_000); });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${commandName} exited with code ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

function databaseIdentity(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

async function databaseEvidence(databaseUrl: string): Promise<Record<string, number>> {
  const sql = `SELECT json_build_object('businesses',(SELECT count(*) FROM businesses),'users',(SELECT count(*) FROM users),'salesDocuments',(SELECT count(*) FROM sales_documents));`;
  const output = await command("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], databaseUrl);
  const parsed = JSON.parse(output);
  return {
    businesses: Number(parsed.businesses || 0),
    users: Number(parsed.users || 0),
    salesDocuments: Number(parsed.salesDocuments || 0),
  };
}

async function verifyRestore(encryptedPath: string, tempDir: string): Promise<Prisma.InputJsonValue | null> {
  const target = String(process.env.BACKUP_RESTORE_DATABASE_URL || "").trim();
  if (!target) return null;
  if (String(process.env.BACKUP_RESTORE_CONFIRM || "") !== RESTORE_CONFIRMATION) throw new Error("Restore confirmation is missing");
  const source = String(process.env.DATABASE_URL || "").trim();
  if (!source || databaseIdentity(source) === databaseIdentity(target)) throw new Error("Restore target must be an isolated database");

  const restoredDump = path.join(tempDir, "restore.dump");
  await decryptBackup(encryptedPath, restoredDump);
  const sourceCounts = await databaseEvidence(source);
  await command("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", restoredDump], target);
  const restoredCounts = await databaseEvidence(target);
  if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) throw new Error("Restored database counts do not reconcile");
  return { sourceCounts, restoredCounts, verified: true } as Prisma.InputJsonValue;
}

async function claimJob() {
  const candidate = await prisma.backupJob.findFirst({
    where: {
      status: { in: ["pending", "retry"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { requestedAt: "asc" },
  });
  if (!candidate) return null;
  const claimed = await prisma.backupJob.updateMany({
    where: { id: candidate.id, status: { in: ["pending", "retry"] } },
    data: { status: "running", startedAt: new Date(), attempts: { increment: 1 }, errorCode: null, errorMessage: null },
  });
  return claimed.count === 1 ? prisma.backupJob.findUnique({ where: { id: candidate.id } }) : null;
}

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "axtor-backup-"));
  const dumpPath = path.join(tempDir, "database.dump");
  const encryptedPath = path.join(tempDir, "database.axtor-backup");
  try {
    await command("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dumpPath], process.env.DATABASE_URL);
    await encryptBackup(dumpPath, encryptedPath);
    const storageKey = buildBackupStorageKey(job.businessId, job.id, job.requestedAt);
    const checksum = await sha256File(encryptedPath);
    const archiveSizeBytes = (await stat(encryptedPath)).size;
    await uploadBackup(encryptedPath, storageKey);

    let restoreEvidence: Prisma.InputJsonValue | null = null;
    let restoreVerifiedAt: Date | null = null;
    if (getBackupProviderStatus().restoreConfigured) {
      const verifyPath = path.join(tempDir, "verify.axtor-backup");
      await downloadBackup(storageKey, verifyPath);
      if (await sha256File(verifyPath) !== checksum) throw new Error("Stored backup checksum verification failed");
      restoreEvidence = await verifyRestore(verifyPath, tempDir);
      restoreVerifiedAt = new Date();
    }

    const retentionDays = positiveInt("BACKUP_RETENTION_DAYS", 30, 3650);
    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: restoreVerifiedAt ? "verified" : "completed",
        completedAt: new Date(),
        restoreVerifiedAt,
        restoreEvidence: restoreEvidence ?? Prisma.DbNull,
        storageKey,
        checksum,
        archiveSizeBytes,
        retentionUntil: new Date(Date.now() + retentionDays * 86_400_000),
      },
    });
  } catch (error) {
    const safe = redactedError(error);
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "failed" : "retry",
        failedAt: exhausted ? new Date() : null,
        nextAttemptAt: exhausted ? null : new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000),
        errorCode: safe.code,
        errorMessage: safe.message,
      },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function enforceRetention(): Promise<void> {
  const expired = await prisma.backupJob.findMany({
    where: { retentionUntil: { lte: new Date() }, status: { in: ["completed", "verified"] }, storageKey: { not: null } },
    take: 20,
  });
  for (const job of expired) {
    try {
      await deleteBackup(job.storageKey!);
      await prisma.backupJob.update({ where: { id: job.id }, data: { status: "expired", storageKey: null } });
    } catch (error) {
      console.error("Backup retention cleanup failed", { jobId: job.id, error: redactedError(error).message });
    }
  }
}

export async function runBackupWorkerOnce(): Promise<void> {
  if (working || !getBackupProviderStatus().configured) return;
  working = true;
  try {
    await enforceRetention();
    const job = await claimJob();
    if (job) await processJob(job);
  } finally {
    working = false;
  }
}

export function startBackupWorker(): () => void {
  if (!getBackupProviderStatus().configured) {
    console.log("Backup worker disabled: provider configuration incomplete");
    return () => {};
  }
  const intervalMs = positiveInt("BACKUP_WORKER_INTERVAL_SECONDS", 30, 3600) * 1000;
  void runBackupWorkerOnce();
  timer = setInterval(() => void runBackupWorkerOnce(), intervalMs);
  timer.unref();
  console.log("Backup worker started", { provider: getBackupProviderStatus().provider, intervalSeconds: intervalMs / 1000 });
  return () => { if (timer) clearInterval(timer); timer = null; };
}
