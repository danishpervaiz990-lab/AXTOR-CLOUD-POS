import { Router } from "express";
import { login, logout, me } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.get("/me", me);
authRouter.post("/logout", logout);

export const authRoutes = authRouter;
export const router = authRouter;

export default authRouter;
