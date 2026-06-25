import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";
import Skeleton from "../components/Skeleton";

const PaymentSkeleton = () => (
  <View style={styles.card}>
    <Skeleton width={52} height={52} borderRadius={14} />
    <View style={{ marginLeft: 16, flex: 1 }}>
      <Skeleton
        width="60%"
        height={18}
        borderRadius={4}
        style={{ marginBottom: 8 }}
      />
      <Skeleton width="30%" height={14} borderRadius={4} />
    </View>
  </View>
);

export default function PaymentsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user } = useAuthStore();

  const [methods, setMethods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultId, setDefaultId] = useState<number | null>(null);

  useEffect(() => {
    if (isFocused && user) fetchMethods();
  }, [isFocused, user]);

  const fetchMethods = async () => {
    try {
      const response = await api.get(`/payments/${user?.id}`);
      setMethods(response.data);
      if (response.data.length > 0 && !defaultId) {
        setDefaultId(response.data[0].id_payment);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMethod = (id: number) => {
    const executeDelete = async () => {
      try {
        await api.delete(`/payments/${id}`);

        setMethods((prev) => {
          const newList = prev.filter((m) => m.id_payment !== id);
          if (id === defaultId) {
            setDefaultId(newList.length > 0 ? newList[0].id_payment : null);
          }
          return newList;
        });
      } catch (e) {
        const errorMsg = "Не удалось удалить карту";
        Platform.OS === "web"
          ? window.alert(errorMsg)
          : Alert.alert("Ошибка", errorMsg);
      }
    };

    const message = "Вы уверены, что хотите удалить этот способ оплаты?";
    if (Platform.OS === "web") {
      if (window.confirm(message)) executeDelete();
    } else {
      Alert.alert("Удаление", message, [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: executeDelete },
      ]);
    }
  };

  const getIconName = (type: string) => {
    switch (type.toLowerCase()) {
      case "apple_pay":
        return "apple-pay";
      case "google_pay":
        return "google-pay";
      case "visa":
        return "cc-visa";
      case "mastercard":
        return "cc-mastercard";
      default:
        return "credit-card";
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Способы оплаты
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.scrollContent}>
          <PaymentSkeleton />
          <PaymentSkeleton />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {methods.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <FontAwesome6
                  name="credit-card"
                  size={50}
                  color={COLORS.inputBg}
                  solid
                />
              </View>
              <Text style={styles.emptyText} weight="medium">
                У вас нет сохраненных карт
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => navigation.navigate("AddPayment")}
              >
                <Text style={styles.emptyAddBtnText} weight="bold">
                  Привязать карту
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            methods.map((item) => (
              <TouchableOpacity
                key={item.id_payment}
                activeOpacity={0.9}
                onPress={() => setDefaultId(item.id_payment)}
                style={[
                  styles.card,
                  defaultId === item.id_payment && styles.cardActive,
                ]}
              >
                <View
                  style={[
                    styles.iconBg,
                    item.type === "apple_pay" && { backgroundColor: "#000" },
                  ]}
                >
                  <FontAwesome6
                    name={getIconName(item.type)}
                    size={item.type === "apple_pay" ? 28 : 22}
                    color={item.type === "apple_pay" ? "#FFF" : COLORS.text}
                    solid
                  />
                </View>

                <View style={styles.info}>
                  <Text style={styles.name} weight="bold">
                    {item.name}
                  </Text>
                  {item.last4 ? (
                    <Text style={styles.last4}>•••• {item.last4}</Text>
                  ) : null}
                </View>

                {defaultId === item.id_payment ? (
                  <FontAwesome6
                    name="circle-check"
                    size={22}
                    color={COLORS.primary}
                    solid
                  />
                ) : (
                  item.type !== "apple_pay" && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMethod(item.id_payment)}
                      style={styles.deleteBtn}
                    >
                      <FontAwesome6
                        name="trash-can"
                        size={16}
                        color={COLORS.error}
                      />
                    </TouchableOpacity>
                  )
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("AddPayment")}
        >
          <FontAwesome6
            name="plus"
            size={18}
            color="#FFF"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.addButtonText} weight="bold">
            Добавить карту
          </Text>
        </TouchableOpacity>
      </View>
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
  scrollContent: { padding: SIZES.padding },
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
  emptyText: { fontSize: 16, color: COLORS.textLight },
  emptyAddBtn: { marginTop: 20, padding: 12 },
  emptyAddBtnText: { color: COLORS.primary, fontSize: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginBottom: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardActive: { borderColor: COLORS.primary, backgroundColor: "#F0F9F4" },
  iconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, marginLeft: 16 },
  name: { fontSize: 16, color: COLORS.text },
  last4: { fontSize: 14, color: COLORS.textLight, marginTop: 2 },
  deleteBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF1F0",
    borderRadius: 12,
  },
  footer: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 16,
    backgroundColor: "#F8F9FB",
  },
  addButton: {
    flexDirection: "row",
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
  addButtonText: { color: "#FFFFFF", fontSize: 18 },
});
