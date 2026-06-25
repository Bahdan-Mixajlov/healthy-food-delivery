import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesome6 } from "@expo/vector-icons";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useCourierAuthStore } from "../store/courierAuthStore";

export default function AuthScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const login = useCourierAuthStore((state) => state.login);

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  const [toastMsg, setToastMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: insets.top + 10,
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

  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const formatPhoneNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    let formatted = cleaned;

    if (cleaned.startsWith("80")) {
      formatted = "375" + cleaned.substring(2);
    } else if (cleaned.length > 0 && !cleaned.startsWith("375")) {
      formatted = "375" + cleaned;
    }

    let final = "";
    if (formatted.length > 0) final = "+" + formatted.substring(0, 3);
    if (formatted.length > 3) final += " (" + formatted.substring(3, 5);
    if (formatted.length > 5) final += ") " + formatted.substring(5, 8);
    if (formatted.length > 8) final += "-" + formatted.substring(8, 10);
    if (formatted.length > 10) final += "-" + formatted.substring(10, 12);

    setPhone(final);
  };

  const handleSendCode = async () => {
    if (phone.length < 19) {
      showToast("Введите полный номер телефона");
      return;
    }
    if (timer > 0) return;

    setIsLoading(true);
    try {
      const rawPhone = "+" + phone.replace(/\D/g, "");
      await api.post("/auth/courier/send-code", { phone: rawPhone });

      setStep("code");
      setTimer(60);
    } catch (error: any) {
      const message = error.response?.data?.message || "Ошибка доступа";
      showToast(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onCodeChange = (text: string) => {
    const cleanCode = text.replace(/\D/g, "");
    setCode(cleanCode);
    if (cleanCode.length === 4) {
      handleVerifyCode(cleanCode);
    }
  };

  const handleVerifyCode = async (codeToVerify: string) => {
    setIsLoading(true);
    try {
      const rawPhone = "+" + phone.replace(/\D/g, "");
      const response = await api.post("/auth/courier/verify-code", {
        phone: rawPhone,
        code: codeToVerify,
      });

      const { token, courier } = response.data;

      if (token && courier) {
        await login(token, courier);
      } else {
        throw new Error("Неполные данные от сервера");
      }
    } catch (error: any) {
      showToast("Неверный код подтверждения");
      setCode("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <Animated.View
        style={[styles.toast, { transform: [{ translateY: toastAnim }] }]}
      >
        <FontAwesome6 name="circle-exclamation" size={18} color="#FFF" solid />
        <Text style={styles.toastText} weight="medium">
          {toastMsg}
        </Text>
      </Animated.View>

      <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
        <Text style={styles.title} weight="bold">
          Вход в систему
        </Text>
        <Text style={styles.subtitle}>
          {step === "phone"
            ? "Введите ваш рабочий номер телефона для авторизации"
            : `Код подтверждения отправлен на\n${phone}`}
        </Text>

        <View
          style={[styles.inputWrapper, step === "code" && styles.inputDisabled]}
        >
          <TextInput
            style={styles.input}
            placeholder="+375 (XX) XXX-XX-XX"
            placeholderTextColor={COLORS.textLight}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={formatPhoneNumber}
            maxLength={19}
            editable={step === "phone" && !isLoading}
          />
        </View>

        {step === "code" && (
          <View style={[styles.inputWrapper, styles.smsWrapper]}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••"
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
              maxLength={4}
              value={code}
              onChangeText={onCodeChange}
              autoFocus
              editable={!isLoading}
            />
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.mainBtn,
            (isLoading || (step === "phone" && phone.length < 19)) &&
              styles.btnDisabled,
          ]}
          onPress={
            step === "phone" ? handleSendCode : () => handleVerifyCode(code)
          }
          disabled={isLoading || (step === "phone" && phone.length < 19)}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.mainBtnText} weight="bold">
              {step === "phone" ? "Получить код" : "Войти"}
            </Text>
          )}
        </TouchableOpacity>

        {step === "code" && (
          <View style={styles.codeActions}>
            <TouchableOpacity
              onPress={() => {
                setStep("phone");
                setCode("");
              }}
            >
              <Text style={styles.linkAction} weight="bold">
                Изменить номер
              </Text>
            </TouchableOpacity>

            {timer > 0 ? (
              <Text style={styles.timerText}>Повтор через {timer}с</Text>
            ) : (
              <TouchableOpacity onPress={handleSendCode}>
                <Text style={styles.linkAction} weight="bold">
                  Отправить снова
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerInfo} weight="medium">
            Вход доступен только для зарегистрированных сотрудников.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  toast: {
    position: "absolute",
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
  content: { flex: 1, paddingHorizontal: SIZES.padding * 1.5 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9F4",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 10,
    marginLeft: 6,
    letterSpacing: 1,
  },
  title: { fontSize: 28, color: COLORS.text, marginBottom: 10 },
  subtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 20,
    marginBottom: 40,
  },
  inputWrapper: {
    backgroundColor: COLORS.inputBg,
    height: 60,
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: "center",
    marginBottom: 16,
  },
  inputDisabled: { opacity: 0.5 },
  smsWrapper: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    backgroundColor: "#F0F9F4",
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
  },
  codeInput: { letterSpacing: 12, fontSize: 24, textAlign: "center" },
  mainBtn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  btnDisabled: { backgroundColor: "#D1D5DB", elevation: 0 },
  mainBtnText: { color: "#FFFFFF", fontSize: 18 },
  codeActions: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  linkAction: { color: COLORS.primary, fontSize: 14 },
  timerText: { color: COLORS.textLight, fontSize: 14 },
  footer: { marginTop: "auto", marginBottom: 40 },
  footerInfo: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: "center",
    lineHeight: 18,
    opacity: 0.7,
  },
});
