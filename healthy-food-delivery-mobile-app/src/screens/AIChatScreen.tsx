import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";

import Text from "../components/CustomText";
import DishCard from "../components/DishCard";
import SearchBar from "../components/SearchBar";
import Toast from "../components/Toast";
import { COLORS, SIZES } from "../constants/theme";
import { api } from "../api";

// ── Константы ────────────────────────────────────────────────────────────────

const CHAT_STORAGE_KEY = "ai_chat_session_v1";

const INITIAL_SUGGESTIONS = [
  { text: "Завтрак до 300 ккал", icon: "🍳" },
  { text: "Обед с высоким белком", icon: "🥩" },
  { text: "Полезный десерт", icon: "🍓" },
  { text: "Суп до 15 рублей", icon: "🥣" },
];

const CONTEXT_REPLIES = [
  { text: "Ещё варианты", icon: "refresh-outline" },
  { text: "Подешевле", icon: "pricetag-outline" },
  { text: "Больше белка", icon: "barbell-outline" },
  { text: "Менее калорийное", icon: "flame-outline" },
  { text: "Похожее, но другое", icon: "shuffle-outline" },
];

// ── Типы ─────────────────────────────────────────────────────────────────────

interface Dish {
  id: string | number;
  title: string;
  description: string;
  price: string | number;
  calories?: string | number;
  image: string;
  weight?: string | number;
}

interface SearchParams {
  search_query?: string | null;
  exclude_query?: string | null;
  category?: string | null;
  max_calories?: number | null;
  min_calories?: number | null;
  min_proteins?: number | null;
  max_price?: number | null;
  is_vegetarian?: boolean | null;
  is_gluten_free?: boolean | null;
  is_dairy_free?: boolean | null;
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  dishes?: Dish[];
  search_params?: SearchParams;
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substring(7);

const buildFilterChips = (params?: SearchParams): string[] => {
  if (!params) return [];
  const chips: string[] = [];
  if (params.category) chips.push(params.category);
  if (params.search_query) chips.push(params.search_query);
  if (params.max_calories) chips.push(`до ${params.max_calories} ккал`);
  if (params.min_calories) chips.push(`от ${params.min_calories} ккал`);
  if (params.min_proteins) chips.push(`белок ≥ ${params.min_proteins}г`);
  if (params.max_price) chips.push(`до ${params.max_price} BYN`);
  if (params.exclude_query)
    chips.push(
      `без: ${params.exclude_query.split(" ").slice(0, 2).join(", ")}`,
    );
  if (params.is_vegetarian) chips.push("вегетарианское");
  if (params.is_gluten_free) chips.push("без глютена");
  if (params.is_dairy_free) chips.push("без молочного");
  return chips.slice(0, 4);
};

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  sender: "ai",
  text: "Привет! 👋 Я ваш персональный ИИ-диетолог.\n\nРасскажите, что бы вы хотели съесть сегодня или опишите свои цели — например: «лёгкий завтрак с ягодами до 300 ккал» или «ужин с высоким содержанием белка».",
};

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function AIChatScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // ── Сессия ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (stored) {
          const parsed: Message[] = JSON.parse(stored);
          if (parsed.length > 1) setMessages(parsed);
        }
      } catch {
      } finally {
        setSessionLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)).catch(
      () => {},
    );
  }, [messages, sessionLoaded]);

  // ── Клавиатура ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (route.params?.initialQuery) {
      handleSendMessage(route.params.initialQuery);
      navigation.setParams({ initialQuery: undefined });
    }
  }, [route.params?.initialQuery]);

  // ── Очистка чата ─────────────────────────────────────────────────────────────

  const handleClearChat = () => {
    Alert.alert(
      "Очистить чат",
      "Вся история диалога будет удалена. Продолжить?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Очистить",
          style: "destructive",
          onPress: async () => {
            setMessages([WELCOME_MESSAGE]);
            AsyncStorage.removeItem(CHAT_STORAGE_KEY).catch(() => {});
          },
        },
      ],
    );
  };

  // ── Отправка ─────────────────────────────────────────────────────────────────

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    Keyboard.dismiss();

    const historyPayload = messages
      .filter((msg) => msg.id !== "welcome")
      .map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
        ...(msg.search_params ? { search_params: msg.search_params } : {}),
      }));

    setMessages((prev) => [
      ...prev,
      { id: generateId(), sender: "user", text: textToSend.trim() },
    ]);
    setInputQuery("");
    setIsLoading(true);

    try {
      const response = await api.post("/dishes/search/chat", {
        query: textToSend.trim(),
        history: historyPayload,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: "ai",
          text: response.data.message,
          dishes: response.data.dishes,
          search_params: response.data.search_params,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: "ai",
          text: "Извините, произошла ошибка подключения к серверу. Попробуйте ещё раз.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (itemName: string) => {
    setToastMessage(`${itemName} добавлен в корзину`);
    setToastVisible(true);
  };

  // ── Рендер текста ─────────────────────────────────────────────────────────────

  const renderMessageText = (text: string, isUser: boolean) =>
    text.split("**").map((part, i) => (
      <Text
        key={i}
        style={isUser ? styles.textUser : styles.textAI}
        weight={i % 2 === 1 ? "bold" : "medium"}
      >
        {part}
      </Text>
    ));

  // ── Рендер сообщения ──────────────────────────────────────────────────────────

  const renderMessageItem = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.sender === "user";
      const chips = buildFilterChips(item.search_params);
      const isEmpty =
        !isUser && item.dishes !== undefined && item.dishes.length === 0;

      return (
        <View
          style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAI]}
        >
          {!isUser && (
            <View style={styles.avatarContainer}>
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
              </View>
            </View>
          )}

          <View style={styles.messageContent}>
            <View
              style={[
                styles.bubble,
                isUser ? styles.bubbleUser : styles.bubbleAI,
              ]}
            >
              <Text
                style={isUser ? styles.textUser : styles.textAI}
                weight="medium"
              >
                {renderMessageText(item.text, isUser)}
              </Text>
            </View>

            {!isUser && chips.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {chips.map((chip, idx) => (
                  <View key={idx} style={styles.filterChip}>
                    <Ionicons
                      name="options-outline"
                      size={11}
                      color={COLORS.primary}
                    />
                    <Text style={styles.filterChipText} weight="medium">
                      {chip}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {!isUser && item.dishes && item.dishes.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dishesCarousel}
              >
                {item.dishes.map((dish) => (
                  <View key={dish.id} style={styles.cardContainer}>
                    <DishCard
                      id={dish.id.toString()}
                      title={dish.title}
                      description={dish.description}
                      price={`${parseFloat(dish.price.toString()).toFixed(2)} BYN`}
                      calories={dish.calories?.toString() || "0"}
                      image={dish.image}
                      weight={dish.weight ? `${dish.weight} г` : "350 г"}
                      onAdd={() => showToast(dish.title)}
                      onPress={() =>
                        navigation.navigate("Main", {
                          screen: "Главная",
                          params: {
                            screen: "DishDetails",
                            params: { id: dish.id },
                          },
                        })
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            )}

            {isEmpty && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle} weight="bold">
                  Ничего не нашлось
                </Text>
                <Text style={styles.emptySubtitle}>
                  Попробуйте изменить запрос или убрать фильтры
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() =>
                    handleSendMessage("Покажи что-нибудь вкусное и полезное")
                  }
                >
                  <Text style={styles.emptyButtonText} weight="medium">
                    Показать популярное
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      );
    },
    [navigation],
  );

  const lastAiMessage = [...messages]
    .reverse()
    .find((m) => m.sender === "ai" && m.id !== "welcome");
  const hasConversation = messages.length > 1;
  const isInputEmpty = !inputQuery.trim();

  const inputPaddingBottom =
    Platform.OS === "ios"
      ? keyboardHeight > 0
        ? 10
        : insets.bottom > 0
          ? insets.bottom
          : 16
      : keyboardHeight > 0
        ? keyboardHeight + 40
        : 40;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <Toast
          visible={toastVisible}
          message={toastMessage}
          onHide={() => setToastVisible(false)}
        />

        {/* Шапка */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} weight="bold">
              ИИ-Диетолог
            </Text>
          </View>
          {hasConversation && (
            <TouchableOpacity onPress={handleClearChat} style={styles.clearBtn}>
              <Ionicons
                name="trash-outline"
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messagesList}
          style={styles.flatList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingBubble}>
                <ActivityIndicator
                  size="small"
                  color={COLORS.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.loadingText}>Подбираю блюда...</Text>
              </View>
            ) : null
          }
        />

        {/* Начальные подсказки */}
        {!hasConversation && (
          <View style={styles.suggestionsGrid}>
            {INITIAL_SUGGESTIONS.map((item) => (
              <TouchableOpacity
                key={item.text}
                style={styles.suggestionCard}
                onPress={() => handleSendMessage(item.text)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionIcon}>{item.icon}</Text>
                <Text style={styles.suggestionText} weight="medium">
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Контекстные ответы */}
        {hasConversation && !isLoading && lastAiMessage && (
          <View style={styles.contextRepliesWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.contextReplies}
              keyboardShouldPersistTaps="handled"
            >
              {CONTEXT_REPLIES.map((item) => (
                <TouchableOpacity
                  key={item.text}
                  style={styles.contextReplyChip}
                  onPress={() => handleSendMessage(item.text)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={13}
                    color={COLORS.textLight}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={styles.contextReplyText} weight="medium">
                    {item.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Строка ввода */}
        {/* Строка ввода */}
        <View
          style={[styles.inputContainer, { paddingBottom: inputPaddingBottom }]}
        >
          <SearchBar
            placeholder="Спросите ИИ (например: 'ужин с белком')"
            value={inputQuery}
            onChangeText={setInputQuery}
            onSubmitEditing={() => handleSendMessage(inputQuery)}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Стили ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  kavContainer: { flex: 1 },
  flatList: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SIZES.padding,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "#FFFFFF",
  },
  backBtn: { marginRight: 15 },
  clearBtn: { padding: 6, borderRadius: 20 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, color: COLORS.text },

  messagesList: { padding: SIZES.padding, paddingBottom: 12 },

  messageRow: { flexDirection: "row", marginBottom: 20 },
  rowUser: { alignSelf: "flex-end", maxWidth: "85%" },
  rowAI: { alignSelf: "flex-start", maxWidth: "93%" },

  avatarContainer: {
    marginRight: 8,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  messageContent: { flexShrink: 1 },

  bubble: { padding: 13, borderRadius: 18 },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
    alignSelf: "flex-end",
  },
  bubbleAI: {
    backgroundColor: "#F4F5F7",
    borderBottomLeftRadius: 4,
    alignSelf: "flex-start",
  },
  textUser: { color: "#FFFFFF", fontSize: 15, lineHeight: 22 },
  textAI: { color: COLORS.text, fontSize: 15, lineHeight: 22 },

  chipsRow: { flexDirection: "row", marginTop: 8, paddingBottom: 2, gap: 6 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  filterChipText: { fontSize: 12, color: COLORS.primary },

  // ИЗМЕНЕНО: Добавлен gap для автоматических отступов между карточками
  dishesCarousel: {
    marginTop: 10,
    paddingBottom: 8,
  },
  // ИЗМЕНЕНО: Убран marginRight, чтобы не ломать крайние отступы при прокрутке
  cardContainer: {
    width: 170,
  },

  emptyState: {
    marginTop: 12,
    backgroundColor: "#F4F5F7",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: {
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 4,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 14,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 100,
  },
  emptyButtonText: { fontSize: 13, color: "#FFFFFF" },

  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F4F5F7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    marginLeft: 34,
    marginBottom: 12,
  },
  loadingText: { color: COLORS.textLight, fontSize: 14 },

  suggestionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SIZES.padding,
    paddingBottom: 10,
    gap: 8,
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F5F7",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 100,
  },
  suggestionIcon: { fontSize: 15, marginRight: 7 },
  suggestionText: { fontSize: 14, color: COLORS.text },

  contextRepliesWrapper: {
    height: 50,
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  contextReplies: {
    paddingHorizontal: SIZES.padding,
    gap: 8,
    alignItems: "center",
  },
  contextReplyChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F5F7",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 100,
  },
  contextReplyText: { fontSize: 13, color: COLORS.textLight },

  inputContainer: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  searchBarContainer: { flex: 1 },
  sendButton: {
    marginLeft: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 2,
  },
  sendButtonActive: { backgroundColor: COLORS.primary },
});
