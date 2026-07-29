import { ApiError, cleanString } from "../utils/http.js";

const SUPPORTED_PROVIDERS = new Set(["railway-volume", "s3-compatible", "object-storage"]);

export type BackupProviderStatus = {
  configured: boolean;
  provider: string | null;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
};

export function getBackupProviderStatus(): BackupProviderStatus {
  const storageUrl = cleanString(process.env.BACKUP_STORAGE_URL);
  const encryptionKey = cleanString(process.env.BACKUP_ENCRYPTION_KEY);
  const providerValue = cleanString(process.env.BACKUP_PROVIDER) || "object-storage";
  const provider = SUPPORTED_PROVIDERS.has(providerValue) ? providerValue : null;
  const storageConfigured = Boolean(storageUrl);
  const encryptionConfigured = Boolean(encryptionKey && encryptionKey.length >= 32);

  return {
    configured: Boolean(provider && storageConfigured && encryptionConfigured),
    provider,
    storageConfigured,
    encryptionConfigured,
  };
}

export function requireBackupProvider(requestedProvider?: unknown): BackupProviderStatus & { provider: string } {
  const status = getBackupProviderStatus();
  if (!status.configured || !status.provider) {
    throw new ApiError(503, "Backup storage is not configured", {
      providerConfigured: Boolean(status.provider),
      storageConfigured: status.storageConfigured,
      encryptionConfigured: status.encryptionConfigured,
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
