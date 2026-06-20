import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";

import authRoutes from "./routes/auth.routes.js";
import customersRoutes from "./routes/customers.routes.js";
import productsRoutes from "./routes/products.routes.js";
import salesDocumentsRoutes from "./routes/sales-documents.routes.js";

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

      const businessCount = await prisma.tenant.count();

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
        businessCount,
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
