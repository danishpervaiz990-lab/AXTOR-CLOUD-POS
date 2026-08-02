import { ApiError, cleanString } from "../utils/http.js";

const SUPPORTED_PROVIDERS = new Set(["railway-volume", "s3-compatible", "object-storage"]);

export type BackupProviderStatus = {
  configured: boolean;
  provider: string | null;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
  credentialsConfigured: boolean;
  workerEnabled: boolean;
  restoreConfigured: boolean;
};

export function getBackupProviderStatus(): BackupProviderStatus {
  const storageUrl = cleanString(process.env.BACKUP_STORAGE_URL);
  const encryptionKey = cleanString(process.env.BACKUP_ENCRYPTION_KEY);
  const providerValue = cleanString(process.env.BACKUP_PROVIDER) || "object-storage";
  const provider = SUPPORTED_PROVIDERS.has(providerValue) ? providerValue : null;
  const storageConfigured = Boolean(storageUrl);
  const encryptionConfigured = Boolean(encryptionKey && encryptionKey.length >= 32);
  const workerEnabled = cleanString(process.env.BACKUP_WORKER_ENABLED)?.toLowerCase() === "true";
  const credentialsConfigured = provider === "railway-volume" || Boolean(
    cleanString(process.env.BACKUP_S3_ACCESS_KEY_ID) && cleanString(process.env.BACKUP_S3_SECRET_ACCESS_KEY),
  );
  const restoreUrl = cleanString(process.env.BACKUP_RESTORE_DATABASE_URL);
  const restoreConfigured = Boolean(
    restoreUrl &&
    restoreUrl !== cleanString(process.env.DATABASE_URL) &&
    cleanString(process.env.BACKUP_RESTORE_CONFIRM) === "I_UNDERSTAND_THIS_DATABASE_WILL_BE_REPLACED",
  );

  return {
    configured: Boolean(provider && storageConfigured && encryptionConfigured && credentialsConfigured && workerEnabled),
    provider,
    storageConfigured,
    encryptionConfigured,
    credentialsConfigured,
    workerEnabled,
    restoreConfigured,
  };
}

export function requireBackupProvider(requestedProvider?: unknown): BackupProviderStatus & { provider: string } {
  const status = getBackupProviderStatus();
  if (!status.configured || !status.provider) {
    throw new ApiError(503, "Backup storage is not configured", {
      providerConfigured: Boolean(status.provider),
      storageConfigured: status.storageConfigured,
      encryptionConfigured: status.encryptionConfigured,
      credentialsConfigured: status.credentialsConfigured,
      workerEnabled: status.workerEnabled,
    });
  }

  const requested = cleanString(requestedProvider);
  if (requested && requested !== status.provider) {
    throw new ApiError(400, "Requested backup provider is not configured", {
      configuredProvider: status.provider,
    });
  }

  return { ...status, provider: status.provider };
}
