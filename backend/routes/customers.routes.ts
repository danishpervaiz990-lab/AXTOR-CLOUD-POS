import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../controllers/customers.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", listCustomers);
customersRouter.get("/:id", getCustomer);
customersRouter.post("/", createCustomer);
customersRouter.patch("/:id", updateCustomer);
customersRouter.delete("/:id", deleteCustomer);

export const customersRoutes = customersRouter;
export const router = customersRouter;

export default customersRouter;
