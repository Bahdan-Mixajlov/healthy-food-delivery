import { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";

export default function AddAddressScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [form, setForm] = useState({
    street: "",
    building: "",
    floor: "",
    apartment: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const buildingRef = useRef<TextInput>(null);
  const apartmentRef = useRef<TextInput>(null);
  const floorRef = useRef<TextInput>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 60,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleAdd = async () => {
    if (!form.street.trim() || !form.building.trim()) {
      showToast("Укажите улицу и номер дома");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/addresses", {
        clientId: user?.id,
        ...form,
      });
      navigation.goBack();
    } catch (e) {
      showToast("Не удалось сохранить адрес");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        style={[styles.toast, { transform: [{ translateY: toastAnim }] }]}
      >
        <FontAwesome6 name="circle-exclamation" size={20} color="#FFF" solid />
        <Text style={styles.toastText} weight="medium">
          {toastMsg}
        </Text>
      </Animated.View>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Новый адрес
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label} weight="semibold">
            Улица
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Напр. пр-т Космонавтов"
            value={form.street}
            onChangeText={(t) => setForm({ ...form, street: t })}
            returnKeyType="next"
            onSubmitEditing={() => buildingRef.current?.focus()}
            blurOnSubmit={false}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label} weight="semibold">
                Дом
              </Text>
              <TextInput
                ref={buildingRef}
                style={styles.input}
                placeholder="12"
                value={form.building}
                onChangeText={(t) => setForm({ ...form, building: t })}
                returnKeyType="next"
                onSubmitEditing={() => apartmentRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label} weight="semibold">
                Квартира
              </Text>
              <TextInput
                ref={apartmentRef}
                style={styles.input}
                placeholder="45"
                value={form.apartment}
                onChangeText={(t) => setForm({ ...form, apartment: t })}
                returnKeyType="next"
                onSubmitEditing={() => floorRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          <Text style={styles.label} weight="semibold">
            Этаж (необязательно)
          </Text>
          <TextInput
            ref={floorRef}
            style={styles.input}
            placeholder="5"
            keyboardType="numeric"
            value={form.floor}
            onChangeText={(t) => setForm({ ...form, floor: t })}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />

          <TouchableOpacity
            style={[styles.btn, isLoading && { opacity: 0.7 }]}
            onPress={handleAdd}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnText} weight="bold">
                Сохранить адрес
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  toast: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    backgroundColor: "#FF4B4B",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1000,
    elevation: 10,
  },
  toastText: { color: "#FFF", marginLeft: 10, fontSize: 14 },
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
  content: { padding: SIZES.padding },
  label: { fontSize: 14, color: COLORS.textLight, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 20,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  half: { width: "48%" },
  btn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: { color: "#fff", fontSize: 18 },
});
