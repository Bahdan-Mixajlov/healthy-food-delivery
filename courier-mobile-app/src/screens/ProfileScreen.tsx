import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import Text from "../components/CustomText";
import { useCourierAuthStore } from "../store/courierAuthStore";
import { api } from "../api";

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { courier, logout } = useCourierAuthStore();
  const [stats, setStats] = useState({ completed: 0, earnings: 0 });

  const BASE_PER_ORDER = 4.0;
  const PERCENTAGE_RATE = 0.05;

  useEffect(() => {
    fetchCourierStats();
  }, []);

  const fetchCourierStats = async () => {
    try {
      const res = await api.get(
        `/orders/courier/${courier?.id}?filter=delivered`,
      );
      const orders = res.data;

      const totalEarnings = orders.reduce((sum: number, order: any) => {
        const orderPay =
          BASE_PER_ORDER + parseFloat(order.total_amount) * PERCENTAGE_RATE;
        return sum + orderPay;
      }, 0);

      setStats({
        completed: orders.length,
        earnings: totalEarnings,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Завершить рабочую смену и выйти?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Мой профиль
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <FontAwesome6
              name="user"
              size={40}
              color={COLORS.textLight}
              solid
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} weight="bold">
              {courier?.firstName} {courier?.lastName || ""}
            </Text>
            <Text style={styles.userPhone}>{courier?.phone}</Text>
            <View style={styles.ratingBadge}>
              <FontAwesome6 name="star" size={12} color="#F1C40F" solid />
              <Text style={styles.ratingText} weight="bold">
                {" "}
                4.98
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          СТАТИСТИКА
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal} weight="bold">
              {stats.completed}
            </Text>
            <Text style={styles.statLabel}>Заказов</Text>
          </View>
          <View style={styles.statCard}>
            <Text
              style={[styles.statVal, { color: COLORS.primary }]}
              weight="bold"
            >
              {stats.earnings.toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>BYN заработано</Text>
          </View>
        </View>

        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() =>
              navigation.navigate("Chat", {
                orderId: "HELP",
                courierName: "Диспетчер",
                clientPhone: "+375291234567",
              })
            }
          >
            <View style={styles.menuIconBox}>
              <FontAwesome6
                name="headset"
                size={16}
                color={COLORS.text}
                solid
              />
            </View>
            <Text style={styles.menuText} weight="bold">
              Поддержка
            </Text>
            <FontAwesome6
              name="chevron-right"
              size={14}
              color={COLORS.textLight}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("Payouts")}
          >
            <View style={styles.menuIconBox}>
              <FontAwesome6
                name="clock-rotate-left"
                size={16}
                color={COLORS.text}
                solid
              />
            </View>
            <Text style={styles.menuText} weight="bold">
              История выплат
            </Text>
            <FontAwesome6
              name="chevron-right"
              size={14}
              color={COLORS.textLight}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("Settings")}
          >
            <View style={styles.menuIconBox}>
              <FontAwesome6 name="gear" size={16} color={COLORS.text} solid />
            </View>
            <Text style={styles.menuText} weight="bold">
              Настройки
            </Text>
            <FontAwesome6
              name="chevron-right"
              size={14}
              color={COLORS.textLight}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText} weight="bold">
            Выйти из аккаунта
          </Text>
        </TouchableOpacity>

        <Text style={styles.version}>Версия приложения 1.0.2 (Build 5)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  headerTitle: { fontSize: 18, color: COLORS.text },
  content: { padding: 20 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 24,
    borderRadius: 28,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 32,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: { marginLeft: 20, flex: 1 },
  userName: { fontSize: 20, color: COLORS.text },
  userPhone: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF9E7",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  ratingText: { color: "#F1C40F", fontSize: 12 },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.textLight,
    letterSpacing: 1,
    marginLeft: 10,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  statCard: {
    backgroundColor: "#FFF",
    width: "48%",
    padding: 20,
    borderRadius: 24,
    elevation: 2,
    alignItems: "center",
  },
  statVal: { fontSize: 24, color: COLORS.text },
  statLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
    textAlign: "center",
  },
  menuContainer: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    paddingHorizontal: 16,
    marginBottom: 40,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuText: { flex: 1, fontSize: 15, color: COLORS.text },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FFEBEB",
  },
  logoutText: { color: COLORS.error, fontSize: 16, marginLeft: 10 },
  version: {
    textAlign: "center",
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: 24,
    opacity: 0.6,
  },
});
