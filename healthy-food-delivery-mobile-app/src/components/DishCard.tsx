import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { COLORS } from "../constants/theme";
import { useCartStore } from "../store/cartStore";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import Text from "./CustomText";

interface DishCardProps {
  id: string;
  title: string;
  description: string;
  price: string;
  weight: string;
  calories: string | number;
  image: string;
  onPress?: () => void;
  onAdd?: () => void;
}

const screenWidth = Dimensions.get("window").width;
const cardWidth = (screenWidth - 48) / 2;

export default function DishCard({
  id,
  title,
  description,
  price,
  calories,
  image,
  weight,
  onPress,
  onAdd,
}: DishCardProps) {
  const addItem = useCartStore((state) => state.addItem);

  const handleAdd = (e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();

    const numericPrice = parseFloat(price.replace(/[^\d.]/g, ""));
    addItem({
      id,
      title,
      weight: weight,
      price: numericPrice,
      image,
      calories: Number(calories),
    });

    if (onAdd) {
      onAdd();
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.caloriesBadge}>
        <Text style={styles.caloriesText} weight="bold">
          <Ionicons name="flame" size={14} color="#E67E22" /> {calories} ккал
        </Text>
      </View>
      <Image source={{ uri: image }} style={styles.image} />
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1} weight="bold">
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.price} weight="bold">
            {price}
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={(e) => handleAdd(e)}
          >
            <FontAwesome5 name="plus" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  caloriesBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  caloriesText: { fontSize: 10, color: COLORS.text },
  image: {
    width: "100%",
    height: cardWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  infoContainer: { padding: 12 },
  title: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 12,
    height: 32,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  price: { fontSize: 14, color: COLORS.text },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
});
