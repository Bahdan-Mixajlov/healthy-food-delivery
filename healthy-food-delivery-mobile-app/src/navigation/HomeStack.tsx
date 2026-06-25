import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import PlanDetailsScreen from "../screens/PlanDetailsScreen";
import DishDetailsScreen from "../screens/DishDetailsScreen";
import OrderSuccessScreen from "../screens/OrderSuccessScreen";
import TrackOrderScreen from "../screens/TrackOrderScreen";
import PlanSuccessScreen from "../screens/PlanSuccessScreen";
import PlanConfigScreen from "../screens/PlanConfigScreen";
import SupportScreen from "../screens/SupportScreen";

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="PlanDetails" component={PlanDetailsScreen} />
      <Stack.Screen name="DishDetails" component={DishDetailsScreen} />
      <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} />
      <Stack.Screen name="TrackOrder" component={TrackOrderScreen} />
      <Stack.Screen name="PlanSuccess" component={PlanSuccessScreen} />
      <Stack.Screen name="PlanConfig" component={PlanConfigScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
    </Stack.Navigator>
  );
}
