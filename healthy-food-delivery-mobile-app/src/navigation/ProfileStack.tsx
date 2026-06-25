import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../screens/ProfileScreen";
import OrdersHistoryScreen from "../screens/OrdersHistoryScreen";
import TrackOrderScreen from "../screens/TrackOrderScreen";
import AddressesScreen from "../screens/AddressesScreen";
import PaymentsScreen from "../screens/PaymentsScreen";
import SupportScreen from "../screens/SupportScreen";
import SettingsScreen from "../screens/SettingsScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import AddAddressScreen from "../screens/AddAddressScreen";
import AddPaymentScreen from "../screens/AddPaymentScreen";
import SubscriptionsScreen from "../screens/SubscriptionsScreen";
import HomeScreen from "../screens/HomeScreen";
import ChatScreen from "../screens/ChatScreen";

const Stack = createNativeStackNavigator();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="OrdersHistory" component={OrdersHistoryScreen} />
      <Stack.Screen name="TrackOrder" component={TrackOrderScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="AddAddress" component={AddAddressScreen} />
      <Stack.Screen name="AddPayment" component={AddPaymentScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
