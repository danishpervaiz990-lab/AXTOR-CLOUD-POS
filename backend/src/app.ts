import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";
import { loginRateLimit, requestId } from "./middleware/security.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import customersRoutes from "./routes/customers.routes.js";
import productsRoutes from "./routes/products.routes.js";
import salesDocumentsRoutes from "./routes/sales-documents.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import salesReturnsRoutes from "./routes/sales-returns.routes.js";
import refundsRoutes from "./routes/refunds.routes.js";
import accessControlRoutes from "./routes/access-control.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import salesmenRoutes from "./routes/salesmen.routes.js";
import suppliersRoutes from "./routes/suppliers.routes.js";
import purchasesRoutes from "./routes/purchases.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import branchesRoutes from "./routes/branches.routes.js";
import accountsRoutes from "./routes/accounts.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import shiftsRoutes from "./routes/shifts.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import promotionsRoutes from "./routes/promotions.routes.js";
import loyaltyRoutes from "./routes/loyalty.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import approvalsRoutes from "./routes/approvals.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import communicationsRoutes from "./routes/communications.routes.js";
import commercialRoutes from "./routes/commercial.routes.js";
import platformAdminRoutes from "./routes/platform-admin.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  const corsOptions = {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || env.corsOrigins === "*" || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Idempotency-Key", "X-Idempotency-Key"],
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/v1/auth/login", loginRateLimit);

  const routeMap = {
    health: "/health",
    dbHealth: "/api/v1/health/db",
    auth: "/api/v1/auth",
    accessControl: "/api/v1/access-control",
    dashboard: "/api/v1/dashboard",
    customers: "/api/v1/customers",
    products: "/api/v1/products",
    salesDocuments: "/api/v1/sales-documents",
    payments: "/api/v1/payments",
    salesReturns: "/api/v1/sales-returns",
    refunds: "/api/v1/refunds",
    salesmen: "/api/v1/salesmen",
    suppliers: "/api/v1/suppliers",
    purchases: "/api/v1/purchases",
    inventory: "/api/v1/inventory",
    branches: "/api/v1/branches",
    accounts: "/api/v1/accounts",
    expenses: "/api/v1/expenses",
    shifts: "/api/v1/shifts",
    reports: "/api/v1/reports",
    promotions: "/api/v1/promotions",
    loyalty: "/api/v1/loyalty",
    notifications: "/api/v1/notifications",
    approvals: "/api/v1/approvals",
    settings: "/api/v1/settings",
    communications: "/api/v1/communications",
    commercial: "/api/v1/commercial",
    platformAdmin: "/api/v1/platform-admin",
  };

  app.get("/", (_req: Request, res: Response) => res.json({
    ok: true,
    service: "Axtor POS Cloud API",
    message: "Backend is running",
    version: env.appVersion,
    routes: routeMap,
  }));
  app.get("/health", (_req: Request, res: Response) => res.json({
    ok: true,
    service: "Axtor POS Cloud API",
    version: env.appVersion,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  }));
  app.get("/api/v1/health/db", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM businesses`;
      return res.json({ ok: true, service: "Axtor POS Cloud API", environment: process.env.NODE_ENV || "development", database: "ok", checks: { prismaConnection: true, postgresQuery: true, businessesTable: true }, businessCount: rows[0]?.count ?? 0, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("DB health check failed:", error);
      return res.status(500).json({ ok: false, service: "Axtor POS Cloud API", environment: process.env.NODE_ENV || "development", database: "error", error: { message: "Database health check failed" }, timestamp: new Date().toISOString() });
    }
  });

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/access-control", accessControlRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/customers", customersRoutes);
  app.use("/api/v1/products", productsRoutes);
  app.use("/api/v1/sales-documents", salesDocumentsRoutes);
  app.use("/api/v1/payments", paymentsRoutes);
  app.use("/api/v1/sales-returns", salesReturnsRoutes);
  app.use("/api/v1/refunds", refundsRoutes);
  app.use("/api/v1/salesmen", salesmenRoutes);
  app.use("/api/v1/suppliers", suppliersRoutes);
  app.use("/api/v1/purchases", purchasesRoutes);
  app.use("/api/v1/inventory", inventoryRoutes);
  app.use("/api/v1/branches", branchesRoutes);
  app.use("/api/v1/accounts", accountsRoutes);
  app.use("/api/v1/expenses", expensesRoutes);
  app.use("/api/v1/shifts", shiftsRoutes);
  app.use("/api/v1/reports", reportsRoutes);
  app.use("/api/v1/promotions", promotionsRoutes);
  app.use("/api/v1/loyalty", loyaltyRoutes);
  app.use("/api/v1/notifications", notificationsRoutes);
  app.use("/api/v1/approvals", approvalsRoutes);
  app.use("/api/v1/settings", settingsRoutes);
  app.use("/api/v1/communications", communicationsRoutes);
  app.use("/api/v1/commercial", commercialRoutes);
  app.use("/api/v1/platform-admin", platformAdminRoutes);

  app.use((req: Request, res: Response) => res.status(404).json({ ok: false, error: { message: `Route not found: ${req.method} ${req.originalUrl}`, referenceId: res.locals.requestId } }));
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled API error:", error);
    return res.status(500).json({ ok: false, error: { message: "Internal server error", referenceId: res.locals.requestId } });
  });
  return app;
}

export default createApp;
// Railway fresh rebuild: Global SaaS backend
