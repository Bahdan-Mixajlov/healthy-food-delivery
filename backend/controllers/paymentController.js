import { db } from "../config/db.js";

export const getPaymentMethods = async (req, res) => {
  const { clientId } = req.params;
  try {
    const [rows] = await db.execute(
      "SELECT * FROM payment_method WHERE id_client = ?",
      [clientId],
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка при получении способов оплаты" });
  }
};

export const deletePaymentMethod = async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute("DELETE FROM payment_method WHERE id_payment = ?", [id]);
    res.status(200).json({ message: "Способ оплаты удален" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const addPaymentMethod = async (req, res) => {
  const { clientId, type, name, last4 } = req.body;
  try {
    const [result] = await db.execute(
      "INSERT INTO payment_method (id_client, type, name, last4) VALUES (?, ?, ?, ?)",
      [clientId, type, name, last4],
    );
    res
      .status(201)
      .json({ id: result.insertId, message: "Способ оплаты добавлен" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
