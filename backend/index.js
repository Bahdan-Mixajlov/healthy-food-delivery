import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { db } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import dishRoutes from "./routes/dishRoutes.js";
import planRoutes from "./routes/planRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import { updateProfile } from "./controllers/clientController.js";
import {
  getAddresses,
  addAddress,
  deleteAddress,
} from "./controllers/addressController.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import ingredientRoutes from "./routes/ingredientRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import mealLogRoutes from "./routes/mealLogRoutes.js";

import { authenticateToken } from "./middleware/authMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/api/payments", authenticateToken, paymentRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/subscriptions", subscriptionRoutes);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("/api/auth", authRoutes);
app.use("/api/dishes", dishRoutes);
app.use("/api/plans", planRoutes);

app.use("/api/ingredients", ingredientRoutes);

app.use("/api/orders", authenticateToken, orderRoutes);
app.put("/api/clients/:id", authenticateToken, updateProfile);
app.get("/api/addresses/:clientId", authenticateToken, getAddresses);
app.post("/api/addresses", authenticateToken, addAddress);
app.delete("/api/addresses/:id", authenticateToken, deleteAddress);
app.use("/api/meal-log", authenticateToken, mealLogRoutes);

app.get("/api/test", (req, res) => {
  res.json({ message: "Сервер успешно запущен" });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
