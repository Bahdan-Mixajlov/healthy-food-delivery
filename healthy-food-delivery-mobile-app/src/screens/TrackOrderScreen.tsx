import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  RefreshControl,
  Platform,
  Animated,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import OrderStatusTimeline from "../components/OrderStatusTimeline";
import OrderMap from "../components/OrderMap";
import Skeleton from "../components/Skeleton";

const TrackOrderSkeleton = () => (
  <View style={styles.container}>
    <Skeleton width="100%" height={320} borderRadius={0} />
    <View style={styles.contentCard}>
      <Skeleton
        width="100%"
        height={100}
        borderRadius={28}
        style={{ marginBottom: 16 }}
      />
      <Skeleton
        width="100%"
        height={80}
        borderRadius={28}
        style={{ marginBottom: 32 }}
      />
      <Skeleton
        width={150}
        height={20}
        borderRadius={6}
        style={{ marginBottom: 12 }}
      />
      <Skeleton width="100%" height={150} borderRadius={28} />
    </View>
  </View>
);

export default function TrackOrderScreen({ route, navigation }: any) {
  const orderId = route?.params?.orderId || 1;
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);

    if (toastTimeout.current) clearTimeout(toastTimeout.current);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslateY, {
        toValue: 0,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeout.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, 2500);
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const response = await api.get(`/orders/${orderId}`);
      setOrder(response.data);
    } catch (e) {
      console.error(e);
      Alert.alert("Ошибка", "Не удалось загрузить данные заказа");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrderDetails();
  }, []);

  const handleCallCourier = () => {
    const phoneNumber = order?.courier_phone;
    if (!phoneNumber) {
      showToast("Курьер еще не назначен");
      return;
    }

    const cleanPhone = phoneNumber.replace(/[^\d+]/g, "");
    const url = `tel:${cleanPhone}`;

    if (Platform.OS === "web") {
      Linking.openURL(url);
    } else {
      Alert.alert("Звонок", `Позвонить курьеру?\n${phoneNumber}`, [
        { text: "Отмена", style: "cancel" },
        { text: "Позвонить", onPress: () => Linking.openURL(url) },
      ]);
    }
  };

  const handleCancelOrder = () => {
    const title = "Отмена заказа";
    const message = "Вы уверены, что хотите отменить заказ?";

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        processCancel();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: "Назад", style: "cancel" },
      {
        text: "Да, отменить",
        style: "destructive",
        onPress: () => processCancel(),
      },
    ]);
  };

  const processCancel = async () => {
    try {
      setIsLoading(true);
      await api.patch(`/orders/${orderId}/status`, { status: "cancelled" });

      showToast("Заказ отменен");
      fetchOrderDetails();
    } catch (e) {
      console.error(e);
      if (Platform.OS === "web") {
        window.alert("Ошибка: Не удалось отменить заказ");
      } else {
        Alert.alert("Ошибка", "Не удалось отменить заказ");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <TrackOrderSkeleton />;
  if (!order) return null;

  let displayName = "Подбираем курьера...";

  if (order.status === "cancelled") {
    displayName = "Заказ был отменен";
  } else if (order.courier_name) {
    displayName = order.courier_name;
  }

  const isOrderCompleted =
    order.status === "delivered" || order.status === "cancelled";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Заказ №{orderId}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate("Support")}>
          <Text style={styles.helpText} weight="bold">
            Помощь
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={{
          paddingBottom: isOrderCompleted
            ? insets.bottom + 40
            : insets.bottom + 120,
        }}
      >
        {isOrderCompleted ? (
          <View
            style={[
              styles.completedBanner,
              order.status === "cancelled" && styles.cancelledBanner,
            ]}
          >
            <FontAwesome6
              name={
                order.status === "delivered" ? "circle-check" : "circle-xmark"
              }
              size={56}
              color={
                order.status === "delivered" ? COLORS.primary : COLORS.error
              }
              solid
            />
            <Text style={styles.completedTitle} weight="bold">
              {order.status === "delivered"
                ? "Заказ доставлен!"
                : "Заказ отменен"}
            </Text>
            <Text style={styles.completedSubtitle}>
              {order.status === "delivered"
                ? "Надеемся, вам всё понравилось. Приятного аппетита!"
                : "К сожалению, этот заказ был отменен."}
            </Text>
          </View>
        ) : (
          <View style={styles.mapContainer}>
            <OrderMap />
          </View>
        )}

        <View style={styles.contentCard}>
          <View style={styles.statusCard}>
            <OrderStatusTimeline currentStatus={order.status} />
          </View>

          <View style={styles.courierRow}>
            <View style={styles.courierAvatar}>
              <FontAwesome6
                name={
                  order.status === "cancelled" && !order.courier_name
                    ? "ban"
                    : "user"
                }
                size={20}
                color={
                  order.status === "cancelled" ? COLORS.error : COLORS.textLight
                }
                solid
              />
            </View>
            <View style={styles.courierInfo}>
              <Text style={styles.courierName} weight="bold">
                {displayName}
              </Text>
              {order.courier_name && (
                <View style={styles.ratingRow}>
                  <FontAwesome6 name="star" size={12} color="#F1C40F" solid />
                  <Text style={styles.ratingText} weight="bold">
                    {" "}
                    4.9
                  </Text>
                </View>
              )}
            </View>

            {!isOrderCompleted && (
              <TouchableOpacity
                style={[
                  styles.callBtn,
                  !order.courier_phone && { backgroundColor: COLORS.textLight },
                ]}
                onPress={handleCallCourier}
              >
                <FontAwesome6 name="phone" size={18} color="#FFF" solid />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel} weight="bold">
              СОСТАВ ЗАКАЗА
            </Text>
          </View>

          <View style={styles.itemsBox}>
            {order.items?.map((item: any, idx: number) => (
              <View key={idx}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName} weight="bold">
                    {item.title}
                  </Text>
                  <View style={styles.itemPriceRow}>
                    <Text style={styles.itemQty}>{item.quantity} шт.</Text>
                    <Text style={styles.itemPrice} weight="bold">
                      {parseFloat(item.price).toFixed(2)} BYN
                    </Text>
                  </View>
                </View>
                {idx < order.items.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel} weight="bold">
              ДЕТАЛИ ДОСТАВКИ
            </Text>
          </View>

          <View style={styles.deliveryBox}>
            <View style={styles.deliveryRow}>
              <FontAwesome6
                name="location-dot"
                size={18}
                color={COLORS.primary}
                solid
              />
              <Text style={styles.deliveryText} weight="bold">
                {order.street}, {order.building}
              </Text>
            </View>
          </View>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel} weight="bold">
              Итого
            </Text>
            <Text style={styles.totalValue} weight="bold">
              {parseFloat(order.total_amount).toFixed(2)} BYN
            </Text>
          </View>

          {order.status === "created" && (
            <TouchableOpacity
              style={styles.cancelOrderBtn}
              onPress={handleCancelOrder}
            >
              <Text style={styles.cancelOrderText} weight="bold">
                Отменить заказ
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Animated.View
        style={[
          styles.toastContainer,
          {
            bottom: isOrderCompleted ? insets.bottom + 20 : insets.bottom + 90,
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
          },
        ]}
        pointerEvents="none"
      >
        <FontAwesome6 name="circle-info" size={16} color="#FFF" />
        <Text style={styles.toastText} weight="bold">
          {toastMessage}
        </Text>
      </Animated.View>

      {!isOrderCompleted && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.mainBtn,
              !order?.courier_name && { backgroundColor: COLORS.textLight },
            ]}
            activeOpacity={0.8}
            onPress={() => {
              if (order?.courier_name) {
                navigation.navigate("Chat", {
                  courierName: order.courier_name,
                  orderId: orderId,
                  courierPhone: order.courier_phone,
                });
              } else {
                showToast("Курьер еще не назначен");
              }
            }}
          >
            <FontAwesome6
              name="comment-dots"
              size={18}
              color="#FFF"
              solid
              style={{ marginRight: 12 }}
            />
            <Text style={styles.mainBtnText} weight="bold">
              Чат с курьером
            </Text>
          </TouchableOpacity>
        </View>
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
    height: 100,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
    zIndex: 10,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  helpText: { color: COLORS.primary, fontSize: 14 },

  mapContainer: { height: 320, width: "100%", backgroundColor: "#EEE" },
  completedBanner: {
    height: 280,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  cancelledBanner: {
    backgroundColor: "#FFEBEB",
  },
  completedTitle: {
    fontSize: 22,
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  completedSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: "center",
    lineHeight: 20,
  },
  contentCard: { paddingHorizontal: SIZES.padding, paddingTop: 24 },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
  },
  courierRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 28,
    marginBottom: 32,
    elevation: 2,
  },
  courierAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  courierInfo: { flex: 1, marginLeft: 16 },
  courierName: { fontSize: 17, color: COLORS.text },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  ratingText: { fontSize: 13, color: COLORS.text },
  callBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: { marginBottom: 12, marginLeft: 4 },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  itemsBox: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    padding: 20,
    marginBottom: 24,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemName: { fontSize: 15, color: COLORS.text, flex: 1 },
  itemPriceRow: { flexDirection: "row", alignItems: "center" },
  itemQty: { fontSize: 13, color: COLORS.textLight, marginRight: 12 },
  itemPrice: { fontSize: 15, color: COLORS.text },
  divider: { height: 1, backgroundColor: "#F4F5F7", marginVertical: 16 },
  deliveryBox: {
    backgroundColor: "#FFF",
    borderRadius: 28,
    padding: 20,
    marginBottom: 24,
  },
  deliveryRow: { flexDirection: "row", alignItems: "center" },
  deliveryText: { fontSize: 15, color: COLORS.text, marginLeft: 12 },
  totalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginTop: 8,
  },
  totalLabel: { fontSize: 18, color: COLORS.textLight },
  totalValue: { fontSize: 24, color: COLORS.primary },

  toastContainer: {
    position: "absolute",
    left: SIZES.padding,
    right: SIZES.padding,
    backgroundColor: "rgba(40, 44, 52, 0.95)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  toastText: {
    color: "#FFF",
    fontSize: 15,
    marginLeft: 10,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 16,
    backgroundColor: "rgba(248, 249, 251, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    zIndex: 50,
  },
  mainBtn: {
    backgroundColor: COLORS.primary,
    height: 64,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  mainBtnText: { color: "#FFF", fontSize: 18 },
  cancelOrderBtn: {
    marginTop: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelOrderText: {
    color: COLORS.error,
    fontSize: 15,
    textDecorationLine: "underline",
  },
});
