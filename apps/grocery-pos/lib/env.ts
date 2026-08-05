import { z } from "zod";

const environmentSchema = z.object({
  GROCERY_DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "GROCERY_DATABASE_URL must be a PostgreSQL URL"
  ),
  GROCERY_SESSION_SECRET: z.string().min(32),
  GROCERY_APP_URL: z.string().url(),
  GROCERY_ENVIRONMENT: z.enum(["development", "test", "preview", "production"]).default("development"),
  GROCERY_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GROCERY_CRON_SECRET: z.string().min(24),
  GROCERY_FILE_STORAGE_PROVIDER: z.enum(["vercel-blob", "s3-compatible"]).default("vercel-blob"),
  GROCERY_EMAIL_FROM_NAME: z.string().min(1).default("AXTOR Grocery POS Cloud"),
  GROCERY_EMAIL_FROM_ADDRESS: z.string().email(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  VERCEL_DEPLOYMENT_ID: z.string().optional()
});

export type ServerEnvironment = z.infer<typeof environmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    const invalidKeys = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
    throw new Error(`Invalid Grocery server configuration: ${invalidKeys.join(", ")}`);
  }

  cachedEnvironment = result.data;
  return cachedEnvironment;
}

export function resetServerEnvironmentForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Environment cache may only be reset in tests");
  }
  cachedEnvironment = undefined;
}
