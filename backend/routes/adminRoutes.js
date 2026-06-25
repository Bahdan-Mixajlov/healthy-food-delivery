import express from "express";
import {
  getAllOrders,
  getAllSubscriptions,
  createDish,
  createPlan,
  updateDish,
  deleteDish,
  updatePlan,
  deletePlan,
  updateOrderStatus,
  getAnalytics,
  getAllCouriers,
  assignCourier,
  exportOrdersToExcel,
} from "../controllers/adminController.js";

const router = express.Router();

router.get("/orders", getAllOrders);
router.patch("/orders/:id/status", updateOrderStatus);
router.get("/analytics", getAnalytics);
router.get("/couriers", getAllCouriers);
router.patch("/orders/:id/courier", assignCourier);

router.get("/export-orders", exportOrdersToExcel);

router.get("/subscriptions", getAllSubscriptions);

router.post("/dishes", createDish);
router.patch("/dishes/:id", updateDish);
router.delete("/dishes/:id", deleteDish);

router.post("/plans", createPlan);
router.patch("/plans/:id", updatePlan);
router.delete("/plans/:id", deletePlan);

export default router;
