import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeStack from "./HomeStack";
import MenuScreen from "../screens/MenuScreen";
import CartScreen from "../screens/CartScreen";
import ProfileStack from "./ProfileStack";
import { COLORS } from "../constants/theme";

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 10,
          borderTopWidth: 0,
          backgroundColor: COLORS.background,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: any;

          if (route.name === "Главная") iconName = "home";
          else if (route.name === "Меню") iconName = "list-ul";
          else if (route.name === "Корзина") iconName = "shopping-cart";
          else if (route.name === "Профиль") iconName = "user";

          return <FontAwesome name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Главная" component={HomeStack} />
      <Tab.Screen name="Меню" component={MenuScreen} />
      <Tab.Screen name="Корзина" component={CartScreen} />
      <Tab.Screen name="Профиль" component={ProfileStack} />
    </Tab.Navigator>
  );
}
