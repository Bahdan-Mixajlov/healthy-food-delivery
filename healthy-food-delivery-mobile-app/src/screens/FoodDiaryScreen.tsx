import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import Text from "../components/CustomText";
import Toast from "../components/Toast";
import { COLORS, SIZES } from "../constants/theme";
import { api } from "../api";
import { supabase } from "../api/supabaseClient";

const MEAL_PHOTOS_BUCKET = "meal-photos";

interface MealItem {
  name: string;
  weight_g: number;
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
}

interface MealTotal {
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
}

interface MealRecognitionResult {
  items: MealItem[];
  total: MealTotal;
  confidence: "high" | "medium" | "low";
  note: string | null;
}

export interface MealLogEntry {
  id: string;
  imageUrl: string;
  time: string; // HH:mm, вычисляется из created_at
  items: MealItem[];
  total: MealTotal;
  confidence?: "high" | "medium" | "low";
}

interface MealLogApiRow {
  id_meal_log: number | string;
  image_url: string;
  items: MealItem[];
  total: MealTotal;
  confidence?: "high" | "medium" | "low";
  created_at: string;
}

const guessMimeType = (uri: string) => {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
};

const formatDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (formatDateKey(date) === formatDateKey(today)) return "Сегодня";
  if (formatDateKey(date) === formatDateKey(yesterday)) return "Вчера";

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
};

const mapApiRowToEntry = (row: MealLogApiRow): MealLogEntry => ({
  id: String(row.id_meal_log),
  imageUrl: row.image_url,
  time: new Date(row.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }),
  items: row.items || [],
  total: row.total || { calories: 0, proteins: 0, fats: 0, carbs: 0 },
  confidence: row.confidence,
});

export default function FoodDiaryScreen() {
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayMeals, setDayMeals] = useState<MealLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const selectedDateKey = formatDateKey(selectedDate);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  const fetchDayMeals = useCallback(async (dateKey: string) => {
    setIsLoadingHistory(true);
    try {
      const { data } = await api.get<MealLogApiRow[]>("/meal-log", {
        params: { date: dateKey },
      });
      setDayMeals((data || []).map(mapApiRowToEntry));
    } catch (e) {
      console.error("[FoodDiaryScreen] fetchDayMeals", e);
      showToast("Не удалось загрузить историю за этот день");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchDayMeals(selectedDateKey);
  }, [selectedDateKey, fetchDayMeals]);

  const changeDay = (days: number) => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(selectedDate.getDate() + 1 * days);
    setSelectedDate(nextDate);
  };

  const daySummary = dayMeals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.total?.calories || 0),
      proteins: acc.proteins + (meal.total?.proteins || 0),
      fats: acc.fats + (meal.total?.fats || 0),
      carbs: acc.carbs + (meal.total?.carbs || 0),
    }),
    { calories: 0, proteins: 0, fats: 0, carbs: 0 },
  );

  const processImage = async (uri: string, rawFile?: any) => {
    setIsProcessing(true);
    setStatusText("Загружаем фото...");

    try {
      let fileData: any;
      let mimeType = "image/jpeg";

      if (Platform.OS === "web" && rawFile) {
        fileData = rawFile;
        mimeType = rawFile.type || "image/jpeg";
      } else {
        const response = await fetch(uri);
        fileData = await response.arrayBuffer();
        mimeType = guessMimeType(uri);
      }

      const ext = mimeType.split("/")[1]?.replace("+xml", "") || "jpeg";
      const fileName = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(MEAL_PHOTOS_BUCKET)
        .upload(fileName, fileData, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(MEAL_PHOTOS_BUCKET).getPublicUrl(fileName);

      setStatusText("Распознаём блюда через ИИ...");

      await api.post<MealRecognitionResult>("/meal-log", {
        image_url: publicUrl,
      });

      await fetchDayMeals(selectedDateKey);
      showToast("Приём пищи успешно добавлен!");
    } catch (err: any) {
      console.error("[FoodDiaryScreen]", err);
      if (err?.response) {
        console.error("Server Error:", err.response.data);
      }
      showToast("Не удалось обработать фото. Попробуйте снова.");
    } finally {
      setIsProcessing(false);
      setStatusText("");
    }
  };

  const pickFromCamera = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Нет доступа",
          "Разрешите доступ к камере в настройках устройства.",
        );
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: Platform.OS !== "web",
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      processImage(asset.uri, (asset as any).file);
    }
  };

  const pickFromGallery = async () => {
    if (Platform.OS !== "web") {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Нет доступа",
          "Разрешите доступ к фото в настройках устройства.",
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: Platform.OS !== "web",
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      processImage(asset.uri, (asset as any).file);
    }
  };

  const handleAddMeal = () => {
    if (isProcessing) return;

    if (Platform.OS === "web") {
      pickFromGallery();
      return;
    }

    Alert.alert("Добавить приём пищи", "Откуда взять фотографию?", [
      { text: "Отмена", style: "cancel" },
      { text: "Камера", onPress: pickFromCamera },
      { text: "Галерея", onPress: pickFromGallery },
    ]);
  };

  const handleDeleteMeal = (id: string) => {
    const doDelete = async () => {
      try {
        await api.delete(`/meal-log/${id}`);
        setDayMeals((prev) => prev.filter((m) => m.id !== id));
        showToast("Приём пищи удалён");
      } catch (e) {
        console.error("[FoodDiaryScreen] delete", e);
        showToast("Не удалось удалить запись");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Удалить этот приём пищи?")) {
        doDelete();
      }
    } else {
      Alert.alert("Удаление", "Вы уверены, что хотите удалить эту запись?", [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} weight="bold">
          Дневник питания
        </Text>

        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => changeDay(-1)}
          >
            <Ionicons name="chevron-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.dateInfo}>
            <Text style={styles.dateText} weight="bold">
              {formatDisplayDate(selectedDate)}
            </Text>
            <Text style={styles.dateSubtext}>
              {selectedDate.toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => changeDay(1)}
          >
            <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dailyCard}>
          <Text style={styles.dailyCardLabel}>Итого за день</Text>
          <Text style={styles.totalCalories} weight="bold">
            {Math.round(daySummary.calories)}{" "}
            <Text style={{ fontSize: 16, color: "#FFFFFFCC" }}>ккал</Text>
          </Text>

          <View style={styles.macrosRow}>
            <View style={styles.macroCol}>
              <Text style={styles.macroValue} weight="bold">
                {Math.round(daySummary.proteins)} г
              </Text>
              <Text style={styles.macroLabel}>Белки</Text>
            </View>

            <View style={styles.macroDivider} />

            <View style={styles.macroCol}>
              <Text style={styles.macroValue} weight="bold">
                {Math.round(daySummary.fats)} г
              </Text>
              <Text style={styles.macroLabel}>Жиры</Text>
            </View>

            <View style={styles.macroDivider} />

            <View style={styles.macroCol}>
              <Text style={styles.macroValue} weight="bold">
                {Math.round(daySummary.carbs)} г
              </Text>
              <Text style={styles.macroLabel}>Углеводы</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.addButton, isProcessing && { opacity: 0.6 }]}
          onPress={handleAddMeal}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <View style={styles.rowCenter}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.addButtonText} weight="semibold">
                {statusText || "Обработка..."}
              </Text>
            </View>
          ) : (
            <View style={styles.rowCenter}>
              <Ionicons name="camera" size={22} color="#FFF" />
              <Text style={styles.addButtonText} weight="semibold">
                Добавить блюдо по фото
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle} weight="bold">
            Приёмы пищи ({dayMeals.length})
          </Text>
        </View>

        {isLoadingHistory ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : dayMeals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="restaurant-outline"
              size={48}
              color={COLORS.textLight}
            />
            <Text style={styles.emptyText}>За этот день ещё нет записей</Text>
            <Text style={styles.emptySubtext}>
              Сфотографируйте вашу еду, чтобы рассчитать калории и БЖУ
            </Text>
          </View>
        ) : (
          dayMeals.map((meal) => (
            <View key={meal.id} style={styles.mealCard}>
              <View style={styles.mealCardHeader}>
                <View style={styles.mealTimeBadge}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={COLORS.textLight}
                  />
                  <Text style={styles.mealTimeText} weight="medium">
                    {meal.time}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleDeleteMeal(meal.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={COLORS.error}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.mealContentRow}>
                {meal.imageUrl ? (
                  <Image
                    source={{ uri: meal.imageUrl }}
                    style={styles.mealThumb}
                    resizeMode="cover"
                  />
                ) : null}

                <View style={styles.mealInfo}>
                  <Text style={styles.mealCalories} weight="bold">
                    {Math.round(meal.total.calories)} ккал
                  </Text>
                  <Text style={styles.mealMacrosSummary}>
                    Б: {Math.round(meal.total.proteins)}г • Ж:{" "}
                    {Math.round(meal.total.fats)}г • У:{" "}
                    {Math.round(meal.total.carbs)}г
                  </Text>
                </View>
              </View>

              {meal.items && meal.items.length > 0 && (
                <View style={styles.dishItemsList}>
                  {meal.items.map((item, idx) => (
                    <View key={idx} style={styles.dishItemRow}>
                      <Text style={styles.dishName} numberOfLines={1}>
                        • {item.name} (~{Math.round(item.weight_g)} г)
                      </Text>
                      <Text style={styles.dishCals} weight="medium">
                        {Math.round(item.calories)} ккал
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    color: COLORS.text,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.inputBg,
    borderRadius: SIZES.radius,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  dateNavBtn: {
    padding: 6,
    cursor: "pointer" as any,
  },
  dateInfo: {
    alignItems: "center",
  },
  dateText: {
    fontSize: 15,
    color: COLORS.text,
  },
  dateSubtext: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  content: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: 40,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  dailyCard: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius + 4,
    padding: 20,
    marginTop: 8,
    marginBottom: 16,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  dailyCardLabel: {
    fontSize: 13,
    color: "#FFFFFFBB",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  totalCalories: {
    fontSize: 34,
    color: "#FFF",
    marginVertical: 4,
  },
  macrosRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  macroCol: {
    alignItems: "center",
    flex: 1,
  },
  macroValue: {
    fontSize: 16,
    color: "#FFF",
  },
  macroLabel: {
    fontSize: 12,
    color: "#FFFFFFAA",
    marginTop: 2,
  },
  macroDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    cursor: "pointer" as any,
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 15,
  },
  listHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    color: COLORS.text,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: COLORS.inputBg,
    borderRadius: SIZES.radius,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: "center",
    marginTop: 4,
  },
  mealCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: SIZES.radius,
    padding: 14,
    marginBottom: 12,
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  mealTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mealTimeText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  mealContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mealThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  mealInfo: {
    flex: 1,
  },
  mealCalories: {
    fontSize: 18,
    color: COLORS.text,
  },
  mealMacrosSummary: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  dishItemsList: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  dishItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  dishName: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  dishCals: {
    fontSize: 13,
    color: COLORS.textLight,
  },
});
