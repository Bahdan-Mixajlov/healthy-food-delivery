import { useState, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import Text from "../components/CustomText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import { useCartStore } from "../store/cartStore";
import { api } from "../api";
import Toast from "../components/Toast";

export default function DishDetailsScreen({ route, navigation }: any) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [quantity, setQuantity] = useState(1);
  const [dish, setDish] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const addItem = useCartStore((state) => state.addItem);

  useEffect(() => {
    fetchDishDetails();
  }, [id]);

  const fetchDishDetails = async () => {
    try {
      const response = await api.get(`/dishes/${id}`);
      setDish(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert("Ошибка", "Не удалось загрузить данные о блюде");
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!dish) return;

    addItem(
      {
        id: dish.id.toString(),
        title: dish.title,
        price: parseFloat(dish.price),
        weight: dish.weight ? `${dish.weight} г` : "420 г",
        image: dish.image,
        calories: Number(dish.calories),
      },
      quantity,
    );

    setToastMessage(`Добавлено в корзину: ${quantity} шт.`);
    setToastVisible(true);
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: dish.image }} style={styles.image} />
          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title} weight="bold">
              {dish.title}
            </Text>
            <Text style={styles.price} weight="bold">
              {+parseFloat(dish.price).toFixed(2)} BYN
            </Text>
          </View>

          <Text style={styles.description}>{dish.description}</Text>

          <Text style={styles.sectionTitle} weight="bold">
            Пищевая ценность
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statVal} weight="bold">
                {dish.calories}
              </Text>
              <Text style={styles.statLabel} weight="medium">
                Ккал
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal} weight="bold">
                {+dish.proteins}г
              </Text>
              <Text style={styles.statLabel} weight="medium">
                Белки
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal} weight="bold">
                {+dish.fats}г
              </Text>
              <Text style={styles.statLabel} weight="medium">
                Жиры
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal} weight="bold">
                {+dish.carbs}г
              </Text>
              <Text style={styles.statLabel} weight="medium">
                Углеводы
              </Text>
            </View>
          </View>

          <View style={styles.weightRow}>
            <Ionicons name="scale-outline" size={18} color={COLORS.textLight} />
            <Text style={styles.weightText} weight="medium">
              Вес: {+dish.weight} г
            </Text>
          </View>

          <View style={styles.allergenBox}>
            <Ionicons name="warning" size={20} color="#E67E22" />
            <Text style={styles.allergenText} weight="bold">
              Проверьте состав перед заказом
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            onPress={() => quantity > 1 && setQuantity(quantity - 1)}
            style={styles.quantityBtn}
          >
            <Text style={styles.quantityBtnText} weight="bold">
              -
            </Text>
          </TouchableOpacity>
          <Text style={styles.quantityValue} weight="bold">
            {quantity}
          </Text>
          <TouchableOpacity
            onPress={() => setQuantity(quantity + 1)}
            style={styles.quantityBtn}
          >
            <Text style={styles.quantityBtnText} weight="bold">
              +
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.mainButton} onPress={handleAddToCart}>
          <Text style={styles.mainButtonText} weight="bold">
            В корзину {+(parseFloat(dish.price) * quantity).toFixed(2)} BYN
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  imageContainer: { width: "100%", height: 380 },
  image: { width: "100%", height: "100%" },
  backButton: {
    position: "absolute",
    left: 20,
    backgroundColor: "#FFFFFF",
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  content: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 32,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: { fontSize: 26, color: COLORS.text, flex: 1, marginRight: 12 },
  price: { fontSize: 22, color: COLORS.primary },
  description: {
    fontSize: 15,
    color: COLORS.textLight,
    lineHeight: 24,
    marginBottom: 32,
  },
  sectionTitle: { fontSize: 20, color: COLORS.text, marginBottom: 16 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.inputBg,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 24,
    marginBottom: 20,
  },
  statItem: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 18, color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  weightRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  weightText: { fontSize: 15, color: COLORS.textLight, marginLeft: 8 },
  allergenBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5EB",
    padding: 16,
    borderRadius: 18,
    marginBottom: 40,
  },
  allergenText: { fontSize: 14, color: "#E67E22", marginLeft: 10 },
  footer: {
    flexDirection: "row",
    paddingHorizontal: SIZES.padding,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 18,
    padding: 6,
    marginRight: 16,
  },
  quantityBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  quantityBtnText: { fontSize: 20, color: COLORS.text },
  quantityValue: { fontSize: 18, marginHorizontal: 16, color: COLORS.text },
  mainButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  mainButtonText: { color: "#FFFFFF", fontSize: 18 },
});
