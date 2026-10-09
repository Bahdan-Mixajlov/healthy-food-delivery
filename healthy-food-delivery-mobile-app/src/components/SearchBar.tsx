/**
 * SearchBar.tsx
 * Компонент поиска с голосовым вводом (iOS / Android / Web).
 * Голосовой ввод работает в режиме push-to-talk:
 * зажали микрофон — идёт запись, отпустили — сообщение отправляется сразу.
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
  /**
   * Вызывается с финальным распознанным текстом сразу после того,
   * как пользователь отпустил кнопку микрофона (push-to-talk).
   * Предназначен для мгновенной отправки сообщения, минуя поле ввода.
   */
  onVoiceResult?: (text: string) => void;
  /**
   * Минимальная длительность удержания (мс), ниже которой нажатие
   * считается случайным тапом и запись отменяется без отправки.
   * По умолчанию 250мс.
   */
  minHoldDurationMs?: number;
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
  onVoiceResult,
  minHoldDurationMs = 250,
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

  // ── Служебные refs для push-to-talk ─────────────────────────────────────
  // Последний распознанный (финальный/промежуточный) текст.
  const lastTranscriptRef = useRef<string>("");
  // Флаг: пользователь уже отпустил кнопку, ждём финальный результат,
  // чтобы отправить его через onVoiceResult.
  const shouldSendOnStopRef = useRef(false);
  // Время нажатия — чтобы отфильтровать случайные короткие тапы.
  const pressStartTimeRef = useRef(0);
  // Предохранитель на случай, если событие завершения распознавания
  // (onend / onSpeechResults) не пришло вовсе.
  const sendFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearSendFallback = useCallback(() => {
    if (sendFallbackTimeoutRef.current) {
      clearTimeout(sendFallbackTimeoutRef.current);
      sendFallbackTimeoutRef.current = null;
    }
  }, []);

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
      clearSendFallback();
      if (Platform.OS !== "web") {
        getVoice().then((Voice) => Voice?.destroy().catch(() => {}));
      } else {
        webRecognitionRef.current?.abort();
      }
    };
  }, [stopPulse, clearSendFallback]);

  // ── Остановка записи (без отправки — используется и для "отмены") ──────
  const stopListening = useCallback(async () => {
    setIsListening(false);
    stopPulse();

    if (Platform.OS === "web") {
      // Финальный текст придёт в recognition.onend
      webRecognitionRef.current?.stop();
    } else {
      const Voice = await getVoice();
      try {
        // Финальный текст придёт в Voice.onSpeechResults / onSpeechEnd
        await Voice?.stop();
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
    // continuous: true, чтобы сессия не завершалась сама по себе,
    // пока пользователь держит палец на кнопке.
    recognition.continuous = true;

    webRecognitionRef.current = recognition;
    lastTranscriptRef.current = "";

    recognition.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");

      lastTranscriptRef.current = currentTranscript;

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

      // Сессия реально завершилась — если это произошло после
      // отпускания кнопки, отправляем накопленный текст.
      clearSendFallback();
      if (shouldSendOnStopRef.current && lastTranscriptRef.current.trim()) {
        onVoiceResult?.(lastTranscriptRef.current.trim());
      }
      shouldSendOnStopRef.current = false;
    };

    try {
      recognition.start();
      setIsListening(true);
      setError(null);
      startPulse();
    } catch (e) {
      console.error("Не удалось запустить распознавание", e);
    }
  }, [onChangeText, onVoiceResult, startPulse, stopPulse, clearSendFallback]);

  // ── Старт записи — NATIVE ───────────────────────────────────────────────
  const startListeningNative = useCallback(async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      setError("Нет доступа к микрофону.");
      return;
    }

    const Voice = await getVoice();
    if (!Voice) {
      setError("Голосовой поиск недоступен.");
      return;
    }

    try {
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch {
      /* ignore */
    }

    lastTranscriptRef.current = "";

    Voice.onSpeechStart = () => {};
    Voice.onSpeechRecognized = () => {};
    Voice.onSpeechEnd = () => {
      setIsListening(false);
      stopPulse();
    };
    Voice.onSpeechError = (e) => {
      const code = e.error?.code ?? "";
      if (code !== "5" && code !== "7") {
        setError(`Ошибка распознавания: ${e.error?.message ?? code}`);
      }
      setIsListening(false);
      stopPulse();

      // Если ошибка пришла уже после отпускания кнопки — просто
      // сбрасываем флаг отправки, отправлять нечего.
      clearSendFallback();
      shouldSendOnStopRef.current = false;
    };
    Voice.onSpeechResults = (e) => {
      const result = e.value?.[0];
      if (result) {
        lastTranscriptRef.current = result;
        onChangeText?.(result);

        // Кнопка уже отпущена — отправляем финальный текст сразу.
        if (shouldSendOnStopRef.current) {
          clearSendFallback();
          onVoiceResult?.(result.trim());
          shouldSendOnStopRef.current = false;
        }
      }
      setIsListening(false);
      stopPulse();
    };
    Voice.onSpeechPartialResults = (e) => {
      const partial = e.value?.[0];
      if (partial) {
        lastTranscriptRef.current = partial;
        onChangeText?.(partial);
      }
    };

    setError(null);
    setIsListening(true);
    startPulse();

    try {
      await Voice.start("ru-RU");
    } catch (err: any) {
      console.error("Сбой при старте нативного распознавания", err);
      setError(`Ошибка старта: ${err.message || err}`);
      setIsListening(false);
      stopPulse();
    }
  }, [onChangeText, onVoiceResult, startPulse, stopPulse, clearSendFallback]);

  // ── Push-to-talk: нажатие и отпускание ───────────────────────────────────
  const handlePressIn = useCallback(async () => {
    shouldSendOnStopRef.current = false;
    clearSendFallback();
    pressStartTimeRef.current = Date.now();

    if (Platform.OS === "web") {
      startListeningWeb();
    } else {
      await startListeningNative();
    }
  }, [startListeningWeb, startListeningNative, clearSendFallback]);

  const handlePressOut = useCallback(async () => {
    const heldFor = Date.now() - pressStartTimeRef.current;

    // Слишком короткое нажатие — считаем случайным тапом,
    // отменяем запись без отправки.
    if (heldFor < minHoldDurationMs) {
      shouldSendOnStopRef.current = false;
      await stopListening();
      return;
    }

    // Помечаем, что после получения финального результата
    // (onend / onSpeechResults) нужно отправить сообщение.
    shouldSendOnStopRef.current = true;
    await stopListening();

    // Предохранитель: если событие завершения не придёт за 1.5с
    // (например, распознаватель ничего не уловил), не оставляем
    // "зависший" флаг ожидания отправки.
    clearSendFallback();
    sendFallbackTimeoutRef.current = setTimeout(() => {
      shouldSendOnStopRef.current = false;
    }, 1500);
  }, [stopListening, minHoldDurationMs, clearSendFallback]);

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
        placeholder={
          isListening
            ? "Говорите... отпустите, чтобы отправить"
            : (error ?? placeholder)
        }
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
        editable={!isListening}
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

      {/* Кнопка микрофона (push-to-talk: зажать — говорить, отпустить — отправить) */}
      {(!value || isListening) && (
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          delayLongPress={0}
          hitSlop={8}
          style={styles.micBtn}
          accessibilityLabel={
            isListening
              ? "Отпустите, чтобы отправить"
              : "Зажмите для голосового ввода"
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
