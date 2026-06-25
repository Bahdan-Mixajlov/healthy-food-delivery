import express from "express";
import {
  createSubscription,
  getClientSubscriptions,
  cancelSubscription,
} from "../controllers/subscriptionController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authenticateToken, createSubscription);
router.get("/client/:clientId", authenticateToken, getClientSubscriptions);

router.delete("/:id", authenticateToken, cancelSubscription);

export default router;
