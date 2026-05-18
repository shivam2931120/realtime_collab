import express from "express";
import {
  confirmPasswordReset,
  createSession,
  getSession,
  login,
  logout,
  refreshSession,
  register,
  requestPasswordReset,
} from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshSession);
router.post("/logout", logout);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", confirmPasswordReset);
router.post("/session", createSession);
router.get("/me", protect, getSession);

export default router;
