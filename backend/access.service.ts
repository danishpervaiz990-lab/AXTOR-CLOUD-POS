import { Router } from "express";
import {
  createCustomer,
  customerAgeing,
  customerCreditStatus,
  customerStatement,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  setCustomerCreditHold,
} from "../controllers/customers.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", listCustomers);
customersRouter.get("/ageing", customerAgeing);
customersRouter.get("/:id/statement", customerStatement);
customersRouter.get("/:id/credit-status", customerCreditStatus);
customersRouter.post("/:id/credit-hold", setCustomerCreditHold);
customersRouter.get("/:id", getCustomer);
customersRouter.post("/", createCustomer);
customersRouter.patch("/:id", updateCustomer);
customersRouter.delete("/:id", deleteCustomer);

export const customersRoutes = customersRouter;
export const router = customersRouter;

export default customersRouter;
