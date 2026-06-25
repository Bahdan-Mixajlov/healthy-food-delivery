import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from "react-native";
import Text from "../components/CustomText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";

export default function OrderSuccessScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();

  const {
    orderId,
    items,
    totalPrice,
    address,
    paymentType,
    pointsUsed,
    deliveryPrice,
  } = route.params;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Main")}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Заказ №{orderId}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.statusSection}>
          <View style={styles.successBadge}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.mainTitle} weight="bold">
            Заказ оформлен!
          </Text>
          <Text style={styles.subtitle}>
            Спасибо за заказ. Мы уже начали готовить. Примерное время доставки:{" "}
            <Text weight="bold" style={{ color: COLORS.text }}>
              35 мин
            </Text>
          </Text>
        </View>

        <View style={styles.orderCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} weight="bold">
              Состав заказа
            </Text>
            <View style={styles.paidBadge}>
              <Text style={styles.paidText} weight="bold">
                Оплачено
              </Text>
            </View>
          </View>

          {items.map((item: any) => (
            <View key={item.id} style={styles.itemRow}>
              <Image source={{ uri: item.image }} style={styles.itemThumb} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} weight="bold">
                  {item.title}
                </Text>
                <Text style={styles.itemWeight}>{item.weight}</Text>
              </View>
              <View style={styles.itemPriceBlock}>
                <Text style={styles.itemPrice} weight="bold">
                  {item.price.toFixed(2)} BYN
                </Text>
                <Text style={styles.itemQty}>x {item.quantity}</Text>
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Доставка</Text>
            <Text style={styles.summaryValue} weight="bold">
              {deliveryPrice > 0
                ? `${deliveryPrice.toFixed(2)} BYN`
                : "Бесплатно"}
            </Text>
          </View>

          {pointsUsed > 0 && (
            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: COLORS.primary }]}
                weight="bold"
              >
                Оплачено баллами
              </Text>
              <Text
                style={[styles.summaryValue, { color: COLORS.primary }]}
                weight="bold"
              >
                -{pointsUsed.toFixed(2)} BYN
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel} weight="bold">
              Итого
            </Text>
            <Text style={styles.totalValue} weight="bold">
              {totalPrice} BYN
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={22} color={COLORS.primary} />
            <View style={styles.infoTextGroup}>
              <Text style={styles.infoLabel}>Адрес доставки</Text>
              <Text style={styles.infoVal} weight="bold">
                {address}
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, { marginTop: 20 }]}>
            <Ionicons name="card" size={22} color={COLORS.text} />
            <View style={styles.infoTextGroup}>
              <Text style={styles.infoLabel}>Способ оплаты</Text>
              <Text style={styles.infoVal} weight="bold">
                {paymentType}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => navigation.navigate("TrackOrder", { orderId })}
        >
          <Text style={styles.trackBtnText} weight="bold">
            Отслеживать заказ
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.navigate("Main")}
        >
          <Text style={styles.homeBtnText} weight="bold">
            Вернуться на главную
          </Text>
        </TouchableOpacity>
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
    height: 60,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { paddingHorizontal: SIZES.padding },
  statusSection: { alignItems: "center", marginTop: 30, marginBottom: 40 },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    elevation: 5,
  },
  mainTitle: { fontSize: 26, color: COLORS.text, marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: COLORS.textLight,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, color: COLORS.text },
  paidBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  paidText: { fontSize: 11, color: COLORS.primary, textTransform: "uppercase" },
  itemRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  itemThumb: { width: 50, height: 50, borderRadius: 14 },
  itemInfo: { flex: 1, marginLeft: 16 },
  itemTitle: { fontSize: 15, color: COLORS.text },
  itemWeight: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  itemPriceBlock: { alignItems: "flex-end" },
  itemPrice: { fontSize: 15, color: COLORS.text },
  itemQty: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: "#F4F5F7", marginVertical: 12 },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 15, color: COLORS.textLight },
  summaryValue: { fontSize: 15, color: COLORS.text },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    paddingTop: 12,
  },
  totalLabel: { fontSize: 17, color: COLORS.textLight },
  totalValue: { fontSize: 22, color: COLORS.primary },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    marginBottom: 30,
    elevation: 2,
  },
  infoRow: { flexDirection: "row", alignItems: "center" },
  infoTextGroup: { flex: 1, marginLeft: 16 },
  infoLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 2 },
  infoVal: { fontSize: 15, color: COLORS.text },
  trackBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    elevation: 4,
  },
  trackBtnText: { color: "#FFFFFF", fontSize: 18 },
  homeBtn: { height: 50, justifyContent: "center", alignItems: "center" },
  homeBtnText: { color: COLORS.textLight, fontSize: 15 },
});
