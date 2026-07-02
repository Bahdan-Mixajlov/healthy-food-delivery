/**
 * SearchBar.tsx
 * Компонент поиска с голосовым вводом (iOS / Android / Web).
 *
 * Зависимости:
 *   - @react-native-voice/voice   — нативный STT (iOS + Android)
 *   - expo-av                     — запрос разрешения на микрофон
 *
 * На Web используется нативный браузерный SpeechRecognition API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { FontAwesome, FontAwesome6 } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";

// --------------------------------------------------------------------------
// Тип-заглушка для Web SpeechRecognition (не входит в @types/react-native)
// --------------------------------------------------------------------------
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}
// --------------------------------------------------------------------------

export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
}

// ── Хелперы динамической загрузки нативного модуля ──────────────────────────
type VoiceModule = typeof import("@react-native-voice/voice").default;

let _voiceModule: VoiceModule | null = null;

async function getVoice(): Promise<VoiceModule | null> {
  if (Platform.OS === "web") return null;
  if (_voiceModule) return _voiceModule;
  try {
    const mod = await import("@react-native-voice/voice");
    _voiceModule = mod.default;
    return _voiceModule;
  } catch {
    console.warn("[SearchBar] @react-native-voice/voice не найден.");
    return null;
  }
}

// ── Хелпер запроса разрешения на микрофон ───────────────────────────────────
async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    const { Audio } = await import("expo-av");
    const { granted } = await Audio.requestPermissionsAsync();
    return granted;
  } catch {
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────

export default function SearchBar({
  placeholder = "Поиск",
  value = "",
  onChangeText,
  onSubmitEditing,
}: SearchBarProps) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Анимация масштаба (пульсации) только для ауры
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Анимация прозрачности (дыхания) только для ауры
  const auraOpacityAnim = useRef(new Animated.Value(1)).current;
  const auraLoop = useRef<Animated.CompositeAnimation | null>(null);

  const webRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // ── Пульс-анимация и дыхание ауры ──────────────────────────────────────
  const startPulse = useCallback(() => {
    // Плавная пульсация размера ауры
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    // Плавное затухание/свечение ауры
    auraLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(auraOpacityAnim, {
          toValue: 0.2,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(auraOpacityAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.current.start();
    auraLoop.current.start();
  }, [pulseAnim, auraOpacityAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    auraLoop.current?.stop();
    pulseAnim.setValue(1);
    auraOpacityAnim.setValue(1);
  }, [pulseAnim, auraOpacityAnim]);

  // ── Очистка при размонтировании ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPulse();
      if (Platform.OS !== "web") {
        getVoice().then((Voice) => Voice?.destroy().catch(() => {}));
      } else {
        webRecognitionRef.current?.abort();
      }
    };
  }, [stopPulse]);

  // ── Остановка записи ────────────────────────────────────────────────────
  const stopListening = useCallback(async () => {
    setIsListening(false);
    stopPulse();

    if (Platform.OS === "web") {
      webRecognitionRef.current?.stop();
      webRecognitionRef.current = null;
    } else {
      const Voice = await getVoice();
      try {
        await Voice?.stop();
        await Voice?.destroy();
        Voice?.removeAllListeners();
      } catch {
        /* ignore */
      }
    }
  }, [stopPulse]);

  // ── Старт записи — WEB ──────────────────────────────────────────────────
  const startListeningWeb = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Голосовой поиск не поддерживается в этом браузере.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ru-RU";
    recognition.interimResults = true;
    recognition.continuous = false;

    webRecognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");

      console.log("Браузер распознал:", currentTranscript);

      if (onChangeText) {
        onChangeText(currentTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Ошибка распознавания Web API:", event.error);
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Ошибка: ${event.error}`);
      }
      setIsListening(false);
      stopPulse();
    };

    recognition.onend = () => {
      setIsListening(false);
      stopPulse();
      webRecognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
      setError(null);
      startPulse();
    } catch (e) {
      console.error("Не удалось запустить распознавание", e);
    }
  }, [onChangeText, startPulse, stopPulse]);

  // ── Старт записи — NATIVE ───────────────────────────────────────────────
  const startListeningNative = useCallback(async () => {
    console.log("=== ГОЛОС [1]: Нажат микрофон ===");
    const hasPermission = await requestMicPermission();
    console.log("=== ГОЛОС [2]: Результат проверки прав ===", hasPermission);
    if (!hasPermission) {
      setError("Нет доступа к микрофону.");
      return;
    }

    const Voice = await getVoice();
    console.log(
      "=== ГОЛОС [3]: Модуль Voice успешно импортирован? ===",
      !!Voice,
    );
    if (!Voice) {
      setError("Голосовой поиск недоступен.");
      return;
    }

    try {
      console.log("=== ГОЛОС [4]: Очистка старых слушателей ===");
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch (e) {
      console.log("=== ГОЛОС [5]: Ошибка при очистке (это нормально) ===", e);
    }

    Voice.onSpeechStart = (e) =>
      console.log("=== ГОЛОС EVENT: Начало записи (onSpeechStart) ===", e);
    Voice.onSpeechRecognized = (e) =>
      console.log(
        "=== ГОЛОС EVENT: Речь распознана (onSpeechRecognized) ===",
        e,
      );
    Voice.onSpeechEnd = () => {
      console.log("=== ГОЛОС EVENT: Запись завершена (onSpeechEnd) ===");
      setIsListening(false);
      stopPulse();
    };
    Voice.onSpeechError = (e) => {
      console.log("=== ГОЛОС EVENT: Ошибка (onSpeechError) ===", e.error);
      const code = e.error?.code ?? "";
      if (code !== "5" && code !== "7") {
        setError(`Ошибка распознавания: ${e.error?.message ?? code}`);
      }
      setIsListening(false);
      stopPulse();
    };
    Voice.onSpeechResults = (e) => {
      console.log("=== ГОЛОС EVENT: Результаты (onSpeechResults) ===", e.value);
      const result = e.value?.[0];
      if (result) onChangeText?.(result);
      setIsListening(false);
      stopPulse();
    };
    Voice.onSpeechPartialResults = (e) => {
      console.log(
        "=== ГОЛОС EVENT: Промежуточные результаты (onSpeechPartialResults) ===",
        e.value,
      );
      const partial = e.value?.[0];
      if (partial) onChangeText?.(partial);
    };

    setError(null);
    setIsListening(true);
    startPulse();

    try {
      console.log("=== ГОЛОС [6]: Запуск Voice.start('ru-RU') ===");
      await Voice.start("ru-RU");
      console.log("=== ГОЛОС [7]: Метод Voice.start() успешно выполнился ===");
    } catch (err: any) {
      console.error(
        "=== ГОЛОС [ОШИБКА]: Сбой при старте нативного движка ===",
        err,
      );
      setError(`Ошибка старта: ${err.message || err}`);
      setIsListening(false);
      stopPulse();
    }
  }, [onChangeText, startPulse, stopPulse]);

  // ── Переключатель ───────────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (isListening) {
      await stopListening();
      return;
    }
    if (Platform.OS === "web") {
      startListeningWeb();
    } else {
      await startListeningNative();
    }
  }, [isListening, stopListening, startListeningWeb, startListeningNative]);

  // ── Рендер ──────────────────────────────────────────────────────────────
  const micColor = isListening ? COLORS.primary : COLORS.textLight;
  const containerBorderColor = error
    ? COLORS.error
    : isListening
      ? COLORS.primary
      : "transparent";

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: containerBorderColor,
          borderWidth: error || isListening ? 1.5 : 0,
        },
      ]}
    >
      {/* Иконка поиска (слева) */}
      <FontAwesome
        name="search"
        size={18}
        color={COLORS.textLight}
        style={styles.searchIcon}
      />

      {/* Текстовое поле */}
      <TextInput
        style={styles.input}
        placeholder={isListening ? "Говорите..." : (error ?? placeholder)}
        placeholderTextColor={
          isListening ? COLORS.primary : error ? COLORS.error : COLORS.textLight
        }
        value={value}
        onChangeText={(t) => {
          setError(null);
          onChangeText?.(t);
        }}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        showSoftInputOnFocus={!isListening}
      />

      {/* Кнопка очистки */}
      {!!value && !isListening && (
        <Pressable
          onPress={() => onChangeText?.("")}
          hitSlop={8}
          style={styles.clearBtn}
          accessibilityLabel="Очистить поиск"
          accessibilityRole="button"
        >
          <FontAwesome name="times-circle" size={16} color={COLORS.textLight} />
        </Pressable>
      )}

      {/* Кнопка отправки (отображается при наличии текста) */}
      {!!value && !isListening && (
        <Pressable
          onPress={onSubmitEditing}
          style={styles.sendBtn}
          accessibilityLabel="Отправить"
          accessibilityRole="button"
        >
          <FontAwesome6 name="paper-plane" size={15} color="#FFFFFF" />
        </Pressable>
      )}

      {/* Кнопка микрофона */}
      {(!value || isListening) && (
        <Pressable
          onPress={handleMicPress}
          hitSlop={8}
          style={styles.micBtn}
          accessibilityLabel={
            isListening ? "Остановить запись" : "Голосовой поиск"
          }
          accessibilityRole="button"
        >
          {/* Пульсирующая фоновая аура (эффект дыхания) */}
          {isListening && (
            <Animated.View
              style={[
                styles.recordingAura,
                {
                  opacity: auraOpacityAnim,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          )}

          {/* Иконка микрофона */}
          <FontAwesome name="microphone" size={18} color={micColor} />
        </Pressable>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 0,
    fontFamily: "Inter_400Regular",
  },
  clearBtn: {
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 2, // Оптическое центрирование иконки самолетика
  },
  micBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  recordingAura: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
});
