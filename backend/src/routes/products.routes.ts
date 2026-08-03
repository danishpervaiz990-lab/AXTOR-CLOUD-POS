import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", requirePermission("products.view"), listProducts);
productsRouter.get("/:id", requirePermission("products.view"), getProduct);
productsRouter.post("/", requirePermission("products.manage"), createProduct);
productsRouter.patch("/:id", requirePermission("products.manage"), updateProduct);
productsRouter.delete("/:id", requirePermission("products.manage"), deleteProduct);

export const productsRoutes = productsRouter;
export const router = productsRouter;

export default productsRouter;
