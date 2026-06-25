import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Text from "../components/CustomText";
import { COLORS, SIZES } from "../constants/theme";
import SearchBar from "../components/SearchBar";
import PlanCard from "../components/PlanCard";
import DishItem from "../components/DishItem";
import Skeleton from "../components/Skeleton";
import Toast from "../components/Toast";
import { api } from "../api";

const CATEGORIES = ["Все", "Салаты", "Супы", "Горячее", "Завтраки", "Напитки"];

const HomeSkeleton = () => (
  <View style={{ paddingHorizontal: SIZES.padding }}>
    <View style={{ flexDirection: "row", marginBottom: 30, marginTop: 10 }}>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton
          key={i}
          width={90}
          height={44}
          borderRadius={24}
          style={{ marginRight: 10 }}
        />
      ))}
    </View>

    <Skeleton
      width={180}
      height={28}
      borderRadius={8}
      style={{ marginBottom: 16, marginLeft: 0 }}
    />
    <View style={{ flexDirection: "row", marginBottom: 30 }}>
      <Skeleton
        width={260}
        height={160}
        borderRadius={24}
        style={{ marginRight: 15 }}
      />
      <Skeleton width={260} height={160} borderRadius={24} />
    </View>

    <Skeleton
      width={150}
      height={28}
      borderRadius={8}
      style={{ marginBottom: 16 }}
    />
    {[1, 2, 3].map((i) => (
      <View
        key={i}
        style={{ flexDirection: "row", marginBottom: 16, alignItems: "center" }}
      >
        <Skeleton width={70} height={70} borderRadius={16} />
        <View style={{ marginLeft: 15, flex: 1 }}>
          <Skeleton
            width="80%"
            height={16}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <Skeleton width="40%" height={14} borderRadius={4} />
        </View>
      </View>
    ))}
  </View>
);

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [plans, setPlans] = useState<any[]>([]);
  const [popularDishes, setPopularDishes] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isPopularLoading, setIsPopularLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");

  // ФЛАГ РЕЖИМА ПОИСКА: false - обычный, true - умный ИИ
  const [isSmart, setIsSmart] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsError(false);
    try {
      const [plansRes, dishesRes] = await Promise.all([
        api.get("/plans"),
        api.get("/dishes"),
      ]);
      setPlans(plansRes.data);
      setPopularDishes(dishesRes.data.slice(0, 5));
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInitialData();
    setActiveCategory(0);
  }, []);

  const fetchFilteredPopular = async (categoryName: string) => {
    setIsPopularLoading(true);
    try {
      const params = categoryName === "Все" ? {} : { category: categoryName };
      const response = await api.get("/dishes", { params });
      setPopularDishes(response.data.slice(0, 5));
    } catch (error) {
      console.error(error);
    } finally {
      setIsPopularLoading(false);
    }
  };

  const handleCategoryPress = (index: number) => {
    setActiveCategory(index);
    fetchFilteredPopular(CATEGORIES[index]);
  };

  const handleSearchSubmit = () => {
    if (search.trim().length > 0) {
      if (isSmart) {
        // Если включен ИИ — переходим на новый экран чата!
        navigation.navigate("AIChatScreen", { initialQuery: search.trim() });
      } else {
        // Если выключен — переходим на обычное меню
        navigation.navigate("Меню", {
          initialSearch: search.trim(),
          isSmart: false,
        });
      }
      setSearch("");
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <SearchBar
            placeholder="Поиск блюд"
            value=""
            onChangeText={() => {}}
          />
        </View>
        <HomeSkeleton />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="cloud-offline-outline"
          size={64}
          color={COLORS.textLight}
        />
        <Text style={styles.errorText} weight="bold">
          Ошибка соединения
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialData}>
          <Text style={styles.retryBtnText} weight="bold">
            Обновить
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />

      {/* Новая строка поиска с переключателем ИИ */}
      {/* Новая строка поиска с переключателем ИИ */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <SearchBar
              placeholder={isSmart ? "ИИ: обед до 400 ккал..." : "Поиск блюд"}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={handleSearchSubmit}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.smartSearchBtn,
              isSmart ? styles.smartSearchBtnActive : null,
            ]}
            onPress={() => {
              if (search.trim().length === 0) {
                // Если строка поиска пуста — сразу переходим в чистый чат с подсказками!
                navigation.navigate("AIChatScreen");
              } else {
                // Если текст есть — переключаем режим
                setIsSmart(!isSmart);
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSmart ? "sparkles" : "sparkles-outline"}
              size={20}
              color={isSmart ? "#FFFFFF" : COLORS.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.categoriesWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleCategoryPress(i)}
                style={[
                  styles.categoryBtn,
                  activeCategory === i && styles.categoryBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    activeCategory === i && styles.categoryTextActive,
                  ]}
                  weight={activeCategory === i ? "bold" : "medium"}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} weight="bold">
            Планы питания
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.plansList}
          >
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                title={plan.title}
                calories={`${plan.calories} ккал`}
                price={`${parseFloat(plan.price).toFixed(0)} BYN/день`}
                image={plan.image}
                onPress={() =>
                  navigation.navigate("PlanDetails", { id: plan.id })
                }
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} weight="bold">
              Популярное
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Меню")}>
              <Text style={styles.seeAll}>Все</Text>
            </TouchableOpacity>
          </View>

          {isPopularLoading ? (
            <View style={{ paddingHorizontal: SIZES.padding }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonItemRow}>
                  <Skeleton width={70} height={70} borderRadius={16} />
                  <View style={{ marginLeft: 15, flex: 1 }}>
                    <Skeleton
                      width="80%"
                      height={16}
                      borderRadius={4}
                      style={{ marginBottom: 8 }}
                    />
                    <Skeleton width="40%" height={14} borderRadius={4} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.popularList}>
              {popularDishes.length > 0 ? (
                popularDishes.map((dish) => (
                  <DishItem
                    key={dish.id}
                    id={dish.id.toString()}
                    title={dish.title}
                    description={dish.description}
                    price={`${parseFloat(dish.price).toFixed(2)} BYN`}
                    weight={dish.weight ? `${dish.weight} г` : "350 г"}
                    image={dish.image}
                    calories={dish.calories}
                    onAdd={() => {
                      setToastMessage(`${dish.title} добавлен в корзину`);
                      setToastVisible(true);
                    }}
                    onPress={() =>
                      navigation.navigate("DishDetails", {
                        id: dish.id,
                        title: dish.title,
                        description: dish.description,
                        price: `${parseFloat(dish.price).toFixed(2)} BYN`,
                        weight: dish.weight ? `${dish.weight} г` : "350 г",
                        calories: dish.calories,
                        image: dish.image,
                      })
                    }
                  />
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="fast-food-outline"
                    size={48}
                    color={COLORS.inputBg}
                  />
                  <Text style={styles.emptyText}>Блюд не найдено</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 20,
    paddingBottom: 16,
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
  categoriesWrapper: { marginBottom: 24 },
  categoriesContainer: { paddingHorizontal: SIZES.padding, paddingBottom: 8 },
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  categoryText: { color: COLORS.text, fontSize: 15 },
  categoryTextActive: { color: "#FFFFFF" },
  section: { marginBottom: 30 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: SIZES.padding,
  },
  sectionTitle: {
    fontSize: 22,
    color: COLORS.text,
    marginLeft: SIZES.padding,
    marginBottom: 16,
  },
  seeAll: { color: COLORS.primary, fontSize: 14, marginBottom: 14 },
  plansList: { paddingLeft: SIZES.padding, paddingRight: SIZES.padding - 10 },
  popularList: { paddingHorizontal: SIZES.padding },
  emptyContainer: { alignItems: "center", marginTop: 20, paddingBottom: 40 },
  emptyText: { textAlign: "center", color: COLORS.textLight, marginTop: 12 },
  errorText: { fontSize: 18, color: COLORS.text, marginTop: 16 },
  retryBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 16,
  },
  retryBtnText: { color: "#FFF" },
  skeletonItemRow: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "center",
  },
});
