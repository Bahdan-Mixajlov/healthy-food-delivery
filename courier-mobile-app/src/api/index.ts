import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(":").shift();

const baseURL = localhost
  ? `http://${localhost}:3000/api`
  : "http://127.0.0.1:3000/api";

export const api = axios.create({
  baseURL: baseURL,
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("@courier_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
