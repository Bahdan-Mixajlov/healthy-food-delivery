import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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

export default function AddressesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);

  const [addresses, setAddresses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultId, setDefaultId] = useState<number | null>(null);

  useEffect(() => {
    if (isFocused && user) fetchAddresses();
  }, [isFocused, user]);

  const fetchAddresses = async () => {
    try {
      const response = await api.get(`/addresses/${user?.id}`);
      setAddresses(response.data);
      if (response.data.length > 0 && !defaultId) {
        setDefaultId(response.data[0].id_address);
      }
    } catch (error) {
      console.error("Ошибка загрузки:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    const executeDelete = async () => {
      try {
        await api.delete(`/addresses/${id}`);

        setAddresses((prev) => {
          const newList = prev.filter((a) => a.id_address !== id);
          if (id === defaultId) {
            setDefaultId(newList.length > 0 ? newList[0].id_address : null);
          }
          return newList;
        });
      } catch (error) {
        const msg = "Не удалось удалить адрес";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Ошибка", msg);
      }
    };

    const confirmMsg = "Вы уверены, что хотите удалить этот адрес?";
    if (Platform.OS === "web") {
      if (window.confirm(confirmMsg)) executeDelete();
    } else {
      Alert.alert("Удаление", confirmMsg, [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: executeDelete },
      ]);
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
          Адреса доставки
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {addresses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <FontAwesome6
                  name="map-location-dot"
                  size={50}
                  color={COLORS.inputBg}
                />
              </View>
              <Text style={styles.emptyText} weight="medium">
                У вас нет сохраненных адресов
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => navigation.navigate("AddAddress")}
              >
                <Text style={styles.emptyAddBtnText} weight="bold">
                  Добавить первый адрес
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            addresses.map((item) => (
              <TouchableOpacity
                key={item.id_address}
                activeOpacity={0.9}
                onPress={() => setDefaultId(item.id_address)}
                style={[
                  styles.addressCard,
                  defaultId === item.id_address && styles.addressCardActive,
                ]}
              >
                <View style={styles.cardMain}>
                  <View
                    style={[
                      styles.iconCircle,
                      defaultId === item.id_address && {
                        backgroundColor: COLORS.primary,
                      },
                    ]}
                  >
                    <FontAwesome6
                      name="location-dot"
                      size={16}
                      color={
                        defaultId === item.id_address
                          ? "#FFF"
                          : COLORS.textLight
                      }
                    />
                  </View>

                  <View style={styles.info}>
                    <Text
                      style={styles.addressStreet}
                      weight="bold"
                      numberOfLines={1}
                    >
                      {item.street}
                    </Text>
                    <Text style={styles.addressFull}>
                      д. {item.building}, кв. {item.apartment}, этаж{" "}
                      {item.floor}
                    </Text>
                  </View>

                  {defaultId === item.id_address && (
                    <FontAwesome6
                      name="circle-check"
                      size={22}
                      color={COLORS.primary}
                      solid
                    />
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => handleDelete(item.id_address)}
                  style={styles.deleteBtn}
                >
                  <FontAwesome6
                    name="trash-can"
                    size={16}
                    color={COLORS.error}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("AddAddress")}
        >
          <FontAwesome6
            name="plus"
            size={18}
            color="#FFF"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.addButtonText} weight="bold">
            Добавить адрес
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
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
  emptyText: { fontSize: 16, color: COLORS.textLight, textAlign: "center" },
  emptyAddBtn: { marginTop: 20, padding: 12 },
  emptyAddBtnText: { color: COLORS.primary, fontSize: 16 },
  addressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginBottom: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  addressCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#F0F9F4",
  },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  info: { flex: 1, marginRight: 10 },
  addressStreet: { fontSize: 16, color: COLORS.text },
  addressFull: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFF1F0",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  footer: { paddingHorizontal: SIZES.padding, paddingTop: 10 },
  addButton: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  addButtonText: { color: "#FFFFFF", fontSize: 18 },
});
