import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Package,
  Utensils,
  Calendar,
  PlusCircle,
  LayoutList,
  Trash2,
  Edit2,
  X,
  BarChart3,
  Upload,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import "./App.css";
import { supabase } from "./supabaseClient";

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [activeTab, setActiveTab] = useState<
    | "orders"
    | "subs"
    | "dishes_list"
    | "plans_list"
    | "add_dish"
    | "add_plan"
    | "analytics"
  >("orders");
  const [couriers, setCouriers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [dishesList, setDishesList] = useState<any[]>([]);
  const [plansList, setPlansList] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [analytics, setAnalytics] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState("all");

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [newDish, setNewDish] = useState({
    id_category: 1,
    name: "",
    calories: 0,
    proteins: 0,
    fats: 0,
    carbs: 0,
    weight: 0,
    price: 0,
    description: "",
    image_url: "",
  });

  const [newPlan, setNewPlan] = useState({
    name: "",
    total_calories: 0,
    proteins: 0,
    fats: 0,
    carbs: 0,
    price: 0,
    description: "",
    image_url: "",
  });

  useEffect(() => {
    const fetchCouriers = async () => {
      const res = await axios.get(`${API_URL}/admin/couriers`);
      setCouriers(res.data);
    };
    fetchCouriers();
    if (activeTab === "orders") fetchOrders();
    if (activeTab === "subs") fetchSubscriptions();
    if (activeTab === "dishes_list") fetchDishesList();
    if (activeTab === "plans_list") fetchPlansList();
    if (activeTab === "analytics") fetchAnalytics();
  }, [activeTab]);

  const handleAssignCourier = async (orderId: number, courierId: string) => {
    try {
      await axios.patch(`${API_URL}/admin/orders/${orderId}/courier`, {
        id_courier: courierId,
      });
      fetchOrders();
    } catch (e) {
      alert("Ошибка назначения курьера");
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/analytics`);
      setAnalytics(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/orders`);
      setOrders(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/subscriptions`);
      setSubscriptions(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDishesList = async () => {
    try {
      const res = await axios.get(`${API_URL}/dishes`);
      setDishesList(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPlansList = async () => {
    try {
      const res = await axios.get(`${API_URL}/plans`);
      setPlansList(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (type: "dish" | "plan", id: number) => {
    if (!window.confirm("Удалить безвозвратно?")) return;
    try {
      await axios.delete(
        `${API_URL}/admin/${type === "dish" ? "dishes" : "plans"}/${id}`,
      );
      type === "dish" ? fetchDishesList() : fetchPlansList();
    } catch (e) {
      alert("Ошибка удаления. Возможно, объект используется в заказах.");
    }
  };

  const startEditDish = (d: any) => {
    setEditingId(d.id);
    setNewDish({
      id_category: d.id_category || 1,
      name: d.title,
      calories: d.calories || 0,
      proteins: d.proteins || 0,
      fats: d.fats || 0,
      carbs: d.carbs || 0,
      weight: d.weight || 0,
      price: d.price || 0,
      description: d.description || "",
      image_url: d.image || "",
    });
    setActiveTab("add_dish");
  };

  const startEditPlan = (p: any) => {
    setEditingId(p.id);
    setNewPlan({
      name: p.title,
      total_calories: p.calories || 0,
      proteins: p.proteins || 0,
      fats: p.fats || 0,
      carbs: p.carbs || 0,
      price: p.price || 0,
      description: p.description || "",
      image_url: p.image || "",
    });
    setActiveTab("add_plan");
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    await axios.patch(`${API_URL}/admin/orders/${id}/status`, { status });
    fetchOrders();
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalImageUrl = newDish.image_url;

    try {
      if (imageFile) {
        finalImageUrl = await uploadToSupabase(imageFile);
      }

      const dishData = {
        ...newDish,
        image_url: finalImageUrl,
      };

      if (editingId) {
        await axios.patch(`${API_URL}/admin/dishes/${editingId}`, dishData);
      } else {
        await axios.post(`${API_URL}/admin/dishes`, dishData);
      }

      alert(editingId ? "Блюдо успешно обновлено!" : "Новое блюдо создано!");

      setEditingId(null);
      setImageFile(null);
      setNewDish({
        id_category: 1,
        name: "",
        calories: 0,
        proteins: 0,
        fats: 0,
        carbs: 0,
        weight: 0,
        price: 0,
        description: "",
        image_url: "",
      });

      setActiveTab("dishes_list");
    } catch (error: any) {
      console.error("Ошибка при сохранении:", error);
      alert("Произошла ошибка при сохранении данных. Проверьте консоль.");
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalImageUrl = newPlan.image_url;

    try {
      if (imageFile) {
        finalImageUrl = await uploadToSupabase(imageFile);
      }

      const planData = {
        ...newPlan,
        image_url: finalImageUrl,
      };

      if (editingId) {
        await axios.patch(`${API_URL}/admin/plans/${editingId}`, planData);
      } else {
        await axios.post(`${API_URL}/admin/plans`, planData);
      }

      alert("План питания сохранен!");

      setEditingId(null);
      setImageFile(null);
      setNewPlan({
        name: "",
        total_calories: 0,
        proteins: 0,
        fats: 0,
        carbs: 0,
        price: 0,
        description: "",
        image_url: "",
      });

      setActiveTab("plans_list");
    } catch (error) {
      console.error("Ошибка сохранения плана:", error);
      alert("Ошибка при сохранении плана");
    }
  };
  const uploadToSupabase = async (file: File) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error } = await supabase.storage
      .from("dish-images")
      .upload(filePath, file);

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("dish-images").getPublicUrl(filePath);

    return publicUrl;
  };

  const handleDownloadReport = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/export-orders`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `report_${new Date().toLocaleDateString()}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
    } catch (e) {
      alert("Ошибка при скачивании отчета");
    }
  };

  return (
    <div className="admin-container">
      <div className="sidebar">
        <h2 className="logo">Admin Panel</h2>
        <p className="section-label">Данные</p>
        <button
          onClick={() => setActiveTab("orders")}
          className={`nav-btn ${activeTab === "orders" ? "active" : ""}`}
        >
          <Package size={20} /> <span>Заказы</span>
        </button>
        <button
          onClick={() => setActiveTab("subs")}
          className={`nav-btn ${activeTab === "subs" ? "active" : ""}`}
        >
          <Calendar size={20} /> <span>Подписки</span>
        </button>
        <button
          onClick={() => setActiveTab("dishes_list")}
          className={`nav-btn ${activeTab === "dishes_list" ? "active" : ""}`}
        >
          <Utensils size={20} /> <span>Все блюда</span>
        </button>
        <button
          onClick={() => setActiveTab("plans_list")}
          className={`nav-btn ${activeTab === "plans_list" ? "active" : ""}`}
        >
          <LayoutList size={20} /> <span>Все планы</span>
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`nav-btn ${activeTab === "analytics" ? "active" : ""}`}
        >
          <BarChart3 size={20} /> <span>Аналитика</span>
        </button>

        <p className="section-label">Создание</p>
        <button
          onClick={() => {
            setEditingId(null);
            setActiveTab("add_dish");
          }}
          className={`nav-btn ${activeTab === "add_dish" ? "active" : ""}`}
        >
          <PlusCircle size={20} /> <span>Новое блюдо</span>
        </button>
        <button
          onClick={() => {
            setEditingId(null);
            setActiveTab("add_plan");
          }}
          className={`nav-btn ${activeTab === "add_plan" ? "active" : ""}`}
        >
          <PlusCircle size={20} /> <span>Новый план</span>
        </button>
      </div>

      <div className="main-content">
        {activeTab === "analytics" && analytics && (
          <div className="analytics-container">
            <div className="title-row">
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                Аналитика бизнеса
              </h1>

              <button
                onClick={handleDownloadReport}
                className="download-report-btn"
              >
                <Package size={18} color="#21C063" />
                Скачать отчет Excel
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <p className="stat-label">Общая выручка</p>
                <h3 className="stat-value">
                  {parseFloat(analytics.totalRevenue).toFixed(2)} BYN
                </h3>
              </div>
              <div className="stat-card">
                <p className="stat-label">Активные подписки</p>
                <h3 className="stat-value">{analytics.activeSubs}</h3>
              </div>
              <div className="stat-card">
                <p className="stat-label">Всего клиентов</p>
                <h3 className="stat-value">{analytics.totalClients}</h3>
              </div>
            </div>

            <div className="charts-main-row">
              <div className="chart-box large">
                <h3 className="chart-title">Динамика выручки (7 дней)</h3>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <AreaChart data={analytics.revenueHistory}>
                      <defs>
                        <linearGradient
                          id="colorRev"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#21C063"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="#21C063"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#eee"
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#666" }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#666" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#21C063"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRev)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-box small">
                <h3 className="chart-title">Продажи по категориям</h3>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={analytics.categoryStats}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {analytics.categoryStats.map(
                          (_: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                ["#21C063", "#3498DB", "#E67E22", "#9B59B6"][
                                  index % 4
                                ]
                              }
                            />
                          ),
                        )}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="popular-box-full">
              <h3 className="chart-title">Топ-5 популярных блюд</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Блюдо</th>
                    <th>Количество заказов</th>
                    <th>Популярность</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topDishes.map((dish: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <span>{dish.name}</span>
                      </td>
                      <td>{dish.orders_count}</td>
                      <td style={{ width: "40%" }}>
                        <div className="progress-bg">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${(dish.orders_count / analytics.topDishes[0].orders_count) * 100}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                Управление заказами
              </h1>

              <div className="filter-row">
                <span>Показать: </span>
                <button
                  className={activeFilter === "all" ? "active" : ""}
                  onClick={() => setActiveFilter("all")}
                >
                  Все
                </button>
                <button
                  className={activeFilter === "created" ? "active" : ""}
                  onClick={() => setActiveFilter("created")}
                >
                  Новые
                </button>
                <button
                  className={activeFilter === "cooking" ? "active" : ""}
                  onClick={() => setActiveFilter("cooking")}
                >
                  В работе
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="admin-table orders-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Клиент</th>
                    <th>Адрес</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>Действие</th>
                    <th>Курьер</th>
                  </tr>
                </thead>
                <tbody>
                  {orders
                    .filter(
                      (o) =>
                        activeFilter === "all" || o.status === activeFilter,
                    )
                    .map((o) => (
                      <tr key={o.id_order}>
                        <td>{o.id_order}</td>
                        <td>{o.phone_number}</td>
                        <td>
                          {o.street}, {o.building}
                        </td>
                        <td>{parseFloat(o.total_amount).toFixed(2)} BYN</td>
                        <td>
                          <span
                            className={
                              o.status === "delivered"
                                ? "status-delivered"
                                : "status-other"
                            }
                          >
                            {o.status}
                          </span>
                        </td>
                        <td>
                          <select
                            className="admin-select"
                            onChange={(e) =>
                              handleUpdateStatus(o.id_order, e.target.value)
                            }
                            value={o.status}
                          >
                            <option value="created">Принят</option>
                            <option value="cooking">Готовится</option>
                            <option value="on_way">В пути</option>
                            <option value="delivered">Доставлен</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="admin-select"
                            value={o.id_courier || ""}
                            onChange={(e) =>
                              handleAssignCourier(o.id_order, e.target.value)
                            }
                          >
                            <option value="">Не назначен</option>
                            {couriers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "subs" && (
          <div>
            <h1 className="page-title">Активные подписки</h1>
            <div className="table-wrapper">
              <table className="admin-table subs-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Клиент</th>
                    <th>План</th>
                    <th>Начало</th>
                    <th>Конец</th>
                    <th>Дни</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id_subscription}>
                      <td>{s.id_subscription}</td>
                      <td>{s.phone_number}</td>
                      <td>
                        <strong>{s.plan_name}</strong>
                      </td>
                      <td>{new Date(s.start_date).toLocaleDateString()}</td>
                      <td>{new Date(s.end_date).toLocaleDateString()}</td>
                      <td>{s.delivery_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "dishes_list" && (
          <div>
            <h1 className="page-title">Каталог блюд</h1>
            <div className="table-wrapper">
              <table className="admin-table dishes-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Название</th>
                    <th>Ккал / Вес</th>
                    <th>Цена</th>
                    <th>Категория</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {dishesList.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>
                        <strong>{d.title}</strong>
                      </td>
                      <td>
                        {d.calories} кк / {d.weight}г
                      </td>
                      <td>{parseFloat(d.price).toFixed(2)} BYN</td>
                      <td>ID: {d.id_category}</td>
                      <td>
                        <div className="actions-cell">
                          <button
                            className="action-btn edit"
                            onClick={() => startEditDish(d)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() => handleDelete("dish", d.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "plans_list" && (
          <div>
            <h1 className="page-title">Планы питания</h1>
            <div className="table-wrapper">
              <table className="admin-table plans-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Название</th>
                    <th>Ккал/день</th>
                    <th>Цена/день</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {plansList.map((p) => (
                    <tr key={p.id_plan || p.id}>
                      <td>{p.id_plan || p.id}</td>
                      <td>
                        <strong>{p.title || p.name}</strong>
                      </td>
                      <td>{p.calories || p.total_calories} ккал</td>
                      <td>{parseFloat(p.price).toFixed(2)} BYN</td>
                      <td>
                        <div className="actions-cell">
                          <button
                            className="action-btn edit"
                            onClick={() => startEditPlan(p)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() =>
                              handleDelete("plan", p.id_plan || p.id)
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "add_dish" && (
          <div>
            <div className="title-row">
              <h1 className="page-title">
                {editingId ? "Редактировать блюдо" : "Новое блюдо"}
              </h1>
              {editingId && (
                <button
                  className="close-edit"
                  onClick={() => {
                    setEditingId(null);
                    setActiveTab("dishes_list");
                  }}
                >
                  <X size={20} /> Отмена
                </button>
              )}
            </div>
            <form onSubmit={handleSaveDish} className="admin-form">
              <div className="form-group">
                <label className="form-label">Название блюда</label>
                <input
                  required
                  className="form-input"
                  value={newDish.name}
                  onChange={(e) =>
                    setNewDish({ ...newDish, name: e.target.value })
                  }
                />
              </div>
              <div className="row">
                <div className="col">
                  <label className="form-label">Цена (BYN)</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    step="0.1"
                    value={newDish.price}
                    onChange={(e) =>
                      setNewDish({ ...newDish, price: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Категория (ID)</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    value={newDish.id_category}
                    onChange={(e) =>
                      setNewDish({
                        ...newDish,
                        id_category: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Вес (г)</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    value={newDish.weight}
                    onChange={(e) =>
                      setNewDish({ ...newDish, weight: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="row">
                <div className="col">
                  <label className="form-label">Ккал</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    value={newDish.calories}
                    onChange={(e) =>
                      setNewDish({
                        ...newDish,
                        calories: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Белки</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newDish.proteins}
                    onChange={(e) =>
                      setNewDish({
                        ...newDish,
                        proteins: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Жиры</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newDish.fats}
                    onChange={(e) =>
                      setNewDish({ ...newDish, fats: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Углеводы</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newDish.carbs}
                    onChange={(e) =>
                      setNewDish({ ...newDish, carbs: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Описание</label>
                <textarea
                  className="form-textarea"
                  value={newDish.description}
                  onChange={(e) =>
                    setNewDish({ ...newDish, description: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Изображение блюда</label>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/*"
                    className="file-input-native"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setImageFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className={`file-input-custom ${imageFile ? "has-file" : ""}`}
                  >
                    <Upload size={20} className="file-input-icon" />
                    <span className="file-input-text">
                      {imageFile ? (
                        <>
                          Выбран файл:{" "}
                          <span className="file-name-highlight">
                            {imageFile.name}
                          </span>
                        </>
                      ) : (
                        "Нажмите для выбора фото или перетащите файл"
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <button type="submit" className="submit-btn">
                {editingId ? "Сохранить изменения" : "Создать блюдо"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "add_plan" && (
          <div>
            <div className="title-row">
              <h1 className="page-title">
                {editingId ? "Редактировать план" : "Новый план"}
              </h1>
              {editingId && (
                <button
                  className="close-edit"
                  onClick={() => {
                    setEditingId(null);
                    setActiveTab("plans_list");
                  }}
                >
                  <X size={20} /> Отмена
                </button>
              )}
            </div>
            <form onSubmit={handleSavePlan} className="admin-form">
              <div className="form-group">
                <label className="form-label">Название плана</label>
                <input
                  required
                  className="form-input"
                  value={newPlan.name}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, name: e.target.value })
                  }
                />
              </div>
              <div className="row">
                <div className="col">
                  <label className="form-label">Цена/день (BYN)</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    step="0.1"
                    value={newPlan.price}
                    onChange={(e) =>
                      setNewPlan({ ...newPlan, price: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Всего Ккал</label>
                  <input
                    required
                    className="form-input"
                    type="number"
                    value={newPlan.total_calories}
                    onChange={(e) =>
                      setNewPlan({
                        ...newPlan,
                        total_calories: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="row">
                <div className="col">
                  <label className="form-label">Белки</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newPlan.proteins}
                    onChange={(e) =>
                      setNewPlan({
                        ...newPlan,
                        proteins: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Жиры</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newPlan.fats}
                    onChange={(e) =>
                      setNewPlan({ ...newPlan, fats: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col">
                  <label className="form-label">Углеводы</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newPlan.carbs}
                    onChange={(e) =>
                      setNewPlan({ ...newPlan, carbs: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Описание</label>
                <textarea
                  className="form-textarea"
                  value={newPlan.description}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, description: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Изображение плана</label>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/*"
                    className="file-input-native"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setImageFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className={`file-input-custom ${imageFile ? "has-file" : ""}`}
                  >
                    <Upload size={20} className="file-input-icon" />
                    <span className="file-input-text">
                      {imageFile ? (
                        <>
                          Выбран файл:{" "}
                          <span className="file-name-highlight">
                            {imageFile.name}
                          </span>
                        </>
                      ) : (
                        "Нажмите для выбора фото или перетащите файл"
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <button type="submit" className="submit-btn">
                {editingId ? "Сохранить изменения" : "Создать план"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
