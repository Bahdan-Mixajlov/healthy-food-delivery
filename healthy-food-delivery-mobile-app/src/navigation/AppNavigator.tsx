import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabNavigator from "./TabNavigator";
import AuthScreen from "../screens/AuthScreen";
import OrderSuccessScreen from "../screens/OrderSuccessScreen";
import TrackOrderScreen from "../screens/TrackOrderScreen";
import { useAuthStore } from "../store/authStore";
import { View, ActivityIndicator } from "react-native";
import { COLORS } from "../constants/theme";
import SupportScreen from "../screens/SupportScreen";
import AIChatScreen from "../screens/AIChatScreen"; // 1. ИМПОРТИРУЕМ НОВЫЙ ЭКРАН ЧАТА

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { token, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token === null ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} />
            <Stack.Screen name="TrackOrder" component={TrackOrderScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            {/* 2. РЕГИСТРИРУЕМ ЭКРАН ИИ-ЧАТА В СТЕКЕ */}
            <Stack.Screen name="AIChatScreen" component={AIChatScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
