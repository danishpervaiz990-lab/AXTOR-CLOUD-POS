import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", listProducts);
productsRouter.get("/:id", getProduct);
productsRouter.post("/", createProduct);
productsRouter.patch("/:id", updateProduct);
productsRouter.delete("/:id", deleteProduct);

export const productsRoutes = productsRouter;
export const router = productsRouter;

export default productsRouter;
