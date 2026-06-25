import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function PlanSuccessScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();

  const { planTitle, selectedDays, deliveryTime, address, totalPrice } =
    route.params;

  const nextPayDate = new Date();
  nextPayDate.setDate(nextPayDate.getDate() + 30);
  const formattedDate = nextPayDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate("HomeMain")}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Готово
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.statusSection}>
          <View style={styles.successBadge}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.mainTitle} weight="bold">
            Подписка оформлена
          </Text>
          <Text style={styles.subtitle}>
            Ваш план питания "{planTitle}" успешно оплачен. Мы уже готовим
            первую доставку!
          </Text>
        </View>

        <View style={styles.paramsCard}>
          <Text style={styles.cardTitle} weight="bold">
            Параметры плана
          </Text>

          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const isActive = selectedDays.includes(day);
              return (
                <View
                  key={day}
                  style={[styles.dayCircle, isActive && styles.dayCircleActive]}
                >
                  <Text
                    style={[styles.dayText, isActive && styles.dayTextActive]}
                    weight="bold"
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="sunny" size={22} color={COLORS.primary} />
            <Text style={styles.infoText} weight="bold">
              {deliveryTime}
            </Text>
          </View>

          <View style={[styles.infoRow, { marginTop: 12 }]}>
            <Ionicons name="location" size={22} color={COLORS.primary} />
            <Text style={styles.infoText} weight="bold">
              {address}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Списано</Text>
            <Text style={styles.summaryValue} weight="bold">
              {totalPrice} BYN
            </Text>
          </View>
          <View style={[styles.summaryRow, { marginTop: 14 }]}>
            <Text style={styles.summaryLabel}>Следующая оплата</Text>
            <Text style={styles.nextPayDate} weight="bold">
              {formattedDate}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.mainBtn}
          onPress={() => {
            navigation.navigate("Main", { screen: "Меню" });
          }}
        >
          <Text style={styles.mainBtnText} weight="bold">
            Перейти в меню
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerInfo}>Чек отправлен на вашу почту</Text>
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
    paddingHorizontal: SIZES.padding,
    height: 50,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: 40 },
  statusSection: { alignItems: "center", marginTop: 30, marginBottom: 30 },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  mainTitle: { fontSize: 24, color: COLORS.text, marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: COLORS.textLight,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  paramsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, color: COLORS.text, marginBottom: 20 },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleActive: { backgroundColor: COLORS.primary },
  dayText: { fontSize: 13, color: COLORS.textLight },
  dayTextActive: { color: "#FFFFFF" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F5F7",
    padding: 14,
    borderRadius: 16,
  },
  infoText: { fontSize: 15, color: COLORS.text, marginLeft: 12 },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { fontSize: 15, color: COLORS.textLight },
  summaryValue: { fontSize: 18, color: COLORS.text },
  nextPayDate: { fontSize: 15, color: COLORS.text },
  mainBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  mainBtnText: { color: "#FFFFFF", fontSize: 18 },
  footerInfo: { fontSize: 13, color: COLORS.textLight, textAlign: "center" },
});
