import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "../constants/theme";
import Text from "../components/CustomText";

interface Message {
  id: string;
  text: string;
  sender: "client" | "courier";
  time: string;
}

export default function ChatScreen({ route, navigation }: any) {
  const { orderId, courierName, clientPhone } = route.params || {};

  const isSupport = orderId === "HELP";

  const displayName = courierName || (isSupport ? "Диспетчер" : "Клиент");
  const displayPhone = clientPhone || (isSupport ? "+375291234567" : "");
  const displayOrderId = orderId || "0";

  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const STORAGE_KEY = `@courier_chat_messages_${displayOrderId}`;

  useEffect(() => {
    loadMessages();
  }, [displayOrderId]);

  const loadMessages = async () => {
    try {
      const savedMessages = await AsyncStorage.getItem(STORAGE_KEY);

      const supportWelcome: Message[] = [
        {
          id: "w1",
          text: "Здравствуйте! Это диспетчерская служба. Какой у вас вопрос?",
          sender: "client",
          time: "09:00",
        },
      ];

      const clientWelcome: Message[] = [
        {
          id: "w1",
          text: "Здравствуйте! Подскажите, через сколько будете?",
          sender: "client",
          time: "12:10",
        },
      ];

      if (savedMessages !== null) {
        const parsed = JSON.parse(savedMessages);

        if (isSupport && parsed[0]?.text !== supportWelcome[0].text) {
          setMessages(supportWelcome);
          await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(supportWelcome),
          );
        } else {
          setMessages(parsed);
        }
      } else {
        const initial = isSupport ? supportWelcome : clientWelcome;
        setMessages(initial);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      }
    } catch (e) {
      console.error("Ошибка загрузки истории чата", e);
    }
  };

  const sendMessage = async () => {
    if (message.trim().length === 0) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message.trim(),
      sender: "courier",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setMessage("");

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedMessages));
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleCall = () => {
    const url = `tel:${displayPhone.replace(/[^\d+]/g, "")}`;
    Linking.openURL(url);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender === "courier";
    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.theirRow]}>
        <View
          style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}
        >
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {item.text}
          </Text>
          <Text style={[styles.timeText, isMe && styles.myTimeText]}>
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <FontAwesome6 name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerUser}>
          <View
            style={[styles.avatar, isSupport && { backgroundColor: "#F0F9F4" }]}
          >
            <FontAwesome6
              name={isSupport ? "headset" : "user-large"}
              size={18}
              color={isSupport ? COLORS.primary : COLORS.textLight}
              solid
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.clientName} weight="bold">
              {displayName}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>онлайн</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={handleCall} style={styles.callBtn}>
          <FontAwesome6 name="phone" size={16} color={COLORS.primary} solid />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View
          style={[
            styles.inputWrapper,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={
                isSupport ? "Ваш вопрос диспетчеру..." : "Написать клиенту..."
              }
              placeholderTextColor="#A0A0A0"
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                !message.trim() && styles.sendBtnDisabled,
              ]}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <FontAwesome6 name="paper-plane" size={18} color="#FFF" solid />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerUser: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F4F5F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerInfo: { justifyContent: "center" },
  clientName: { fontSize: 16, color: COLORS.text },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2ECC71",
    marginRight: 6,
  },
  statusText: { fontSize: 12, color: "#2ECC71" },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0F9F4",
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: "row", marginBottom: 14, width: "100%" },
  myRow: { justifyContent: "flex-end" },
  theirRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", padding: 14, borderRadius: 20 },
  myBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
    elevation: 1,
  },
  theirBubble: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  messageText: { fontSize: 15, color: "#333", lineHeight: 22 },
  myMessageText: { color: "#FFF" },
  timeText: {
    fontSize: 10,
    color: "#999",
    marginTop: 6,
    alignSelf: "flex-end",
  },
  myTimeText: { color: "rgba(255,255,255,0.7)" },
  inputWrapper: {
    backgroundColor: "#FFF",
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F5F7",
    borderRadius: 28,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    color: COLORS.text,
    paddingTop: Platform.OS === "ios" ? 10 : 5,
    paddingBottom: Platform.OS === "ios" ? 10 : 5,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#D1D5DB" },
});
