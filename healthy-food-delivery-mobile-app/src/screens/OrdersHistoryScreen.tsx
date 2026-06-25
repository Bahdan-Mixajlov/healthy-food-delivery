import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";
import Toast from "../components/Toast";
import Skeleton from "../components/Skeleton";

const OrderSkeleton = () => (
  <View style={styles.orderCard}>
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 15,
      }}
    >
      <View>
        <Skeleton
          width={120}
          height={20}
          borderRadius={6}
          style={{ marginBottom: 8 }}
        />
        <Skeleton width={80} height={14} borderRadius={4} />
      </View>
      <Skeleton width={90} height={20} borderRadius={6} />
    </View>
    <View style={{ flexDirection: "row", marginBottom: 20 }}>
      <Skeleton
        width={52}
        height={52}
        borderRadius={14}
        style={{ marginRight: 12 }}
      />
      <Skeleton
        width={52}
        height={52}
        borderRadius={14}
        style={{ marginRight: 12 }}
      />
      <Skeleton width={52} height={52} borderRadius={14} />
    </View>
    <Skeleton width="100%" height={45} borderRadius={14} />
  </View>
);

export default function OrdersHistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);
  const addItem = useCartStore((state) => state.addItem);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (isFocused && user) fetchOrders();
  }, [isFocused, user]);

  const fetchOrders = async () => {
    try {
      const response = await api.get(`/orders/client/${user?.id}`);
      setOrders(response.data);
    } catch (error) {
      console.error("Ошибка загрузки заказов:", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, []);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "created":
        return { text: "Принят", color: "#E67E22", icon: "clock" };
      case "cooking":
        return { text: "Готовится", color: "#3498DB", icon: "fire-burner" };
      case "on_way":
        return { text: "В пути", color: "#F1C40F", icon: "motorcycle" };
      case "delivered":
        return {
          text: "Доставлен",
          color: COLORS.primary,
          icon: "circle-check",
        };
      case "cancelled":
        return { text: "Отменен", color: COLORS.error, icon: "circle-xmark" };
      default:
        return { text: "Обработка", color: "#95A5A6", icon: "ellipsis" };
    }
  };

  const handleRepeatOrder = async (order: any) => {
    setIsLoading(true);
    try {
      const response = await api.get(`/orders/${order.id}`);
      const itemsFromOrder = response.data.items;

      const updatedItems = await Promise.all(
        itemsFromOrder.map(async (item: any) => {
          try {
            const dishRes = await api.get(`/dishes/${item.id}`);
            return {
              ...item,
              calories: dishRes.data.calories,
              weight: dishRes.data.weight,
            };
          } catch (err) {
            return item;
          }
        }),
      );

      updatedItems.forEach((item: any) => {
        addItem(
          {
            id: item.id.toString(),
            title: item.title,
            price: parseFloat(item.price),
            image: item.image,
            weight: item.weight ? `${item.weight} г` : "350 г",
            calories: Number(item.calories || 0),
          },
          item.quantity || 1,
        );
      });

      setToastMessage("Заказ добавлен в корзину");
      setToastVisible(true);

      setTimeout(() => {
        navigation.navigate("Корзина");
      }, 1000);
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось повторить заказ");
    } finally {
      setIsLoading(false);
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
          Мои заказы
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.scrollContent}>
          <OrderSkeleton />
          <OrderSkeleton />
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
              <View style={styles.emptyIconBg}>
                <FontAwesome6
                  name="box-open"
                  size={50}
                  color={COLORS.inputBg}
                />
              </View>
              <Text style={styles.emptyText} weight="medium">
                У вас еще нет заказов
              </Text>
              <TouchableOpacity
                style={styles.goToMenuBtn}
                onPress={() => navigation.navigate("Меню")}
              >
                <Text style={styles.goToMenuText} weight="bold">
                  Сделать первый заказ
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            orders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              return (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.navigate("TrackOrder", { orderId: order.id })
                  }
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.orderNumber} weight="bold">
                        Заказ №{order.id}
                      </Text>
                      <Text style={styles.orderDate}>
                        {new Date(order.date).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>

                    <View style={styles.priceRow}>
                      <Text style={styles.orderTotal} weight="bold">
                        {parseFloat(order.total).toFixed(2)} BYN
                      </Text>
                      <FontAwesome6
                        name="chevron-right"
                        size={14}
                        color={COLORS.textLight}
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  </View>

                  <View style={styles.statusRow}>
                    <FontAwesome6
                      name={statusInfo.icon}
                      size={14}
                      color={statusInfo.color}
                      solid
                    />
                    <Text
                      style={[styles.statusText, { color: statusInfo.color }]}
                      weight="bold"
                    >
                      {statusInfo.text}
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.imagesScroll}
                  >
                    {order.items.map((img: string, idx: number) => (
                      <Image
                        key={idx}
                        source={{ uri: img }}
                        style={styles.itemImage}
                      />
                    ))}
                  </ScrollView>

                  <View style={styles.divider} />

                  <View style={styles.actionRow}>
                    {order.status !== "delivered" &&
                    order.status !== "cancelled" ? (
                      <TouchableOpacity
                        style={styles.trackBtn}
                        onPress={() =>
                          navigation.navigate("TrackOrder", {
                            orderId: order.id,
                          })
                        }
                      >
                        <Text style={styles.trackBtnText} weight="bold">
                          Отследить заказ
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.repeatBtn}
                        onPress={() => handleRepeatOrder(order)}
                      >
                        <FontAwesome6
                          name="rotate-right"
                          size={14}
                          color={COLORS.text}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.repeatBtnText} weight="bold">
                          Повторить
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.helpBtn}
                      onPress={() => navigation.navigate("Support")}
                    >
                      <FontAwesome6
                        name="circle-question"
                        size={18}
                        color={COLORS.textLight}
                      />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
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
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: 40,
    paddingTop: 10,
  },
  emptyContainer: { alignItems: "center", marginTop: 80 },
  emptyIconBg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyText: { fontSize: 16, color: COLORS.textLight, textAlign: "center" },
  goToMenuBtn: { marginTop: 20, padding: 12 },
  goToMenuText: { color: COLORS.primary, fontSize: 16 },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
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
    alignItems: "flex-start",
    marginBottom: 14,
  },
  orderNumber: { fontSize: 16, color: COLORS.text },
  orderDate: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  orderTotal: { fontSize: 16, color: COLORS.text },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  statusText: { fontSize: 13, marginLeft: 8 },
  imagesScroll: { flexDirection: "row", marginBottom: 18 },
  itemImage: {
    width: 56,
    height: 52,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: "#F4F5F7",
  },
  divider: { height: 1, backgroundColor: "#F4F5F7", marginBottom: 16 },
  actionRow: { flexDirection: "row", alignItems: "center" },
  trackBtn: {
    flex: 1,
    backgroundColor: "#E8F5E9",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(33, 192, 99, 0.2)",
  },
  trackBtnText: { color: COLORS.primary, fontSize: 14 },
  repeatBtn: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 10,
    flexDirection: "row",
    justifyContent: "center",
  },
  repeatBtnText: { color: COLORS.text, fontSize: 14 },
  helpBtn: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
});
