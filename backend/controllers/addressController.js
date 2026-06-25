import { db } from "../config/db.js";

export const getAddresses = async (req, res) => {
  const { clientId } = req.params;
  try {
    const [rows] = await db.execute(
      "SELECT * FROM address WHERE id_client = ?",
      [clientId],
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка при получении адресов" });
  }
};

export const addAddress = async (req, res) => {
  const { clientId, street, building, floor, apartment } = req.body;
  try {
    const [result] = await db.execute(
      "INSERT INTO address (id_client, street, building, floor, apartment) VALUES (?, ?, ?, ?, ?)",
      [clientId, street, building, floor, apartment],
    );
    res.status(201).json({ id: result.insertId, message: "Адрес добавлен" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка при добавлении адреса" });
  }
};

export const deleteAddress = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute(
      "DELETE FROM address WHERE id_address = ?",
      [id],
    );

    res.status(200).json({ message: "Адрес удален" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка при удалении адреса" });
  }
};
