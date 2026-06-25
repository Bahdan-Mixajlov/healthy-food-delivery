import { db } from "../config/db.js";

export const getAllPlans = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id_plan AS id, name AS title, total_calories AS calories, price, image_url AS image FROM nutrition_plan",
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getPlanById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      `
      SELECT 
        id_plan AS id, 
        name AS title, 
        total_calories AS calories, 
        proteins, 
        fats, 
        carbs,
        price, 
        description, 
        image_url AS image 
      FROM nutrition_plan WHERE id_plan = ?
    `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "План не найден" });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
