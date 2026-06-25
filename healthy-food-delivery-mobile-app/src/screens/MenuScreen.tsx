import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Text from "../components/CustomText";
import DishCard from "../components/DishCard";
import SearchBar from "../components/SearchBar";
import Toast from "../components/Toast";
import Skeleton from "../components/Skeleton";

import { COLORS, SIZES } from "../constants/theme";
import { api } from "../api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CATEGORIES = ["Все", "Салаты", "Супы", "Горячее", "Завтраки", "Напитки"];

const DishSkeleton = () => (
  <View style={styles.skeletonCard}>
    <Skeleton width="100%" height={140} borderRadius={16} />
    <View style={{ marginTop: 12, gap: 6 }}>
      <Skeleton width="90%" height={18} borderRadius={4} />
      <Skeleton width="60%" height={14} borderRadius={4} />
      <View style={styles.skeletonFooter}>
        <Skeleton width="45%" height={22} borderRadius={4} />
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>
    </View>
  </View>
);

export default function MenuScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();

  const [activeCategory, setActiveCategory] = useState("Все");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");

  // Флаг умного поиска (false - обычный, true - Gemini)
  const [isSmart, setIsSmart] = useState(false);

  const [dishes, setDishes] = useState<any[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const skeletonData = useMemo(() => Array(6).fill({ id: "skeleton" }), []);

  // 1. ПРИНИМАЕМ ПАРАМЕТРЫ С ГЛАВНОГО ЭКРАНА (текст + режим поиска)
  useEffect(() => {
    if (route.params?.initialSearch) {
      setSearchQuery(route.params.initialSearch);
      setIsSmart(!!route.params.isSmart); // Принимаем и сохраняем состояние умного поиска
      setActiveCategory("Все");
      // Очищаем параметры навигации, чтобы они не срабатывали при каждом перерендере
      navigation.setParams({ initialSearch: undefined, isSmart: undefined });
    }
  }, [route.params?.initialSearch, route.params?.isSmart]);

  // 2. ДИНАМИЧЕСКИЙ ФЕТЧИНГ БЛЮД (Обычный поиск VS ИИ-поиск)
  const fetchDishes = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setIsInitialLoading(true);
      setIsError(false);

      try {
        const categoryParam =
          activeCategory === "Все" ? undefined : activeCategory;

        let response;

        // Если включен режим ИИ и есть поисковый запрос — шлем его на Gemini эндпоинт
        if (isSmart && searchQuery.trim().length > 0) {
          response = await api.get("/dishes/search/smart", {
            params: {
              query: searchQuery.trim(),
            },
          });
        } else {
          // Иначе делаем обычный запрос по совпадению букв и категориям
          response = await api.get("/dishes", {
            params: {
              category: categoryParam,
              search: searchQuery.trim() || undefined,
              sortBy: sortBy,
            },
          });
        }

        setDishes(response.data);
      } catch (error) {
        console.error("Ошибка при загрузке меню:", error);
        setIsError(true);
      } finally {
        setIsInitialLoading(false);
        setRefreshing(false);
      }
    },
    [activeCategory, searchQuery, sortBy, isSmart], // Добавили isSmart в зависимости
  );

  useEffect(() => {
    fetchDishes(dishes.length > 0);
  }, [activeCategory, sortBy, isSmart]); // Запрос перевызовется, если кликнуть по кнопке ИИ

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDishes(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDishes(true);
  };

  const showToast = (itemName: string) => {
    setToastMessage(`${itemName} добавлен в корзину`);
    setToastVisible(true);
  };

  const renderHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <Text style={styles.pageTitle} weight="bold">
          Меню
        </Text>

        {/* Умная поисковая строка с кнопкой-переключателем ИИ */}
        {/* Умная поисковая строка с переходом в ИИ-чат */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}>
              <SearchBar
                placeholder="Поиск блюд"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  if (searchQuery.trim().length > 0) {
                    navigation.navigate("Меню", {
                      initialSearch: searchQuery.trim(),
                    });
                    setSearchQuery("");
                  }
                }}
              />
            </View>
            <TouchableOpacity
              style={styles.smartSearchBtn}
              onPress={() => {
                // Мгновенный переход в чат с передачей текущего текста из поиска
                navigation.navigate("AIChatScreen", {
                  initialQuery: searchQuery.trim() || undefined,
                });
                setSearchQuery(""); // Очищаем строку поиска после перехода
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContainer}
          keyboardShouldPersistTaps="handled"
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => {
                setActiveCategory(cat);
                Keyboard.dismiss();
              }}
              style={[
                styles.categoryBtn,
                activeCategory === cat && styles.categoryBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  activeCategory === cat && styles.categoryTextActive,
                ]}
                weight="medium"
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sortContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { id: "default", label: "По умолчанию" },
              { id: "price_asc", label: "Сначала дешевые" },
              { id: "price_desc", label: "Сначала дорогие" },
              { id: "kcal_desc", label: "Калорийные" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.sortBtn,
                  sortBy === option.id && styles.sortBtnActive,
                ]}
                onPress={() => setSortBy(option.id)}
              >
                <Text
                  style={[
                    styles.sortBtnText,
                    sortBy === option.id && styles.sortBtnTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    ),
    [searchQuery, activeCategory, sortBy, isSmart], // Добавили isSmart в мемоизацию заголовка
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />

      <FlatList
        data={isInitialLoading ? skeletonData : dishes}
        keyExtractor={(item, index) =>
          isInitialLoading ? `sk-${index}` : item.id.toString()
        }
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          !isInitialLoading ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="search-outline"
                size={64}
                color={COLORS.inputBg}
              />
              <Text style={styles.emptyText} weight="medium">
                Ничего не найдено
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setActiveCategory("Все");
                }}
              >
                <Text style={{ color: COLORS.primary, marginTop: 12 }}>
                  Сбросить все фильтры
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (isInitialLoading) return <DishSkeleton />;

          return (
            <DishCard
              id={item.id.toString()}
              title={item.title}
              description={item.description}
              price={`${parseFloat(item.price).toFixed(2)} BYN`}
              calories={item.calories?.toString() || "0"}
              image={item.image}
              weight={item.weight ? `${item.weight} г` : "350 г"}
              onAdd={() => showToast(item.title)}
              onPress={() =>
                navigation.navigate("Главная", {
                  screen: "DishDetails",
                  params: { id: item.id },
                })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContainer: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: 40,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerContainer: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 32,
    color: COLORS.text,
    marginBottom: 20,
  },
  searchContainer: {
    marginBottom: 24,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  smartSearchBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  smartSearchBtnActive: {
    backgroundColor: COLORS.primary,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  categoriesScroll: {
    marginHorizontal: -SIZES.padding,
    marginBottom: 16,
  },
  categoriesContainer: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: 8,
  },
  categoryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: COLORS.inputBg,
    marginRight: 10,
  },
  categoryBtnActive: {
    backgroundColor: COLORS.primary,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  categoryText: {
    color: COLORS.text,
    fontSize: 15,
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F4F5F7",
    marginRight: 8,
  },
  sortBtnActive: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  sortBtnText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  sortBtnTextActive: {
    color: COLORS.primary,
    fontWeight: "bold",
  },
  emptyContainer: {
    marginTop: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textLight,
    marginTop: 10,
  },
  skeletonCard: {
    width: (SCREEN_WIDTH - SIZES.padding * 2 - 15) / 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  skeletonFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
});
