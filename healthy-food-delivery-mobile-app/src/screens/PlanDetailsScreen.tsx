import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import Text from "../components/CustomText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import { api } from "../api";

export default function PlanDetailsScreen({ route, navigation }: any) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState("week");
  const [plan, setPlan] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPlanDetails();
  }, [id]);

  const fetchPlanDetails = async () => {
    try {
      const response = await api.get(`/plans/${id}`);
      setPlan(response.data);
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось загрузить данные о плане");
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const getMenuItems = (planName: string) => {
    const name = planName.toLowerCase().trim();

    if (name.includes("набор массы")) {
      return [
        {
          type: "Завтрак",
          name: "Омлет из 4 яиц с беконом",
          kcal: "520 ккал",
          icon: "sunny",
          color: "#FFF9C4",
        },
        {
          type: "Обед",
          name: "Стейк с бурым рисом",
          kcal: "850 ккал",
          icon: "leaf",
          color: "#E8F5E9",
        },
        {
          type: "Ужин",
          name: "Творог с медом и орехами",
          kcal: "430 ккал",
          icon: "moon",
          color: "#E3F2FD",
        },
      ];
    }

    if (name.includes("баланс")) {
      return [
        {
          type: "Завтрак",
          name: "Шакшука с авокадо и тостами",
          kcal: "420 ккал",
          icon: "sunny",
          color: "#FFF9C4",
        },
        {
          type: "Обед",
          name: "Семга на пару с булгуром",
          kcal: "580 ккал",
          icon: "leaf",
          color: "#E8F5E9",
        },
        {
          type: "Ужин",
          name: "Стейк из индейки с овощами",
          kcal: "390 ккал",
          icon: "moon",
          color: "#E3F2FD",
        },
      ];
    }

    return [
      {
        type: "Завтрак",
        name: "Овсянка с ягодами",
        kcal: "320 ккал",
        icon: "sunny",
        color: "#FFF9C4",
      },
      {
        type: "Обед",
        name: "Куриная грудка с овощами",
        kcal: "450 ккал",
        icon: "leaf",
        color: "#E8F5E9",
      },
      {
        type: "Ужин",
        name: "Рыба с киноа",
        kcal: "430 ккал",
        icon: "moon",
        color: "#E3F2FD",
      },
    ];
  };

  const included = [
    "Завтрак, обед и ужин",
    "Подсчет калорий и БЖУ",
    "Доставка в удобное время",
    "Консультация нутрициолога",
  ];

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!plan) return null;

  const menuItems = getMenuItems(plan.title);
  const basePrice = parseFloat(plan.price);
  const weekPrice = basePrice * 7;
  const monthPrice = basePrice * 30 * 0.93;

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
          {plan.title}
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
        <View style={styles.imageWrapper}>
          <Image source={{ uri: plan.image }} style={styles.mainImage} />
          <View style={styles.kcalBadge}>
            <Ionicons name="flame" size={14} color="#E67E22" />
            <Text style={styles.kcalBadgeText} weight="bold">
              {plan.calories} ккал/день
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.planName} weight="bold">
              План "{plan.title}"
            </Text>
            <View style={styles.daysBadge}>
              <Text style={styles.daysText} weight="bold">
                7 дней
              </Text>
            </View>
          </View>

          <Text style={styles.descText}>{plan.description}</Text>

          <Text style={styles.sectionTitle} weight="bold">
            Пищевая ценность на день
          </Text>
          <View style={styles.nutrientsRow}>
            <View style={styles.nutriItem}>
              <Text style={styles.nutriVal} weight="bold">
                {plan.calories}
              </Text>
              <Text style={styles.nutriLab}>Ккал</Text>
            </View>
            <View style={styles.nutriItem}>
              <Text style={styles.nutriVal} weight="bold">
                {plan.proteins}г
              </Text>
              <Text style={styles.nutriLab}>Белки</Text>
            </View>
            <View style={styles.nutriItem}>
              <Text style={styles.nutriVal} weight="bold">
                {plan.fats}г
              </Text>
              <Text style={styles.nutriLab}>Жиры</Text>
            </View>
            <View style={styles.nutriItem}>
              <Text style={styles.nutriVal} weight="bold">
                {plan.carbs}г
              </Text>
              <Text style={styles.nutriLab}>Углеводы</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle} weight="bold">
            Стоимость подписки
          </Text>

          <TouchableOpacity
            onPress={() => setPeriod("week")}
            style={[
              styles.priceCard,
              period === "week" && styles.priceCardActive,
            ]}
          >
            <View>
              <Text style={styles.pricePeriod} weight="bold">
                1 неделя
              </Text>
              <Text style={styles.pricePerDay}>
                {basePrice.toFixed(0)} BYN/день
              </Text>
            </View>
            <View style={styles.priceRight}>
              <Text
                style={[
                  styles.priceTotal,
                  period === "week" && { color: COLORS.primary },
                ]}
                weight="bold"
              >
                {weekPrice.toFixed(0)} BYN
              </Text>
              <Text style={styles.subLabel}>за период</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPeriod("month")}
            style={[
              styles.priceCard,
              period === "month" && styles.priceCardActive,
            ]}
          >
            <View>
              <Text style={styles.pricePeriod} weight="bold">
                1 месяц
              </Text>
              <Text style={styles.pricePerDay}>
                {(basePrice * 0.93).toFixed(0)} BYN/день
              </Text>
            </View>
            <View style={styles.priceRight}>
              <View style={styles.discountRow}>
                <Text style={styles.oldPrice}>
                  {(basePrice * 30).toFixed(0)}
                </Text>
                <Text
                  style={[
                    styles.priceTotal,
                    period === "month" && { color: COLORS.primary },
                  ]}
                  weight="bold"
                >
                  {monthPrice.toFixed(0)} BYN
                </Text>
              </View>
              <Text style={styles.discountText} weight="bold">
                -7% скидка
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.sectionTitle} weight="bold">
            Примерное меню на день
          </Text>
          {menuItems.map((item, idx) => (
            <View key={idx} style={styles.menuRow}>
              <View
                style={[styles.menuIconBox, { backgroundColor: item.color }]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={COLORS.text}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.menuType} weight="bold">
                  {item.type}
                </Text>
                <Text style={styles.menuName}>{item.name}</Text>
              </View>
              <Text style={styles.menuKcal} weight="medium">
                {item.kcal}
              </Text>
            </View>
          ))}

          <Text style={styles.sectionTitle} weight="bold">
            Что включено
          </Text>
          <View style={styles.includedWrapper}>
            {included.map((text, idx) => (
              <View
                key={idx}
                style={[
                  styles.checkRow,
                  idx === included.length - 1 && { marginBottom: 0 },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={styles.checkText}>{text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() =>
              navigation.navigate("PlanConfig", { planId: plan.id })
            }
          >
            <Text style={styles.submitBtnText} weight="bold">
              Выбрать план
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    height: 50,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { paddingBottom: 40 },
  imageWrapper: {
    marginHorizontal: SIZES.padding,
    height: 240,
    borderRadius: 28,
    overflow: "hidden",
    marginTop: 10,
  },
  mainImage: { width: "100%", height: "100%" },
  kcalBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  kcalBadgeText: { fontSize: 13, marginLeft: 6, color: COLORS.text },
  content: { paddingHorizontal: SIZES.padding, marginTop: 24 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planName: { fontSize: 24, color: COLORS.text },
  daysBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  daysText: { color: COLORS.primary, fontSize: 13 },
  descText: {
    fontSize: 15,
    color: COLORS.textLight,
    lineHeight: 22,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 20,
    color: COLORS.text,
    marginTop: 36,
    marginBottom: 18,
  },
  nutrientsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.inputBg,
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderRadius: 24,
  },
  nutriItem: { alignItems: "center", flex: 1 },
  nutriVal: { fontSize: 18, color: COLORS.text },
  nutriLab: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  priceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    padding: 18,
    borderRadius: 24,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  priceCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.background,
  },
  pricePeriod: { fontSize: 17, color: COLORS.text },
  pricePerDay: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  priceRight: { alignItems: "flex-end" },
  priceTotal: { fontSize: 18 },
  discountRow: { flexDirection: "row", alignItems: "center" },
  oldPrice: {
    fontSize: 14,
    color: COLORS.textLight,
    textDecorationLine: "line-through",
    marginRight: 8,
  },
  subLabel: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  discountText: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  menuRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  menuIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  menuType: { fontSize: 15, color: COLORS.text },
  menuName: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  menuKcal: { fontSize: 14, color: COLORS.text },
  includedWrapper: {
    backgroundColor: COLORS.inputBg,
    padding: 24,
    borderRadius: 24,
    marginBottom: 10,
  },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  checkText: { fontSize: 15, color: COLORS.text, marginLeft: 12 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    marginBottom: 10,
  },
  submitBtnText: { color: "#fff", fontSize: 18 },
});
