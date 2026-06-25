import { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import { api } from "../api";
import { useAuthStore } from "../store/authStore";
import Toast from "../components/Toast";

export default function EditProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [isLoading, setIsLoading] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const lastNameRef = useRef<TextInput>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      showToast("Имя не может быть пустым");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put(`/clients/${user?.id}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      await updateUser({
        firstName: response.data.first_name || firstName,
        lastName: response.data.last_name || lastName,
      });

      showToast("Профиль успешно обновлен");

      setTimeout(() => {
        navigation.navigate("HomeMain");
      }, 1500);
    } catch (error) {
      showToast("Не удалось сохранить данные");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Профиль
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label} weight="semibold">
          Имя
        </Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Ваше имя"
          placeholderTextColor={COLORS.textLight}
          returnKeyType="next"
          onSubmitEditing={() => lastNameRef.current?.focus()}
          blurOnSubmit={false}
        />

        <Text style={styles.label} weight="semibold">
          Фамилия
        </Text>
        <TextInput
          ref={lastNameRef}
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Ваша фамилия"
          placeholderTextColor={COLORS.textLight}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <TouchableOpacity
          style={[styles.saveBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText} weight="bold">
              Сохранить изменения
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  avatarSection: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  cameraIcon: {
    position: "absolute",
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: COLORS.background,
  },
  changePhotoText: {
    fontSize: 14,
    color: COLORS.primary,
  },
  label: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 10,
    marginLeft: 4,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 60,
    borderRadius: 22,
    paddingHorizontal: 20,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    height: 64,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 18 },
});
