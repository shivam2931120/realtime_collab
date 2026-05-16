import express from "express";
import { createSession, getSession } from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/session", createSession);
router.get("/me", protect, getSession);

export default router;
