import express from "express";
import {
  getAllDishes,
  getDishById,
  getSmartSearch,
  getAIChatResponse,
} from "../controllers/dishController.js";

const router = express.Router();

router.get("/search/smart", getSmartSearch);
router.post("/search/chat", getAIChatResponse); // <--- ДОБАВЬТЕ ЭТОТ РОУТ (POST-запрос)

router.get("/", getAllDishes);
router.get("/:id", getDishById);

export default router;
