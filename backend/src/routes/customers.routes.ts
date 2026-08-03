import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../controllers/customers.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", requirePermission("customers.view"), listCustomers);
customersRouter.get("/:id", requirePermission("customers.view"), getCustomer);
customersRouter.post("/", requirePermission("customers.manage"), createCustomer);
customersRouter.patch("/:id", requirePermission("customers.manage"), updateCustomer);
customersRouter.delete("/:id", requirePermission("customers.manage"), deleteCustomer);

export const customersRoutes = customersRouter;
export const router = customersRouter;

export default customersRouter;
