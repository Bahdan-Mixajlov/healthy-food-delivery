import express from "express";
import { getAllIngredients } from "../controllers/ingredientController.js";
const router = express.Router();
router.get("/", getAllIngredients);
export default router;
