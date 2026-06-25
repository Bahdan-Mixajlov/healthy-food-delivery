import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import Toast from "../components/Toast";

export default function OrderDetailsScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [checkedItems, setCheckedItems] = useState<number[]>([]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "warning">(
    "success",
  );

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const response = await api.get(`/orders/${orderId}`);
      const orderData = response.data;
      setOrder(orderData);

      if (orderData.status === "delivered" && orderData.items) {
        const allIndices = orderData.items.map((_: any, idx: number) => idx);
        setCheckedItems(allIndices);
      }
    } catch (error) {
      console.error(error);
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "warning" = "success",
  ) => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const openInMaps = () => {
    const fullAddress = `${order.street}, ${order.building}, Гродно`;
    const url = Platform.select({
      ios: `maps:0,0?q=${fullAddress}`,
      android: `geo:0,0?q=${fullAddress}`,
      web: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`,
    });
    if (url) Linking.openURL(url);
  };

  const toggleCheckItem = (idx: number) => {
    if (order?.status === "delivered") return;

    if (checkedItems.includes(idx)) {
      setCheckedItems(checkedItems.filter((i) => i !== idx));
    } else {
      setCheckedItems([...checkedItems, idx]);
    }
  };

  const performUpdate = async () => {
    setIsUpdating(true);
    try {
      await api.put(`/orders/${orderId}/status`, {
        status: order.status === "delivering" ? "delivered" : "delivering",
      });

      showToast("Статус успешно обновлен", "success");
      fetchOrderDetails();
    } catch (e) {
      console.error(e);
      showToast("Ошибка обновления статуса", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!order) return;

    if (
      (order.status === "cooking" || order.status === "created") &&
      checkedItems.length < order.items.length
    ) {
      showToast("Отметьте все позиции перед выездом!", "warning");
      return;
    }

    const title = "Обновление статуса";
    const message =
      order.status === "delivering"
        ? "Подтвердить доставку заказа клиенту?"
        : "Вы подтверждаете, что забрали все позиции и выезжаете?";

    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) {
        performUpdate();
      }
    } else {
      Alert.alert(title, message, [
        { text: "Отмена", style: "cancel" },
        { text: "Да", onPress: performUpdate },
      ]);
    }
  };

  if (isLoading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );

  return (
    <View style={styles.container}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Заказ №{orderId}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={styles.section}>
          <View style={styles.clientCard}>
            <View style={styles.avatar}>
              <FontAwesome6
                name="user-large"
                size={18}
                color={COLORS.textLight}
                solid
              />
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.clientName} weight="bold">
                {order.client_name || "Клиент"}
              </Text>
              <Text style={styles.clientPhone} weight="medium">
                {order.client_phone}
              </Text>
            </View>
            <View style={styles.commActions}>
              <TouchableOpacity
                style={styles.commBtn}
                onPress={() => Linking.openURL(`tel:${order.client_phone}`)}
              >
                <FontAwesome6
                  name="phone"
                  size={16}
                  color={COLORS.primary}
                  solid
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.addressBox}>
            <View style={styles.addressHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel} weight="bold">
                  АДРЕС ДОСТАВКИ
                </Text>
                <Text style={styles.addressMain} weight="bold">
                  {order.street}, д.{order.building}
                </Text>
              </View>
              <TouchableOpacity style={styles.routeBtn} onPress={openInMaps}>
                <FontAwesome6 name="map" size={12} color="#FFF" solid />
                <Text style={styles.routeBtnText} weight="bold">
                  КАРТА
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.addressDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel} weight="medium">
                  Кв
                </Text>
                <Text style={styles.detailVal} weight="bold">
                  {order.apartment || "—"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel} weight="medium">
                  Подъезд
                </Text>
                <Text style={styles.detailVal} weight="bold">
                  {order.entrance || "—"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel} weight="medium">
                  Этаж
                </Text>
                <Text style={styles.detailVal} weight="bold">
                  {order.floor || "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel} weight="bold">
            ПРОВЕРКА СОСТАВА
          </Text>
          <View style={styles.itemsCard}>
            {order.items?.map((item: any, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={styles.itemRow}
                onPress={() => toggleCheckItem(idx)}
                activeOpacity={order.status === "delivered" ? 1 : 0.7}
                disabled={order.status === "delivered"}
              >
                <FontAwesome6
                  name={checkedItems.includes(idx) ? "square-check" : "square"}
                  size={22}
                  color={
                    checkedItems.includes(idx) ? COLORS.primary : COLORS.inputBg
                  }
                  solid={checkedItems.includes(idx)}
                />
                <Text
                  style={[
                    styles.itemName,
                    checkedItems.includes(idx) && styles.itemCheckedText,
                  ]}
                  weight="medium"
                >
                  {item.title}
                </Text>
                <Text style={styles.itemQty} weight="bold">
                  x{item.quantity}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel} weight="medium">
                К оплате:
              </Text>
              <Text style={styles.totalVal} weight="bold">
                {parseFloat(order.total_amount).toFixed(2)} BYN
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 30 },
        ]}
      >
        {order.status === "delivered" ? (
          <View style={styles.completedBadge}>
            <FontAwesome6
              name="circle-check"
              size={20}
              color={COLORS.primary}
              solid
            />
            <Text style={styles.completedText} weight="bold">
              ЗАКАЗ ВРУЧЕН
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.mainActionBtn, isUpdating && { opacity: 0.8 }]}
            onPress={handleUpdateStatus}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.mainActionText} weight="bold">
                  {order.status === "cooking" || order.status === "created"
                    ? "Я ЗАБРАЛ ЗАКАЗ"
                    : "Я ДОСТАВИЛ ЗАКАЗ"}
                </Text>
                <FontAwesome6 name="arrow-right-long" size={16} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  headerTitle: { fontSize: 18, color: COLORS.text },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 24,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  clientName: { fontSize: 16, color: COLORS.text },
  clientPhone: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  commActions: { flexDirection: "row" },
  commBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F0F9F4",
    justifyContent: "center",
    alignItems: "center",
  },
  addressBox: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  addressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  addressMain: { fontSize: 18, color: COLORS.text, marginTop: 4, flex: 1 },
  routeBtn: {
    backgroundColor: "#3498DB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  routeBtnText: { color: "#FFF", fontSize: 10, marginLeft: 6 },
  addressDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    paddingTop: 16,
  },
  detailItem: { alignItems: "center", flex: 1 },
  detailLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailVal: { fontSize: 15, color: COLORS.text },
  itemsCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  itemRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  itemName: { fontSize: 15, color: COLORS.text, flex: 1, marginLeft: 12 },
  itemCheckedText: {
    color: COLORS.textLight,
    textDecorationLine: "line-through",
  },
  itemQty: { fontSize: 15, color: COLORS.textLight, marginLeft: 10 },
  divider: { height: 1, backgroundColor: "#F4F5F7", marginVertical: 12 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 14, color: COLORS.textLight },
  totalVal: { fontSize: 19, color: COLORS.primary },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -5 },
  },
  mainActionBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  mainActionText: {
    color: "#FFF",
    fontSize: 16,
    marginRight: 12,
    letterSpacing: 1,
  },
  completedBadge: {
    height: 60,
    borderRadius: 20,
    backgroundColor: "#F0F9F4",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  completedText: {
    color: COLORS.primary,
    fontSize: 16,
    marginLeft: 10,
    letterSpacing: 1,
  },
});
