import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: number;
  phone: string;
  firstName?: string;
  lastName?: string;
  bonusPoints: number;
  avatar?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: true,

  login: async (token, user) => {
    try {
      await AsyncStorage.setItem("userToken", token);
      await AsyncStorage.setItem("userData", JSON.stringify(user));
      set({ token, user, isLoading: false });
    } catch (e) {
      console.error(e);
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem("userToken");
      await AsyncStorage.removeItem("userData");
      set({ token: null, user: null, isLoading: false });
    } catch (e) {
      console.error(e);
    }
  },

  updateUser: async (userData) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData };
      await AsyncStorage.setItem("userData", JSON.stringify(updatedUser));
      set({ user: updatedUser });
    }
  },

  checkAuth: async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const userData = await AsyncStorage.getItem("userData");
      if (token && userData) {
        set({ token, user: JSON.parse(userData), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (e) {
      set({ isLoading: false });
    }
  },
}));
