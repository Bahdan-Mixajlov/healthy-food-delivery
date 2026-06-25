import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  Alert,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SIZES } from "../constants/theme";
import Text from "../components/CustomText";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQS = [
  {
    id: "1",
    q: "Как отменить заказ?",
    a: "Вы можете отменить заказ в течение 5 минут после оформления через приложение или позвонив оператору горячей линии.",
  },
  {
    id: "2",
    q: "Как изменить адрес доставки?",
    a: "Изменить адрес можно только до того, как заказ будет передан курьеру. Свяжитесь с поддержкой в чате или по телефону.",
  },
  {
    id: "3",
    q: "Что делать, если привезли не то блюдо?",
    a: "Сфотографируйте блюдо и чек. Мы заменим позицию или вернем баллы на ваш бонусный счет.",
  },
  {
    id: "4",
    q: "Зоны и стоимость доставки",
    a: "Мы доставляем еду по всему городу. Стоимость доставки — 5.00 BYN. При заказе от 50 BYN — бесплатно.",
  },
];

export default function SupportScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const makeCall = () => {
    const url = "tel:+375291234567";
    Linking.canOpenURL(url).then((supp) => {
      if (supp) Linking.openURL(url);
      else Alert.alert("Ошибка", "Звонки не поддерживаются");
    });
  };

  const sendEmail = () => Linking.openURL("mailto:support@healthyfood.by");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} weight="bold">
          Поддержка
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle} weight="bold">
            Свяжитесь с нами
          </Text>
          <Text style={styles.contactDesc}>
            Наши операторы работают ежедневно с 09:00 до 23:00 и готовы помочь
            вам.
          </Text>

          <View style={styles.contactsContainer}>
            <TouchableOpacity style={styles.contactLink} onPress={makeCall}>
              <View style={styles.iconCircle}>
                <FontAwesome6
                  name="phone"
                  size={18}
                  color={COLORS.primary}
                  solid
                />
              </View>
              <View>
                <Text style={styles.contactLabel}>Горячая линия</Text>
                <Text style={styles.contactValue} weight="bold">
                  +375 (29) 123-45-67
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.contactLink} onPress={sendEmail}>
              <View style={styles.iconCircle}>
                <FontAwesome6
                  name="envelope"
                  size={18}
                  color={COLORS.primary}
                  solid
                />
              </View>
              <View>
                <Text style={styles.contactLabel}>Электронная почта</Text>
                <Text style={styles.contactValue} weight="bold">
                  support@healthyfood.by
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactLink, { backgroundColor: "#F0F9F4" }]}
              onPress={() =>
                navigation.navigate("Chat", {
                  courierName: "Служба поддержки",
                  orderId: "HELP",
                })
              }
            >
              <View
                style={[styles.iconCircle, { backgroundColor: COLORS.primary }]}
              >
                <FontAwesome6
                  name="comment-dots"
                  size={18}
                  color="#FFF"
                  solid
                />
              </View>
              <View>
                <Text style={[styles.contactLabel, { color: COLORS.primary }]}>
                  Онлайн-чат
                </Text>
                <Text
                  style={[styles.contactValue, { color: COLORS.primary }]}
                  weight="bold"
                >
                  Ответим за 2 минуты
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle} weight="bold">
          Частые вопросы
        </Text>

        <View style={styles.faqContainer}>
          {FAQS.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <View
                key={item.id}
                style={[
                  styles.faqItem,
                  idx === FAQS.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <TouchableOpacity
                  style={styles.faqQuestionRow}
                  onPress={() => toggleExpand(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestion} weight="bold">
                    {item.q}
                  </Text>
                  <FontAwesome6
                    name={isExpanded ? "angle-up" : "angle-down"}
                    size={16}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswer}>{item.a}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: 40 },
  contactCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    marginTop: 10,
    marginBottom: 32,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 15,
  },
  contactTitle: { fontSize: 22, color: COLORS.text, marginBottom: 8 },
  contactDesc: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 24,
    lineHeight: 20,
  },
  contactsContainer: { gap: 12 },
  contactLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F5F7",
    padding: 14,
    borderRadius: 22,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  contactLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contactValue: { fontSize: 15, color: COLORS.text },
  sectionTitle: {
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 16,
    marginLeft: 8,
  },
  faqContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 15,
  },
  faqItem: { borderBottomWidth: 1, borderBottomColor: "#F4F5F7" },
  faqQuestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 22,
  },
  faqQuestion: { flex: 1, fontSize: 15, color: COLORS.text, paddingRight: 16 },
  faqAnswerBox: { paddingHorizontal: 22, paddingBottom: 24, marginTop: -4 },
  faqAnswer: { fontSize: 14, color: COLORS.textLight, lineHeight: 22 },
});
