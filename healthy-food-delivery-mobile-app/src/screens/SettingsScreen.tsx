import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import CustomSwitch from "../components/CustomSwitch";
import { useAuthStore } from "../store/authStore";
import Toast from "../components/Toast";

const PRIVACY_TEXT = `Политика конфиденциальности\n\n1. Общие положения\nМы собираем ваши данные только для того, чтобы доставлять вам еду быстрее и горячее.\n\n2. Использование данных\nВаш номер телефона используется исключительно для связи с курьером и авторизации в приложении.\n\n3. Хранение данных\nМы надежно храним ваши данные на серверах и не передаем третьим лицам без вашего согласия.\n\n4. Удаление аккаунта\nВы можете в любой момент удалить свой аккаунт через настройки приложения. При этом все ваши данные будут стерты навсегда.\n`;

const TERMS_TEXT = `Пользовательское соглашение\n\n1. Предмет соглашения\nНастоящее соглашение регулирует отношения между пользователем и сервисом доставки.\n\n2. Оформление заказа\nОформляя заказ, пользователь обязуется оплатить его полную стоимость.\n\n3. Обязанности сервиса\nМы обязуемся доставить качественную еду в указанные сроки.\n\n4. Возвраты\nВ случае, если заказ приехал поврежденным, вы имеете право на замену или возврат средств после обращения в поддержку.\n`;

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuthStore();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [promoEnabled, setPromoEnabled] = useState(true);

  const [toastVisible, setToastVisible] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", content: "" });

  const handleToggle = (setter: (v: boolean) => void, value: boolean) => {
    setter(value);
    setToastVisible(true);
  };

  const handleOpenLink = (title: string) => {
    setModalConfig({
      title,
      content:
        title === "Политика конфиденциальности" ? PRIVACY_TEXT : TERMS_TEXT,
    });
    setModalVisible(true);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Удаление аккаунта",
      "Вы уверены? Все ваши баллы, история заказов и адреса будут безвозвратно удалены. Это действие нельзя отменить.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить навсегда",
          style: "destructive",
          onPress: async () => {
            console.log("Аккаунт удален:", user?.id);
            await logout();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Toast
        visible={toastVisible}
        message="Настройки обновлены"
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
          Настройки
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle} weight="bold">
          Уведомления
        </Text>
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} weight="bold">
                Push-уведомления
              </Text>
              <Text style={styles.rowDesc}>Статусы заказов и доставка</Text>
            </View>
            <CustomSwitch
              value={pushEnabled}
              onValueChange={(v) => handleToggle(setPushEnabled, v)}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} weight="bold">
                SMS-оповещения
              </Text>
              <Text style={styles.rowDesc}>Сообщения от курьера</Text>
            </View>
            <CustomSwitch
              value={smsEnabled}
              onValueChange={(v) => handleToggle(setSmsEnabled, v)}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} weight="bold">
                Акции и скидки
              </Text>
              <Text style={styles.rowDesc}>Персональные предложения</Text>
            </View>
            <CustomSwitch
              value={promoEnabled}
              onValueChange={(v) => handleToggle(setPromoEnabled, v)}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          О приложении
        </Text>
        <View style={styles.block}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => handleOpenLink("Политика конфиденциальности")}
          >
            <Text style={styles.linkTitle} weight="bold">
              Политика конфиденциальности
            </Text>
            <FontAwesome6
              name="chevron-right"
              size={14}
              color={COLORS.textLight}
            />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => handleOpenLink("Пользовательское соглашение")}
          >
            <Text style={styles.linkTitle} weight="bold">
              Пользовательское соглашение
            </Text>
            <FontAwesome6
              name="chevron-right"
              size={14}
              color={COLORS.textLight}
            />
          </TouchableOpacity>
          <View style={styles.divider} />

          <View style={styles.linkRow}>
            <Text style={styles.linkTitle} weight="bold">
              Версия приложения
            </Text>
            <Text style={styles.versionText}>1.0.4 (Build 42)</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <FontAwesome6
            name="trash-can"
            size={16}
            color={COLORS.error}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.deleteAccountText} weight="bold">
            Удалить аккаунт
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { paddingTop: insets.top ? insets.top : 24 },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} weight="bold" numberOfLines={1}>
                {modalConfig.title}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <FontAwesome6 name="xmark" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.modalText}>{modalConfig.content}</Text>
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                { paddingBottom: insets.bottom + 16 },
              ]}
            >
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSubmitText} weight="bold">
                  Понятно
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
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
  scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: 60 },
  sectionTitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 32,
    marginBottom: 12,
    marginLeft: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  block: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingHorizontal: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 20,
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowTitle: { fontSize: 16, color: COLORS.text, marginBottom: 4 },
  rowDesc: { fontSize: 13, color: COLORS.textLight },
  divider: { height: 1, backgroundColor: "#F4F5F7" },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 20,
  },
  linkTitle: { fontSize: 16, color: COLORS.text },
  versionText: { fontSize: 15, color: COLORS.textLight },
  deleteAccountBtn: {
    marginTop: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FFEBEB",
  },
  deleteAccountText: { fontSize: 16, color: COLORS.error },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: "85%",
    width: "100%",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
  modalTitle: {
    fontSize: 18,
    color: COLORS.text,
    flex: 1,
    paddingRight: 16,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#F4F5F7",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  modalText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
    backgroundColor: "#FFF",
  },
  modalSubmitBtn: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSubmitText: {
    color: "#FFF",
    fontSize: 16,
  },
});
