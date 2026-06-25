import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Courier {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  status: "active" | "offline";
}

interface CourierAuthState {
  token: string | null;
  courier: Courier | null;
  login: (token: string, courier: Courier) => Promise<void>;
  logout: () => Promise<void>;
}

export const useCourierAuthStore = create<CourierAuthState>((set) => ({
  token: null,
  courier: null,

  login: async (token, courier) => {
    try {
      await AsyncStorage.setItem("@courier_token", token);
      await AsyncStorage.setItem("@courier_data", JSON.stringify(courier));
      set({ token, courier });
    } catch (e) {
      console.error("Ошибка сохранения данных курьера", e);
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem("@courier_token");
      await AsyncStorage.removeItem("@courier_data");
      set({ token: null, courier: null });
    } catch (e) {
      console.error("Ошибка при выходе", e);
    }
  },
}));
