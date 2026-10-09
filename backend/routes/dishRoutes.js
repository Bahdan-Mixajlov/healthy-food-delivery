import express from "express";
import {
  getAllDishes,
  getDishById,
  getSmartSearch,
  getAIChatResponse,
} from "../controllers/dishController.js";

const router = express.Router();

router.get("/search/smart", getSmartSearch);
router.post("/search/chat", getAIChatResponse);

router.get("/", getAllDishes);
router.get("/:id", getDishById);

export default router;
