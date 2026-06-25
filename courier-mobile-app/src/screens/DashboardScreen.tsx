import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useCourierAuthStore } from "../store/courierAuthStore";

export default function DashboardScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { courier, logout } = useCourierAuthStore();

  const [activeTab, setActiveTab] = useState<"current" | "completed">(
    "current",
  );
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      const statusFilter = activeTab === "current" ? "active" : "delivered";
      const response = await api.get(
        `/orders/courier/${courier?.id}?filter=${statusFilter}`,
      );
      setOrders(response.data);
    } catch (error) {
      console.error("Ошибка загрузки заказов курьера:", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, [activeTab]);

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case "created":
        return { text: "ПРИНЯТ", color: "#E67E22" };
      case "cooking":
        return { text: "ГОТОВИТСЯ", color: "#3498DB" };
      case "delivering":
        return { text: "В ПУТИ", color: "#F1C40F" };
      case "delivered":
        return { text: "ДОСТАВЛЕН", color: COLORS.primary };
      case "cancelled":
        return { text: "ОТМЕНЕН", color: COLORS.error };
      default:
        return { text: "ОБРАБОТКА", color: "#95A5A6" };
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText} weight="medium">
            Привет, {courier?.firstName}!
          </Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate("Profile")}
        >
          <FontAwesome6 name="user-large" size={18} color={COLORS.text} solid />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "current" && styles.activeTab]}
          onPress={() => setActiveTab("current")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "current" && styles.activeTabText,
            ]}
            weight="bold"
          >
            Текущие
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "completed" && styles.activeTab]}
          onPress={() => setActiveTab("completed")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "completed" && styles.activeTabText,
            ]}
            weight="bold"
          >
            Завершенные
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {orders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome6
                name="box-open"
                size={60}
                color={COLORS.inputBg}
                solid
              />
              <Text style={styles.emptyText} weight="medium">
                {activeTab === "current"
                  ? "Нет активных заказов"
                  : "Вы еще не доставили ни одного заказа сегодня"}
              </Text>
            </View>
          ) : (
            orders.map((order) => {
              const statusData = getStatusInfo(order.status);

              return (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate("OrderDetails", { orderId: order.id })
                  }
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.orderNumber} weight="bold">
                      Заказ №{order.id}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusData.color + "15" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: statusData.color },
                        ]}
                        weight="bold"
                      >
                        {statusData.text}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.addressRow}>
                    <FontAwesome6
                      name="location-dot"
                      size={16}
                      color={COLORS.textLight}
                      solid
                    />
                    <Text
                      style={styles.addressText}
                      weight="medium"
                      numberOfLines={2}
                    >
                      {order.street}, д.{order.building}, кв.{order.apartment}
                    </Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.priceBlock}>
                      <Text style={styles.footerLabel}>К оплате:</Text>
                      <Text style={styles.footerVal} weight="bold">
                        {parseFloat(order.total_amount).toFixed(2)} BYN
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <FontAwesome6
                        name="clock"
                        size={14}
                        color={COLORS.textLight}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.footerVal} weight="bold">
                        {new Date(order.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionBtn}>
                    <Text style={styles.actionBtnText} weight="bold">
                      Открыть детали
                    </Text>
                    <FontAwesome6 name="arrow-right" size={14} color="#FFF" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText} weight="bold">
              Выйти из системы
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  welcomeText: { fontSize: 18, color: COLORS.text },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  tabContainer: {
    flexDirection: "row",
    padding: 6,
    backgroundColor: "#E5E7EB",
    margin: 20,
    borderRadius: 16,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  activeTab: {
    backgroundColor: "#FFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: { color: COLORS.textLight, fontSize: 14 },
  activeTabText: { color: COLORS.text },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyText: {
    textAlign: "center",
    color: COLORS.textLight,
    marginTop: 16,
    fontSize: 15,
    paddingHorizontal: 40,
  },
  orderCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  orderNumber: { fontSize: 17, color: COLORS.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, letterSpacing: 0.5 },
  addressRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  addressText: { flex: 1, fontSize: 15, color: COLORS.text, marginLeft: 12 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    paddingTop: 16,
    marginBottom: 16,
  },
  priceBlock: { flex: 1 },
  footerLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 2 },
  footerVal: { fontSize: 14, color: COLORS.text },
  timeBlock: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    height: 50,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnText: { color: "#FFF", marginRight: 8, fontSize: 15 },
  logoutBtn: { marginTop: 40, marginBottom: 20, alignItems: "center" },
  logoutText: { color: COLORS.error, fontSize: 14 },
});
