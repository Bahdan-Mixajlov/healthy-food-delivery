import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";
import CustomSwitch from "../components/CustomSwitch";
import Toast from "../components/Toast";
import { useCourierAuthStore } from "../store/courierAuthStore";

const PRIVACY_TEXT = `Политика конфиденциальности для сотрудников\n\n1. Сбор геопозиции\nПриложение собирает данные о вашем местоположении в фоновом режиме, даже когда оно закрыто, для отслеживания доставки клиентом и распределения заказов.\n\n2. Личные данные\nМы храним вашу контактную информацию и историю доставок для расчета вознаграждений.\n\n3. Безопасность\nВаши данные не передаются третьим лицам, кроме случаев, предусмотренных законодательством РБ.`;

const AGREEMENT_TEXT = `Соглашение сотрудника (Оферта)\n\n1. Обязанности курьера\nКурьер обязуется доставлять заказы в надлежащем виде и соблюдать временные интервалы.\n\n2. Оплата труда\nВыплаты производятся еженедельно на основе количества выполненных доставок и оценок пользователей.\n\n3. Оборудование\nКурьер несет материальную ответственность за выданную термосумку и иное оборудование компании.`;

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { logout } = useCourierAuthStore();

  const [orderPush, setOrderPush] = useState(true);
  const [systemUpdates, setSystemUpdates] = useState(true);
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
        title === "Политика конфиденциальности" ? PRIVACY_TEXT : AGREEMENT_TEXT,
    });
    setModalVisible(true);
  };

  const handleDeleteAccount = () => {
    const title = "Удаление аккаунта";
    const msg =
      "Ваш профиль курьера будет деактивирован. Для восстановления доступа потребуется обращение к администратору.";

    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${msg}`)) logout();
    } else {
      Alert.alert(title, msg, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => await logout(),
        },
      ]);
    }
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
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionTitle} weight="bold">
          УВЕДОМЛЕНИЯ
        </Text>
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} weight="bold">
                Новые заказы
              </Text>
              <Text style={styles.rowDesc}>Оповещать о назначении заказа</Text>
            </View>
            <CustomSwitch
              value={orderPush}
              onValueChange={(v) => handleToggle(setOrderPush, v)}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} weight="bold">
                Обновления системы
              </Text>
              <Text style={styles.rowDesc}>
                Важные изменения в работе сервиса
              </Text>
            </View>
            <CustomSwitch
              value={systemUpdates}
              onValueChange={(v) => handleToggle(setSystemUpdates, v)}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          О ПРИЛОЖЕНИИ
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
            onPress={() => handleOpenLink("Соглашение сотрудника")}
          >
            <Text style={styles.linkTitle} weight="bold">
              Соглашение сотрудника
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
              Версия
            </Text>
            <Text style={styles.versionText}>1.0.4 (Build 42)</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
        >
          <FontAwesome6
            name="trash-can"
            size={16}
            color={COLORS.error}
            style={{ marginRight: 10 }}
          />
          <Text style={styles.deleteText} weight="bold">
            Удалить аккаунт
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerInfo}>
          ID устройства: {Math.random().toString(36).substr(2, 9).toUpperCase()}
        </Text>
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} weight="bold">
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
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  iconBtn: { width: 44, height: 44, justifyContent: "center" },
  headerTitle: { fontSize: 18, color: COLORS.text },
  content: { padding: 20 },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.textLight,
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 10,
    marginTop: 24,
  },
  block: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowTitle: { fontSize: 16, color: COLORS.text, marginBottom: 2 },
  rowDesc: { fontSize: 13, color: COLORS.textLight },
  divider: { height: 1, backgroundColor: "#F4F5F7" },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
  },
  linkTitle: { fontSize: 16, color: COLORS.text },
  versionText: { fontSize: 15, color: COLORS.textLight },
  deleteBtn: {
    marginTop: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  deleteText: { color: COLORS.error, fontSize: 15 },
  footerInfo: {
    textAlign: "center",
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 20,
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: "80%",
    width: "100%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F5F7",
  },
  modalTitle: { fontSize: 18, color: COLORS.text, flex: 1 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#F8F9FB",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollContent: { padding: 24 },
  modalText: { fontSize: 15, color: COLORS.text, lineHeight: 24 },
  modalFooter: {
    padding: 24,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#F4F5F7",
  },
  modalSubmitBtn: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSubmitText: { color: "#FFF", fontSize: 16 },
});
