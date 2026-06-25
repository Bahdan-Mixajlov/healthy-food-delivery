import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { COLORS } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";
import Skeleton from "../components/Skeleton";
import Toast from "../components/Toast";

const SubSkeleton = () => (
  <View style={styles.subCard}>
    <View
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}
    >
      <Skeleton width={64} height={64} borderRadius={20} />
      <View style={{ marginLeft: 16, flex: 1 }}>
        <Skeleton
          width="70%"
          height={20}
          borderRadius={6}
          style={{ marginBottom: 8 }}
        />
        <Skeleton width="40%" height={16} borderRadius={4} />
      </View>
    </View>
    <Skeleton width="100%" height={80} borderRadius={20} />
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 20,
      }}
    >
      <Skeleton width={100} height={30} borderRadius={6} />
      <Skeleton width={120} height={40} borderRadius={12} />
    </View>
  </View>
);

export default function SubscriptionsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user } = useAuthStore();

  const [subs, setSubs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (isFocused && user) fetchSubs();
  }, [isFocused, user]);

  const fetchSubs = async () => {
    try {
      const res = await api.get(`/subscriptions/client/${user?.id}`);
      setSubs(res.data);
    } catch (e) {
      console.error("Ошибка при получении подписок:", e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSubs();
  }, []);

  const confirmCancel = (sub: any) => {
    const subId = sub.id_subscription || sub.id;
    const message = `Вы действительно хотите отменить план "${sub.plan_title}"?`;

    if (Platform.OS === "web") {
      if (window.confirm(message)) cancelSubscription(subId);
    } else {
      Alert.alert("Отмена подписки", message, [
        { text: "Назад", style: "cancel" },
        {
          text: "Да, отменить",
          style: "destructive",
          onPress: () => cancelSubscription(subId),
        },
      ]);
    }
  };

  const cancelSubscription = async (id: number | string) => {
    try {
      await api.delete(`/subscriptions/${id}`);

      setSubs((prev) => prev.filter((s) => (s.id_subscription || s.id) !== id));

      setToastMessage("Подписка отменена");
      setToastVisible(true);
    } catch (e) {
      const errorMsg = "Не удалось отменить подписку";
      Platform.OS === "web"
        ? window.alert(errorMsg)
        : Alert.alert("Ошибка", errorMsg);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Мои подписки
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.scrollContent}>
          <SubSkeleton />
          <SubSkeleton />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {subs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome6
                  name="calendar-xmark"
                  size={50}
                  color={COLORS.inputBg}
                  solid
                />
              </View>
              <Text style={styles.emptyTitle} weight="bold">
                Активных планов нет
              </Text>
              <Text style={styles.emptyText} weight="medium">
                Выберите подходящий рацион питания, чтобы экономить время на
                готовке
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => navigation.navigate("Главная")}
              >
                <Text style={styles.exploreBtnText} weight="bold">
                  Посмотреть рационы
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            subs.map((item) => (
              <View
                key={item.id_subscription || item.id}
                style={styles.subCard}
              >
                <View style={styles.cardHeader}>
                  <Image source={{ uri: item.image }} style={styles.planImg} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text weight="bold" style={styles.planTitle}>
                      {item.plan_title}
                    </Text>
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>АКТИВНА</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoContainer}>
                  <View style={styles.infoRow}>
                    <FontAwesome6
                      name="calendar-days"
                      size={16}
                      color={COLORS.primary}
                      solid
                    />
                    <Text style={styles.infoText} weight="medium">
                      Дни: {item.delivery_days}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome6
                      name="clock"
                      size={16}
                      color={COLORS.primary}
                      solid
                    />
                    <Text style={styles.infoText} weight="medium">
                      Время: {item.delivery_time}
                    </Text>
                  </View>
                </View>

                <View style={styles.footer}>
                  <View>
                    <Text style={styles.dateLabel}>Действует до:</Text>
                    <Text style={styles.dateText} weight="bold">
                      {new Date(item.end_date).toLocaleDateString("ru-RU")}
                    </Text>
                  </View>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.supportBtn}
                      onPress={() => navigation.navigate("Support")}
                    >
                      <FontAwesome6
                        name="headset"
                        size={18}
                        color={COLORS.text}
                        solid
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => confirmCancel(item)}
                    >
                      <Text style={styles.cancelBtnText} weight="bold">
                        Отменить
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
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
    height: 60,
    marginBottom: 10,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { paddingHorizontal: 20 },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    elevation: 2,
  },
  emptyTitle: { fontSize: 20, color: COLORS.text, marginBottom: 12 },
  emptyText: {
    textAlign: "center",
    color: COLORS.textLight,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 32,
  },
  exploreBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 22,
    elevation: 5,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  exploreBtnText: { color: "#FFF", fontSize: 16 },
  subCard: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  planImg: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#F4F5F7",
  },
  planTitle: { fontSize: 17, color: COLORS.text },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },
  statusText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  infoContainer: {
    backgroundColor: "#F8F9FB",
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  infoRow: { flexDirection: "row", alignItems: "center" },
  infoText: { fontSize: 14, color: COLORS.text, marginLeft: 12 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
  },
  dateLabel: { fontSize: 11, color: COLORS.textLight, marginBottom: 2 },
  dateText: { fontSize: 14, color: COLORS.text },
  actionButtons: { flexDirection: "row", alignItems: "center" },
  supportBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  cancelBtn: {
    backgroundColor: "#FFF1F1",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFDADA",
  },
  cancelBtnText: { fontSize: 13, color: COLORS.error },
});
