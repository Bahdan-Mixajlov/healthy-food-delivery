import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import Text from "../components/CustomText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function PlanConfigScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allIngredients, setAllIngredients] = useState<any[]>([]);

  const [selectedDays, setSelectedDays] = useState([
    "Пн",
    "Вт",
    "Ср",
    "Чт",
    "Пт",
  ]);
  const [time, setTime] = useState("morning");
  const [excluded, setExcluded] = useState<string[]>(["Сахар"]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [modalType, setModalType] = useState<
    "address" | "payment" | "ingredient" | null
  >(null);

  useEffect(() => {
    fetchAllData();
  }, [planId]);

  const fetchAllData = async () => {
    try {
      const [planRes, addrRes, payRes, ingRes] = await Promise.all([
        api.get(`/plans/${planId}`),
        api.get(`/addresses/${user?.id}`),
        api.get(`/payments/${user?.id}`),
        api.get(`/ingredients`),
      ]);
      setPlan(planRes.data);
      setAddresses(addrRes.data);
      setPayments(payRes.data);
      setAllIngredients(ingRes.data);
      if (addrRes.data.length > 0) setSelectedAddress(addrRes.data[0]);
      if (payRes.data.length > 0) setSelectedPayment(payRes.data[0]);
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось загрузить данные");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handlePaySubscription = async () => {
    if (!selectedAddress) {
      Alert.alert("Ошибка", "Выберите адрес доставки");
      return;
    }

    const dailyPrice = parseFloat(plan.price);
    const totalPriceCalc = dailyPrice * selectedDays.length;

    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 30);

    setIsSubmitting(true);
    try {
      const response = await api.post("/subscriptions", {
        clientId: user?.id,
        planId: planId,
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        deliveryTime: time === "morning" ? "08:00 - 11:00" : "18:00 - 21:00",
        deliveryDays: selectedDays.join(","),
        totalPrice: totalPriceCalc,
      });

      if (response.data.newTotalPoints !== undefined) {
        await updateUser({ bonusPoints: response.data.newTotalPoints });
      }

      navigation.navigate("PlanSuccess", {
        planTitle: plan.title,
        selectedDays: selectedDays,
        deliveryTime:
          time === "morning" ? "Утро (08:00 - 11:00)" : "Вечер (18:00 - 21:00)",
        address: `${selectedAddress.street}, д. ${selectedAddress.building}`,
        totalPrice: totalPriceCalc.toFixed(0),
      });
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось оформить подписку");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const dailyPrice = parseFloat(plan.price);
  const totalPrice = dailyPrice * selectedDays.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Настройка плана
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Text style={styles.sectionTitle} weight="bold">
          Дни доставки
        </Text>
        <View style={styles.daysRow}>
          {DAYS.map((day, idx) => {
            const isActive = selectedDays.includes(day);
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.dayCircle, isActive && styles.dayCircleActive]}
                onPress={() => toggleDay(day)}
              >
                <Text
                  style={[styles.dayText, isActive && styles.dayTextActive]}
                  weight="bold"
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          Время доставки
        </Text>
        <View style={styles.timeRow}>
          <TouchableOpacity
            style={[
              styles.timeCard,
              time === "morning" && styles.timeCardActive,
            ]}
            onPress={() => setTime("morning")}
          >
            <Ionicons
              name="sunny-outline"
              size={22}
              color={time === "morning" ? COLORS.primary : COLORS.textLight}
            />
            <Text
              style={[
                styles.timeTitle,
                time === "morning" && { color: COLORS.primary },
              ]}
              weight="bold"
            >
              Утро
            </Text>
            <Text style={styles.timeDesc}>08:00 - 11:00</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.timeCard,
              time === "evening" && styles.timeCardActive,
            ]}
            onPress={() => setTime("evening")}
          >
            <Ionicons
              name="moon-outline"
              size={22}
              color={time === "evening" ? COLORS.primary : COLORS.textLight}
            />
            <Text
              style={[
                styles.timeTitle,
                time === "evening" && { color: COLORS.primary },
              ]}
              weight="bold"
            >
              Вечер
            </Text>
            <Text style={styles.timeDesc}>18:00 - 21:00</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          Исключить ингредиенты
        </Text>
        <Text style={styles.subText}>Мы уберем блюда с этими продуктами</Text>
        <View style={styles.tagsContainer}>
          {excluded.map((item, idx) => (
            <View key={idx} style={styles.tag}>
              <Text style={styles.tagText} weight="medium">
                {item}
              </Text>
              <TouchableOpacity
                onPress={() => setExcluded(excluded.filter((i) => i !== item))}
              >
                <Ionicons
                  name="close"
                  size={16}
                  color={COLORS.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addTagBtn}
            onPress={() => setModalType("ingredient")}
          >
            <Text style={styles.addTagText} weight="bold">
              + Добавить
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => setModalType("address")}
        >
          <Ionicons name="location-sharp" size={22} color={COLORS.primary} />
          <Text style={styles.infoText} weight="medium">
            {selectedAddress
              ? `${selectedAddress.street}, д. ${selectedAddress.building}`
              : "Добавить адрес"}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
        </TouchableOpacity>

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Итого за {selectedDays.length} дн.
            </Text>
            <Text style={styles.summaryValue} weight="bold">
              {totalPrice.toFixed(0)} BYN
            </Text>
          </View>
          <TouchableOpacity
            style={styles.summaryRow}
            onPress={() => setModalType("payment")}
          >
            <Text style={styles.summaryLabel}>Способ оплаты</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={
                  selectedPayment?.type === "apple_pay" ? "logo-apple" : "card"
                }
                size={18}
                color={COLORS.text}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.summaryValue} weight="bold">
                {selectedPayment ? selectedPayment.name : "Выбрать"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={COLORS.textLight}
                style={{ marginLeft: 8 }}
              />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
          onPress={handlePaySubscription}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText} weight="bold">
              Оплатить {totalPrice.toFixed(0)} BYN
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={modalType !== null} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalType(null)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle} weight="bold">
              {modalType === "address"
                ? "Выберите адрес"
                : modalType === "payment"
                  ? "Способ оплаты"
                  : "Добавить исключение"}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {modalType === "address" &&
                addresses.map((a) => (
                  <TouchableOpacity
                    key={a.id_address}
                    style={styles.modalItem}
                    onPress={() => {
                      setSelectedAddress(a);
                      setModalType(null);
                    }}
                  >
                    <Text weight="semibold">
                      {a.street}, {a.building}
                    </Text>
                  </TouchableOpacity>
                ))}
              {modalType === "payment" &&
                payments.map((p) => (
                  <TouchableOpacity
                    key={p.id_payment}
                    style={styles.modalItem}
                    onPress={() => {
                      setSelectedPayment(p);
                      setModalType(null);
                    }}
                  >
                    <Text weight="semibold">
                      {p.name} {p.last4 ? `**${p.last4}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              {modalType === "ingredient" &&
                allIngredients
                  .filter((i) => !excluded.includes(i.name))
                  .map((i) => (
                    <TouchableOpacity
                      key={i.id_ingredient}
                      style={styles.modalItem}
                      onPress={() => {
                        setExcluded([...excluded, i.name]);
                        setModalType(null);
                      }}
                    >
                      <Text weight="semibold">{i.name}</Text>
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SIZES.padding,
    height: 60,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 18,
    color: COLORS.text,
    marginTop: 32,
    marginBottom: 16,
  },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleActive: { backgroundColor: COLORS.primary, elevation: 3 },
  dayText: { fontSize: 14, color: COLORS.textLight },
  dayTextActive: { color: "#FFFFFF" },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  timeCard: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    padding: 18,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    marginHorizontal: 5,
  },
  timeCardActive: { backgroundColor: "#F0F9F4", borderColor: COLORS.primary },
  timeTitle: { fontSize: 16, color: COLORS.text, marginTop: 10 },
  timeDesc: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  subText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 16,
    marginTop: -10,
  },
  tagsContainer: { flexDirection: "row", flexWrap: "wrap" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
  },
  tagText: { fontSize: 14, color: COLORS.text },
  addTagBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    backgroundColor: "rgba(33, 192, 99, 0.05)",
    marginBottom: 10,
  },
  addTagText: { fontSize: 14, color: COLORS.primary },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    padding: 18,
    borderRadius: 24,
    marginTop: 32,
  },
  infoText: { flex: 1, fontSize: 15, color: COLORS.text, marginLeft: 12 },
  summaryBox: {
    marginTop: 36,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.inputBg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  summaryLabel: { fontSize: 15, color: COLORS.textLight },
  summaryValue: { fontSize: 18, color: COLORS.text },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    elevation: 4,
  },
  submitBtnText: { color: "#fff", fontSize: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    maxHeight: "50%",
  },
  modalTitle: { fontSize: 20, marginBottom: 20, color: COLORS.text },
  modalItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
});
