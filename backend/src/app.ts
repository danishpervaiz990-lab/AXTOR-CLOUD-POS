import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { prisma } from "./db/prisma.js";

import * as authRoutesModule from "./routes/auth.routes.js";
import * as customersRoutesModule from "./routes/customers.routes.js";
import * as productsRoutesModule from "./routes/products.routes.js";
import * as salesDocumentsRoutesModule from "./routes/sales-documents.routes.js";

function getRouter(module: any, names: string[]) {
  for (const name of names) {
    if (module[name]) {
      return module[name];
    }
  }

  throw new Error(`Route module export not found. Tried: ${names.join(", ")}`);
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  const authRoutes = getRouter(authRoutesModule, [
    "default",
    "authRoutes",
    "authRouter",
    "router",
  ]);

  const customersRoutes = getRouter(customersRoutesModule, [
    "default",
    "customersRoutes",
    "customersRouter",
    "router",
  ]);

  const productsRoutes = getRouter(productsRoutesModule, [
    "default",
    "productsRoutes",
    "productsRouter",
    "router",
  ]);

  const salesDocumentsRoutes = getRouter(salesDocumentsRoutesModule, [
    "default",
    "salesDocumentsRoutes",
    "salesDocumentsRouter",
    "router",
  ]);

  app.get("/", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      service: "Axtor POS Cloud API",
      message: "Backend is running",
      version: "phase-2-production-backend",
      routes: {
        health: "/health",
        dbHealth: "/api/v1/health/db",
        auth: "/api/v1/auth",
        customers: "/api/v1/customers",
        products: "/api/v1/products",
        salesDocuments: "/api/v1/sales-documents",
      },
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      service: "Axtor POS Cloud API",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/health/db", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM businesses
      `;

      return res.json({
        ok: true,
        service: "Axtor POS Cloud API",
        environment: process.env.NODE_ENV || "development",
        database: "ok",
        checks: {
          prismaConnection: true,
          postgresQuery: true,
          businessesTable: true,
        },
        businessCount: rows[0]?.count ?? 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("DB health check failed:", error);

      return res.status(500).json({
        ok: false,
        service: "Axtor POS Cloud API",
        environment: process.env.NODE_ENV || "development",
        database: "error",
        error: {
          message: "Database health check failed",
        },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/customers", customersRoutes);
  app.use("/api/v1/products", productsRoutes);
  app.use("/api/v1/sales-documents", salesDocumentsRoutes);

  app.use((req: Request, res: Response) => {
    return res.status(404).json({
      ok: false,
      error: {
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled API error:", error);

    return res.status(500).json({
      ok: false,
      error: {
        message: "Internal server error",
      },
    });
  });

  return app;
}

export default createApp;
