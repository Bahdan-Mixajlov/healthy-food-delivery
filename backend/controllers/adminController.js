import { db } from "../config/db.js";
import ExcelJS from "exceljs";

export const getAllOrders = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT o.*, c.phone_number, a.street, a.building, cr.first_name as courier_name
      FROM orders o
      JOIN client c ON o.id_client = c.id_client
      JOIN address a ON o.id_address = a.id_address
      LEFT JOIN courier cr ON o.id_courier = cr.id_courier
      ORDER BY o.order_date DESC
    `);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка загрузки заказов" });
  }
};

export const getAllCouriers = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id_courier as id, first_name as name FROM courier",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка загрузки курьеров" });
  }
};

export const assignCourier = async (req, res) => {
  const { id } = req.params;
  const { id_courier } = req.body;
  try {
    await db.execute("UPDATE orders SET id_courier = ? WHERE id_order = ?", [
      id_courier === "" ? null : id_courier,
      id,
    ]);
    res.json({ message: "Курьер назначен" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка назначения" });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const [revenueRow] = await db.execute(
      "SELECT SUM(total_amount) as total FROM orders",
    );

    const [clientsRow] = await db.execute(
      "SELECT COUNT(*) as total FROM client",
    );

    const [subsRow] = await db.execute(
      "SELECT COUNT(*) as total FROM subscription WHERE status = 'active'",
    );

    const [revenueData] = await db.execute(`
      SELECT DATE_FORMAT(order_date, '%d.%m') as date, SUM(total_amount) as amount
      FROM orders 
      GROUP BY DATE_FORMAT(order_date, '%d.%m')
      ORDER BY MIN(order_date) ASC 
      LIMIT 7
    `);

    const [categoryData] = await db.execute(`
      SELECT c.name, COUNT(oi.id_order_item) as value
      FROM order_item oi
      JOIN dish d ON oi.id_dish = d.id_dish
      JOIN category c ON d.id_category = c.id_category
      GROUP BY c.name
    `);

    const [topDishes] = await db.execute(`
      SELECT d.name, COUNT(oi.id_dish) as orders_count
      FROM order_item oi
      JOIN dish d ON oi.id_dish = d.id_dish
      GROUP BY d.id_dish, d.name
      ORDER BY orders_count DESC
      LIMIT 5
    `);

    res.status(200).json({
      totalRevenue: revenueRow[0]?.total || 0,
      totalClients: clientsRow[0]?.total || 0,
      activeSubs: subsRow[0]?.total || 0,
      revenueHistory: revenueData,
      categoryStats: categoryData,
      topDishes: topDishes,
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка при получении аналитики" });
  }
};

export const getAllSubscriptions = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.*, c.phone_number, p.name AS plan_name 
      FROM subscription s
      JOIN client c ON s.id_client = c.id_client
      JOIN nutrition_plan p ON s.id_plan = p.id_plan
      ORDER BY s.start_date DESC
    `);
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.execute(`UPDATE orders SET status = ? WHERE id_order = ?`, [
      status,
      id,
    ]);
    res.status(200).json({ message: "ОК" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const createDish = async (req, res) => {
  const {
    id_category,
    name,
    calories,
    proteins,
    fats,
    carbs,
    weight,
    price,
    description,
    image_url,
  } = req.body;
  try {
    const [result] = await db.execute(
      `INSERT INTO dish (id_category, name, calories, proteins, fats, carbs, weight, price, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_category,
        name,
        calories,
        proteins,
        fats,
        carbs,
        weight,
        price,
        description,
        image_url,
      ],
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const updateDish = async (req, res) => {
  const { id } = req.params;
  const {
    id_category,
    name,
    calories,
    proteins,
    fats,
    carbs,
    weight,
    price,
    description,
    image_url,
  } = req.body;
  try {
    await db.execute(
      `UPDATE dish SET id_category=?, name=?, calories=?, proteins=?, fats=?, carbs=?, weight=?, price=?, description=?, image_url=? WHERE id_dish=?`,
      [
        id_category,
        name,
        calories,
        proteins,
        fats,
        carbs,
        weight,
        price,
        description,
        image_url,
        id,
      ],
    );
    res.status(200).json({ message: "ОК" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const deleteDish = async (req, res) => {
  try {
    await db.execute(`DELETE FROM dish WHERE id_dish = ?`, [req.params.id]);
    res.status(200).json({ message: "ОК" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const createPlan = async (req, res) => {
  const {
    name,
    total_calories,
    proteins,
    fats,
    carbs,
    price,
    description,
    image_url,
  } = req.body;
  try {
    const [result] = await db.execute(
      `INSERT INTO nutrition_plan (name, total_calories, proteins, fats, carbs, price, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        total_calories,
        proteins,
        fats,
        carbs,
        price,
        description,
        image_url,
      ],
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const updatePlan = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    total_calories,
    proteins,
    fats,
    carbs,
    price,
    description,
    image_url,
  } = req.body;
  try {
    await db.execute(
      `UPDATE nutrition_plan SET name=?, total_calories=?, proteins=?, fats=?, carbs=?, price=?, description=?, image_url=? WHERE id_plan=?`,
      [
        name,
        total_calories,
        proteins,
        fats,
        carbs,
        price,
        description,
        image_url,
        id,
      ],
    );
    res.status(200).json({ message: "ОК" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const deletePlan = async (req, res) => {
  try {
    await db.execute(`DELETE FROM nutrition_plan WHERE id_plan = ?`, [
      req.params.id,
    ]);
    res.status(200).json({ message: "ОК" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка" });
  }
};

export const exportOrdersToExcel = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT o.id_order, c.phone_number, o.total_amount, o.payment_type, o.status, o.order_date, a.street, a.building
      FROM orders o
      JOIN client c ON o.id_client = c.id_client
      JOIN address a ON o.id_address = a.id_address
      ORDER BY o.order_date DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Отчет по заказам");

    worksheet.columns = [
      { header: "№ Заказа", key: "id_order", width: 10 },
      { header: "Дата", key: "order_date", width: 20 },
      { header: "Клиент", key: "phone_number", width: 20 },
      { header: "Адрес", key: "address", width: 30 },
      { header: "Сумма (BYN)", key: "total_amount", width: 15 },
      { header: "Оплата", key: "payment_type", width: 15 },
      { header: "Статус", key: "status", width: 15 },
    ];

    rows.forEach((order) => {
      worksheet.addRow({
        id_order: order.id_order,
        order_date: new Date(order.order_date).toLocaleString("ru-RU"),
        phone_number: order.phone_number,
        address: `${order.street}, ${order.building}`,
        total_amount: order.total_amount,
        payment_type: order.payment_type,
        status: order.status,
      });
    });

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF21C063" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=" + "orders_report.xlsx",
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).send("Ошибка при генерации отчета");
  }
};
