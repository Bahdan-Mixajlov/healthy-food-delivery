import { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";

const isValidLuhn = (cardNumber: string) => {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 16) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

const getCardType = (number: string) => {
  const cleanNum = number.replace(/\D/g, "");
  if (/^4/.test(cleanNum)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(cleanNum)) return "MASTERCARD";
  if (/^220[0-4]/.test(cleanNum)) return "МИР";
  if (/^(50|5[6-9]|6)/.test(cleanNum)) return "MAESTRO";
  if (/^3[47]/.test(cleanNum)) return "AMEX";
  return "CARD";
};

export default function AddPaymentScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cardType, setCardType] = useState("CARD");

  const [toastMsg, setToastMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(-100)).current;

  const showToast = (msg: string) => {
    Keyboard.dismiss();
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: insets.top > 0 ? insets.top + 10 : 40,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleNumberChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setCardType(getCardType(cleaned));
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, "$1 ");
    setCardNumber(formatted);
  };

  const handleNameChange = (text: string) => {
    const cleanedText = text.replace(/[^A-Za-z\s]/g, "").toUpperCase();
    setCardName(cleanedText);
  };

  const handleExpiryChange = (text: string) => {
    let cleaned = text.replace(/\D/g, "");

    if (cleaned.length >= 2) {
      let month = parseInt(cleaned.substring(0, 2), 10);
      if (month > 12) cleaned = "12" + cleaned.substring(2);
      if (month === 0) cleaned = "01" + cleaned.substring(2);

      cleaned = cleaned.substring(0, 2) + "/" + cleaned.substring(2, 4);
    }
    setExpiry(cleaned);
  };

  const isValidExpiryDate = () => {
    if (expiry.length !== 5) return false;
    const [month, year] = expiry.split("/");
    const currentDate = new Date();
    const currentYear = parseInt(
      currentDate.getFullYear().toString().slice(-2),
      10,
    );
    const currentMonth = currentDate.getMonth() + 1;

    const expYear = parseInt(year, 10);
    const expMonth = parseInt(month, 10);

    if (expYear < currentYear) return false;
    if (expYear === currentYear && expMonth < currentMonth) return false;

    return true;
  };

  const handleAdd = async () => {
    const cleanNumber = cardNumber.replace(/\D/g, "");

    if (!isValidLuhn(cleanNumber)) {
      showToast("Неверный номер карты. Проверьте правильность ввода.");
      return;
    }

    if (!isValidExpiryDate()) {
      showToast("Неверный или истекший срок действия карты.");
      return;
    }

    if (!cardName.trim() || cardName.trim().length < 3) {
      showToast("Введите корректное имя владельца на латинице.");
      return;
    }

    try {
      const last4 = cleanNumber.slice(-4);
      await api.post("/payments", {
        clientId: user?.id,
        type: cardType.toLowerCase(),
        name: cardName.trim(),
        last4: last4,
        expiryDate: expiry,
      });
      navigation.goBack();
    } catch (e) {
      showToast("Ошибка соединения. Не удалось сохранить карту.");
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.toast,
          { transform: [{ translateY: toastAnim }], zIndex: 100 },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={24} color="#FFF" />
        <Text style={styles.toastText} weight="medium">
          {toastMsg}
        </Text>
      </Animated.View>

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Новая карта
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.cardPreview}>
          <View style={styles.cardPreviewHeader}>
            <Ionicons name="card-outline" size={32} color="#FFF" />
            <Text style={styles.cardBrandText} weight="bold">
              {cardType !== "CARD" ? cardType : ""}
            </Text>
          </View>

          <Text style={styles.previewNumber} weight="bold">
            {cardNumber || "•••• •••• •••• ••••"}
          </Text>

          <View style={styles.cardPreviewFooter}>
            <View>
              <Text style={styles.previewLabel} weight="regular">
                Card Holder
              </Text>
              <Text style={styles.previewValue} weight="medium">
                {cardName || "NAME SURNAME"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.previewLabel} weight="regular">
                Expires
              </Text>
              <Text style={styles.previewValue} weight="medium">
                {expiry || "MM/YY"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.label} weight="semibold">
          Номер карты
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0000 0000 0000 0000"
          keyboardType="numeric"
          maxLength={19}
          value={cardNumber}
          onChangeText={handleNumberChange}
        />

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label} weight="semibold">
              Срок действия
            </Text>
            <TextInput
              style={styles.input}
              placeholder="MM/YY"
              keyboardType="numeric"
              maxLength={5}
              value={expiry}
              onChangeText={handleExpiryChange}
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label} weight="semibold">
              CVC/CVV
            </Text>
            <TextInput
              style={styles.input}
              placeholder="•••"
              keyboardType="numeric"
              maxLength={3}
              secureTextEntry
            />
          </View>
        </View>

        <Text style={styles.label} weight="semibold">
          Имя владельца (как на карте)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="IVAN IVANOV"
          value={cardName}
          onChangeText={handleNameChange}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity style={styles.btn} onPress={handleAdd}>
          <Text style={styles.btnText} weight="bold">
            Привязать карту
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  toast: {
    position: "absolute",
    top: 0,
    left: SIZES.padding,
    right: SIZES.padding,
    backgroundColor: "#FF4B4B",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#FF4B4B",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: {
    color: "#FFF",
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SIZES.padding,
    height: 100,
  },
  headerTitle: { fontSize: 18, color: COLORS.text },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: SIZES.padding, paddingBottom: 40 },
  cardPreview: {
    backgroundColor: COLORS.text,
    height: 220,
    borderRadius: 24,
    padding: 24,
    justifyContent: "space-between",
    marginBottom: 32,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  cardPreviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBrandText: {
    color: "#FFF",
    fontSize: 18,
    fontStyle: "italic",
    opacity: 0.9,
  },
  previewNumber: {
    color: "#FFF",
    fontSize: 22,
    letterSpacing: 2,
    textAlign: "center",
  },
  cardPreviewFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  previewLabel: { color: "#FFF", fontSize: 10, opacity: 0.6, marginBottom: 4 },
  previewValue: {
    color: "#FFF",
    fontSize: 14,
    opacity: 0.9,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  halfWidth: { width: "47%" },
  label: { fontSize: 14, color: COLORS.textLight, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 20,
    fontFamily: "Inter_400Regular",
  },
  btn: {
    backgroundColor: COLORS.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: { color: "#fff", fontSize: 16 },
});
