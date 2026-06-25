import { db } from "../config/db.js";
export const getAllIngredients = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM ingredient ORDER BY name ASC",
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
