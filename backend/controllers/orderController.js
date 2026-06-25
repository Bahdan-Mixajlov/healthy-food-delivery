import { db } from "../config/db.js";

export const createOrder = async (req, res) => {
  const { clientId, addressId, items, totalAmount, paymentType, usePoints } =
    req.body;

  try {
    const [clientRows] = await db.execute(
      "SELECT bonus_points FROM client WHERE id_client = ?",
      [clientId],
    );
    let currentPoints = clientRows[0].bonus_points;
    let discount = 0;
    let finalAmount = totalAmount;

    if (usePoints && currentPoints > 0) {
      discount = Math.min(currentPoints, totalAmount - 5.0);
      finalAmount = totalAmount - discount;

      await db.execute(
        "UPDATE client SET bonus_points = bonus_points - ? WHERE id_client = ?",
        [discount, clientId],
      );
    }

    const [orderResult] = await db.execute(
      "INSERT INTO orders (id_client, id_address, total_amount, payment_type, status) VALUES (?, ?, ?, ?, ?)",
      [clientId, addressId, finalAmount, paymentType, "created"],
    );

    const orderId = orderResult.insertId;

    const promises = items.map((item) => {
      return db.execute(
        "INSERT INTO order_item (id_order, id_dish, quantity) VALUES (?, ?, ?)",
        [orderId, item.id, item.quantity],
      );
    });
    await Promise.all(promises);

    const cashback = Math.floor(finalAmount * 0.05);
    await db.execute(
      "UPDATE client SET bonus_points = bonus_points + ? WHERE id_client = ?",
      [cashback, clientId],
    );

    const [updatedClient] = await db.execute(
      "SELECT bonus_points FROM client WHERE id_client = ?",
      [clientId],
    );

    res.status(201).json({
      message: "Заказ оформлен",
      orderId,
      discount,
      newTotalPoints: updatedClient[0].bonus_points,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getClientOrders = async (req, res) => {
  const { clientId } = req.params;

  try {
    const [orders] = await db.execute(
      "SELECT id_order AS id, order_date AS date, total_amount AS total, status FROM orders WHERE id_client = ? ORDER BY order_date DESC",
      [clientId],
    );

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await db.execute(
          `SELECT d.image_url FROM order_item oi 
         JOIN dish d ON oi.id_dish = d.id_dish 
         WHERE oi.id_order = ?`,
          [order.id],
        );

        return {
          ...order,
          items: items.map((i) => i.image_url),
        };
      }),
    );

    res.status(200).json(ordersWithItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка при получении истории заказов" });
  }
};

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  try {
    const [orderRows] = await db.execute(
      `SELECT o.*, a.street, a.building, a.apartment, a.floor, a.entrance,
              cr.first_name AS courier_name, 
              cr.phone_number AS courier_phone,
              c.first_name AS client_name, 
              c.phone_number AS client_phone
       FROM orders o 
       LEFT JOIN address a ON o.id_address = a.id_address 
       LEFT JOIN courier cr ON o.id_courier = cr.id_courier
       LEFT JOIN client c ON o.id_client = c.id_client
       WHERE o.id_order = ?`,
      [id],
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ message: "Заказ не найден" });
    }

    const order = orderRows[0];

    const [items] = await db.execute(
      `SELECT d.id_dish AS id, d.name AS title, d.image_url AS image, d.price, oi.quantity, d.weight
       FROM order_item oi
       JOIN dish d ON oi.id_dish = d.id_dish
       WHERE oi.id_order = ?`,
      [id],
    );

    res.status(200).json({ ...order, items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await db.execute("UPDATE orders SET status = ? WHERE id_order = ?", [
      status,
      id,
    ]);
    res.status(200).json({ message: "Статус обновлен", newStatus: status });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getCourierOrders = async (req, res) => {
  const { courierId } = req.params;
  const { filter } = req.query;

  try {
    let sql = `
      SELECT o.id_order AS id, o.total_amount, o.status, o.order_date AS created_at,
             a.street, a.building, a.apartment, a.entrance, a.floor
      FROM orders o
      JOIN address a ON o.id_address = a.id_address
      WHERE o.id_courier = ?
    `;

    if (filter === "active") {
      sql += " AND o.status IN ('created', 'cooking', 'delivering')";
    } else {
      sql += " AND o.status = 'delivered'";
    }

    sql += " ORDER BY o.order_date DESC";

    const [orders] = await db.execute(sql, [courierId]);
    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка получения заказов курьера" });
  }
};
