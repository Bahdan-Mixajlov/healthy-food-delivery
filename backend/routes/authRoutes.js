import express from "express";
import {
  sendCode,
  verifyCode,
  sendCourierCode,
  verifyCourierCode,
} from "../controllers/authController.js";
const router = express.Router();

router.post("/send-code", sendCode);
router.post("/verify-code", verifyCode);

router.post("/courier/send-code", sendCourierCode);
router.post("/courier/verify-code", verifyCourierCode);

export default router;
