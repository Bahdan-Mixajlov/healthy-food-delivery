import { db } from "../config/db.js";

export const updateProfile = async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName } = req.body;

  try {
    await db.execute(
      "UPDATE client SET first_name = ?, last_name = ? WHERE id_client = ?",
      [firstName || null, lastName || null, id],
    );
    const [rows] = await db.execute(
      "SELECT * FROM client WHERE id_client = ?",
      [id],
    );
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка при обновлении профиля" });
  }
};
