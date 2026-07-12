import { Router } from "express";
import { changePassword, login, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.post("/logout", requireAuth, logout);
authRouter.post("/change-password", requireAuth, changePassword);

export const authRoutes = authRouter;
export const router = authRouter;

export default authRouter;
