import express from "express";
import { protect } from "../middleware/authMiddleware";
import { exportCalendar } from "../controllers/workflowController";
const router = express.Router();
router.get("/calendar.ics", protect, exportCalendar);
export default router;
