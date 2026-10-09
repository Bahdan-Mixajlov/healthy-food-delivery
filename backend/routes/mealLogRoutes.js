import express from "express";
import {
  createMealLog,
  getClientMealLog,
  deleteMealLog,
} from "../controllers/mealLogController.js";

const router = express.Router();

router.get("/", getClientMealLog);
router.post("/", createMealLog);
router.delete("/:id", deleteMealLog);

export default router;
