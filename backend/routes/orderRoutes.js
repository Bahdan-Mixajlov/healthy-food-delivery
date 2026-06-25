import express from "express";
import {
  createOrder,
  getClientOrders,
  getOrderById,
  updateOrderStatus,
  getCourierOrders,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/", createOrder);
router.get("/:id", getOrderById);
router.get("/client/:clientId", getClientOrders);
router.patch("/:id/status", updateOrderStatus);
router.put("/:id/status", updateOrderStatus);
router.get("/courier/:courierId", getCourierOrders);

export default router;
