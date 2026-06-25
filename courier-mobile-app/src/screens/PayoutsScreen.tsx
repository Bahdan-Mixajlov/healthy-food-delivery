import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useCourierAuthStore } from "../store/courierAuthStore";

export default function PayoutsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { courier } = useCourierAuthStore();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const BASE_PER_ORDER = 4.0;
  const PERCENTAGE_RATE = 0.05;

  useEffect(() => {
    fetchPayoutHistory();
  }, []);

  const fetchPayoutHistory = async () => {
    try {
      setIsLoading(true);
      const res = await api.get(
        `/orders/courier/${courier?.id}?filter=delivered`,
      );
      setHistory(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateItemEarnings = (amount: string | number) => {
    return BASE_PER_ORDER + parseFloat(amount.toString()) * PERCENTAGE_RATE;
  };

  const totalEarnings = history.reduce((sum, item) => {
    return sum + calculateItemEarnings(item.total_amount);
  }, 0);

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
          История выплат
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Общая сумма</Text>
            <Text style={styles.totalAmount} weight="bold">
              {totalEarnings.toFixed(2)} BYN
            </Text>
          </View>

          <Text style={styles.sectionTitle} weight="bold">
            ПОСЛЕДНИЕ ОПЕРАЦИИ
          </Text>

          {history.map((item, idx) => {
            const itemEarnings = calculateItemEarnings(item.total_amount);
            return (
              <View key={idx} style={styles.historyItem}>
                <View style={styles.iconCircle}>
                  <FontAwesome6
                    name="arrow-up-from-bracket"
                    size={14}
                    color={COLORS.primary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.itemTitle} weight="bold">
                    Заказ №{item.id}
                  </Text>
                  <Text style={styles.itemDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.itemAmount} weight="bold">
                  + {itemEarnings.toFixed(2)} BYN
                </Text>
              </View>
            );
          })}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "#FFF",
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  headerTitle: { fontSize: 18, color: COLORS.text },
  content: { padding: 20 },
  totalCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    marginBottom: 32,
  },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 8 },
  totalAmount: { color: "#FFF", fontSize: 32, marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.textLight,
    letterSpacing: 1,
    marginLeft: 10,
    marginBottom: 16,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F9F4",
    justifyContent: "center",
    alignItems: "center",
  },
  itemTitle: { fontSize: 15, color: COLORS.text },
  itemDate: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  itemAmount: { fontSize: 15, color: COLORS.primary },
});
