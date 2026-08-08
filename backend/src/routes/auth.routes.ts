import { Router } from "express";
import { changePassword, login, logout, me } from "../controllers/auth.controller.js";
import { exchangeHandoff, frontendHandoff } from "../controllers/auth-handoff.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { auditGroceryLogin } from "../middleware/grocery-login-audit.middleware.js";

export const authRouter = Router();

authRouter.post("/login", auditGroceryLogin, login);
authRouter.get("/me", requireAuth, me);
authRouter.post("/handoff", requireAuth, frontendHandoff);
authRouter.post("/exchange", exchangeHandoff);
authRouter.post("/logout", requireAuth, logout);
authRouter.post("/change-password", requireAuth, changePassword);

export const authRoutes = authRouter;
export const router = authRouter;
export default authRouter;
