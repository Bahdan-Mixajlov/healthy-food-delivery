import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import Text from "../components/CustomText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SIZES } from "../constants/theme";
import CustomSwitch from "../components/CustomSwitch";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../api";
import { useIsFocused } from "@react-navigation/native";

export default function CartScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [isContactless, setIsContactless] = useState(true);

  const [addresses, setAddresses] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [usePoints, setUsePoints] = useState(false);

  const [isAddressModalVisible, setAddressModalVisible] = useState(false);
  const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const {
    items,
    increaseQuantity,
    decreaseQuantity,
    getTotalPrice,
    clearCart,
  } = useCartStore();
  const { user, updateUser } = useAuthStore();

  const totalPrice = getTotalPrice();
  const deliveryPrice = items.length > 0 ? 5.0 : 0;

  const totalCalories = items.reduce(
    (sum, item) => sum + (item.calories || 0) * item.quantity,
    0,
  );

  const availablePoints = user?.bonusPoints || 0;
  const maxAllowedPoints = totalPrice * 0.5;
  const pointsToDeduct = usePoints
    ? Math.min(availablePoints, maxAllowedPoints)
    : 0;

  const finalTotal = totalPrice + deliveryPrice - pointsToDeduct;

  useEffect(() => {
    if (isFocused && user) {
      fetchCheckoutData();
    }
  }, [isFocused, user]);

  const fetchCheckoutData = async () => {
    setIsLoadingData(true);
    try {
      const [addrRes, payRes] = await Promise.all([
        api.get(`/addresses/${user?.id}`),
        api.get(`/payments/${user?.id}`),
      ]);
      setAddresses(addrRes.data);
      setPaymentMethods(payRes.data);

      if (addrRes.data.length > 0 && !selectedAddress)
        setSelectedAddress(addrRes.data[0]);
      if (payRes.data.length > 0 && !selectedPayment)
        setSelectedPayment(payRes.data[0]);
    } catch (error) {
      console.error("Ошибка загрузки данных:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!user) {
      Alert.alert("Ошибка", "Необходимо авторизоваться");
      return;
    }
    if (!selectedAddress) {
      Alert.alert("Внимание", "Выберите адрес доставки");
      return;
    }

    const remainingPoints = availablePoints - pointsToDeduct;

    try {
      const response = await api.post("/orders", {
        clientId: user.id,
        addressId: selectedAddress.id_address,
        items: items,
        totalAmount: finalTotal,
        paymentType: selectedPayment?.name || "Apple Pay",
        pointsUsed: pointsToDeduct,
      });

      if (pointsToDeduct > 0) {
        await updateUser({ bonusPoints: remainingPoints });

        try {
          await api.put(`/users/${user.id}`, {
            bonusPoints: remainingPoints,
          });
        } catch (updateErr) {
          console.log(
            "Заказ создан, но не удалось обновить баллы в БД",
            updateErr,
          );
        }
      }

      navigation.navigate("OrderSuccess", {
        orderId:
          response.data.orderId || Math.floor(1000 + Math.random() * 9000),
        items: items,
        totalPrice: finalTotal.toFixed(2),
        address: `${selectedAddress.street}, д. ${selectedAddress.building}`,
        paymentType: selectedPayment?.name || "Apple Pay",
        pointsUsed: pointsToDeduct,
        deliveryPrice: deliveryPrice,
      });

      setTimeout(() => {
        clearCart();
        setUsePoints(false);
      }, 500);
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось отправить заказ");
      console.error(error);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.headerTitle} weight="bold">
        Корзина
      </Text>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color={COLORS.inputBg} />
          <Text style={styles.emptyText} weight="medium">
            В корзине пока пусто
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
          >
            <View style={styles.itemsContainer}>
              {items.map((item) => (
                <View key={item.id} style={styles.cartItem}>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.itemImage}
                  />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} weight="bold">
                      {item.title}
                    </Text>
                    <Text style={styles.itemWeight}>
                      {item.weight}
                      {item.calories ? ` · ${item.calories} ккал` : ""}
                    </Text>
                    <Text style={styles.itemPrice} weight="bold">
                      {item.price.toFixed(2)} BYN
                    </Text>
                  </View>

                  <View style={styles.quantityContainer}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => decreaseQuantity(item.id)}
                    >
                      <Text style={styles.qtyBtnText} weight="bold">
                        –
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValue} weight="bold">
                      {item.quantity}
                    </Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => increaseQuantity(item.id)}
                    >
                      <Text style={styles.qtyBtnText} weight="bold">
                        +
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setAddressModalVisible(true)}
            >
              <Ionicons
                name="location"
                size={22}
                color={COLORS.primary}
                style={styles.actionIcon}
              />
              <View style={styles.actionInfo}>
                <Text style={styles.actionLabel}>Адрес доставки</Text>
                <Text style={styles.actionValue} weight="bold">
                  {selectedAddress
                    ? `${selectedAddress.street}, д.${selectedAddress.building}`
                    : "Загрузка..."}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setPaymentModalVisible(true)}
            >
              <Ionicons
                name="card"
                size={22}
                color={COLORS.text}
                style={styles.actionIcon}
              />
              <View style={styles.actionInfo}>
                <Text style={styles.actionLabel}>Способ оплаты</Text>
                <Text style={styles.actionValue} weight="bold">
                  {selectedPayment ? selectedPayment.name : "Apple Pay"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel} weight="bold">
                Списать баллы ({availablePoints} BYN)
              </Text>
              <CustomSwitch value={usePoints} onValueChange={setUsePoints} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel} weight="bold">
                Бесконтактная доставка
              </Text>
              <CustomSwitch
                value={isContactless}
                onValueChange={setIsContactless}
              />
            </View>

            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Товары</Text>
                <Text style={styles.summaryValueLight} weight="bold">
                  {totalPrice.toFixed(2)} BYN
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Энерг. ценность</Text>
                <Text style={styles.summaryValueLight} weight="bold">
                  {totalCalories} ккал
                </Text>
              </View>
              {usePoints && (
                <View style={styles.summaryRow}>
                  <Text
                    style={[styles.summaryLabel, { color: COLORS.primary }]}
                  >
                    Скидка баллами
                  </Text>
                  <Text
                    style={[
                      styles.summaryValueLight,
                      { color: COLORS.primary },
                    ]}
                    weight="bold"
                  >
                    -{pointsToDeduct.toFixed(2)} BYN
                  </Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Доставка</Text>
                <Text style={styles.summaryValueLight} weight="bold">
                  {deliveryPrice.toFixed(2)} BYN
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel} weight="bold">
                  Итого
                </Text>
                <Text style={styles.totalValue} weight="bold">
                  {finalTotal.toFixed(2)} BYN
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handlePlaceOrder}
            >
              <Text style={styles.submitButtonText} weight="bold">
                Оформить заказ
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ИСПРАВЛЕННОЕ МОДАЛЬНОЕ ОКНО АДРЕСОВ */}
          <Modal
            visible={isAddressModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setAddressModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setAddressModalVisible(false)}
              />
              <View
                style={[
                  styles.modalContent,
                  { paddingBottom: insets.bottom + 20 },
                ]}
              >
                <Text style={styles.modalTitle} weight="bold">
                  Выберите адрес
                </Text>

                {isLoadingData ? (
                  <View style={{ paddingVertical: 30, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {addresses.map((addr) => (
                      <TouchableOpacity
                        key={addr.id_address}
                        style={styles.modalItem}
                        onPress={() => {
                          setSelectedAddress(addr);
                          setAddressModalVisible(false);
                        }}
                      >
                        {/* ДОБАВЛЕН СТИЛЬ styles.modalItemText */}
                        <Text style={styles.modalItemText} weight="bold">
                          {addr.street}, {addr.building}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          {/* ИСПРАВЛЕННОЕ МОДАЛЬНОЕ ОКНО СПОСОБОВ ОПЛАТЫ */}
          <Modal
            visible={isPaymentModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setPaymentModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setPaymentModalVisible(false)}
              />
              <View
                style={[
                  styles.modalContent,
                  { paddingBottom: insets.bottom + 20 },
                ]}
              >
                <Text style={styles.modalTitle} weight="bold">
                  Способ оплаты
                </Text>

                {isLoadingData ? (
                  <View style={{ paddingVertical: 30, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {paymentMethods.map((method) => (
                      <TouchableOpacity
                        key={method.id_payment}
                        style={styles.modalItem}
                        onPress={() => {
                          setSelectedPayment(method);
                          setPaymentModalVisible(false);
                        }}
                      >
                        {/* ДОБАВЛЕН СТИЛЬ styles.modalItemText */}
                        <Text style={styles.modalItemText} weight="bold">
                          {method.name}{" "}
                          {method.last4 ? `(•• ${method.last4})` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerTitle: {
    fontSize: 32,
    color: COLORS.text,
    paddingHorizontal: SIZES.padding,
    paddingTop: 10,
    paddingBottom: 20,
  },
  scrollContent: { paddingHorizontal: SIZES.padding },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  emptyText: { marginTop: 16, fontSize: 18, color: COLORS.textLight },
  itemsContainer: { marginBottom: 24 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  itemImage: { width: 70, height: 70, borderRadius: 16 },
  itemInfo: { flex: 1, marginLeft: 16 },
  itemTitle: { fontSize: 16, color: COLORS.text, marginBottom: 4 },
  itemWeight: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  itemPrice: {
    fontSize: 16,
    color: COLORS.text,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    padding: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  qtyBtnText: { fontSize: 18, color: COLORS.text },
  qtyValue: { fontSize: 15, marginHorizontal: 10, color: COLORS.text },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 24,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  actionIcon: { marginRight: 16 },
  actionInfo: { flex: 1 },
  actionLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 4 },
  actionValue: { fontSize: 15, color: COLORS.text },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 10,
  },
  switchLabel: { fontSize: 16, color: COLORS.text, flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 22,
    marginBottom: 20,
    color: COLORS.text,
  },
  modalItem: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
  /* ДОБАВЛЕННЫЙ СТИЛЬ ДЛЯ ТЕКСТА */
  modalItemText: {
    fontSize: 16,
    color: COLORS.text,
  },
  summaryContainer: { marginBottom: 32, marginTop: 10 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryLabel: { fontSize: 15, color: COLORS.textLight },
  summaryValueLight: {
    fontSize: 15,
    color: COLORS.text,
  },
  totalRow: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.inputBg,
    paddingTop: 18,
  },
  totalLabel: { fontSize: 20, color: COLORS.text },
  totalValue: { fontSize: 22, color: COLORS.primary },
  submitButton: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  submitButtonText: { color: "#FFFFFF", fontSize: 18 },
});
