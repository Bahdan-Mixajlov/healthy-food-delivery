import express from "express";
import {
  getPaymentMethods,
  deletePaymentMethod,
  addPaymentMethod,
} from "../controllers/paymentController.js";

const router = express.Router();

router.get("/:clientId", getPaymentMethods);
router.delete("/:id", deletePaymentMethod);
router.post("/", addPaymentMethod);

export default router;
