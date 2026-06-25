import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import Text from "../components/CustomText";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import { useAuthStore } from "../store/authStore";

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();

  const MENU_ITEMS = [
    { id: "orders", title: "Мои заказы", icon: "cube" },
    { id: "subscriptions", title: "Мои подписки", icon: "calendar" },
    { id: "addresses", title: "Адреса доставки", icon: "location" },
    { id: "payments", title: "Способы оплаты", icon: "card" },
    { id: "settings", title: "Настройки", icon: "settings" },
    { id: "support", title: "Поддержка", icon: "chatbubble-ellipses" },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.headerTitle} weight="bold">
        Профиль
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Image
              source={{
                uri: "https://www.shutterstock.com/image-vector/avatar-gender-neutral-silhouette-vector-600nw-2470054311.jpg",
              }}
              style={styles.avatarImage}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} weight="bold">
              {user?.firstName || "Пользователь"} {user?.lastName || ""}
            </Text>
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <FontAwesome name="pencil" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.pointsCard} activeOpacity={0.9}>
          <Text style={styles.pointsLabel} weight="bold">
            Ваши баллы
          </Text>
          <Text style={styles.pointsValue} weight="bold">
            {user?.bonusPoints || 0} BYN
          </Text>
        </TouchableOpacity>

        <View style={styles.menuContainer}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                index === MENU_ITEMS.length - 1 && styles.menuItemLast,
              ]}
              onPress={() => {
                if (item.id === "orders") {
                  navigation.navigate("OrdersHistory");
                } else if (item.id === "subscriptions") {
                  navigation.navigate("Subscriptions");
                } else if (item.id === "addresses") {
                  navigation.navigate("Addresses");
                } else if (item.id === "payments") {
                  navigation.navigate("Payments");
                } else if (item.id === "support") {
                  navigation.navigate("Support");
                } else if (item.id === "settings") {
                  navigation.navigate("Settings");
                }
              }}
            >
              <Ionicons
                name={item.icon as any}
                size={22}
                color={COLORS.text}
                style={styles.menuIcon}
              />
              <Text style={styles.menuTitle} weight="bold">
                {item.title}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText} weight="bold">
            Выйти из аккаунта
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  headerTitle: {
    fontSize: 32,
    color: COLORS.text,
    paddingHorizontal: SIZES.padding,
    paddingTop: 10,
    paddingBottom: 20,
  },
  scrollContent: { paddingHorizontal: SIZES.padding },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 28,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
    overflow: "hidden",
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, color: COLORS.text, marginBottom: 4 },
  userPhone: { fontSize: 14, color: COLORS.textLight },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
  },
  pointsCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 28,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  pointsLabel: { fontSize: 16, color: COLORS.textLight },
  pointsValue: { fontSize: 20, color: COLORS.primary },
  menuContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingHorizontal: 20,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: { marginRight: 16 },
  menuTitle: { flex: 1, fontSize: 16, color: COLORS.text },
  logoutBtn: {
    flexDirection: "row",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { fontSize: 16, color: COLORS.error },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
});
