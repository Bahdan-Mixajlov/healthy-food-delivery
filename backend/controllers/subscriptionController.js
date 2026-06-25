import { db } from "../config/db.js";

export const createSubscription = async (req, res) => {
  const {
    clientId,
    planId,
    startDate,
    endDate,
    deliveryTime,
    deliveryDays,
    totalPrice,
  } = req.body;

  try {
    const [result] = await db.execute(
      "INSERT INTO subscription (id_client, id_plan, start_date, end_date, delivery_time, delivery_days, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        clientId,
        planId,
        startDate,
        endDate,
        deliveryTime,
        deliveryDays,
        "active",
      ],
    );

    const cashback = Math.floor(totalPrice * 0.05);
    await db.execute(
      "UPDATE client SET bonus_points = bonus_points + ? WHERE id_client = ?",
      [cashback, clientId],
    );

    const [clientRows] = await db.execute(
      "SELECT bonus_points FROM client WHERE id_client = ?",
      [clientId],
    );

    res.status(201).json({
      message: "Подписка оформлена",
      subscriptionId: result.insertId,
      newTotalPoints: clientRows[0].bonus_points,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getClientSubscriptions = async (req, res) => {
  const { clientId } = req.params;
  try {
    const [rows] = await db.execute(
      `
      SELECT s.*, p.name AS plan_title, p.image_url AS image
      FROM subscription s
      JOIN nutrition_plan p ON s.id_plan = p.id_plan
      WHERE s.id_client = ?
      ORDER BY s.start_date DESC
    `,
      [clientId],
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
export const cancelSubscription = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute(
      "DELETE FROM subscription WHERE id_subscription = ?",
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Подписка не найдена" });
    }

    res.status(200).json({ message: "Подписка успешно отменена" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка при отмене подписки" });
  }
};
