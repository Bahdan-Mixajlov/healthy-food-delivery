import { View, Image, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";
import { useCartStore } from "../store/cartStore";
import Text from "./CustomText";

interface DishItemProps {
  id: string;
  title: string;
  description: string;
  price: string;
  weight: string;
  image: string;
  calories: number;
  onPress?: () => void;
  onAdd?: () => void;
}

export default function DishItem({
  id,
  title,
  description,
  price,
  weight,
  calories,
  image,
  onPress,
  onAdd,
}: DishItemProps) {
  const addItem = useCartStore((state) => state.addItem);

  const handleAdd = (e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();

    const numericPrice = parseFloat(price.replace(/[^\d.]/g, ""));
    addItem({
      id,
      title,
      weight,
      price: numericPrice,
      image,
      calories: Number(calories),
    });

    if (onAdd) onAdd();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image source={{ uri: image }} style={styles.image} />
      <View style={styles.info}>
        <Text style={styles.title} weight="bold">
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.weight}>{weight}</Text>
          <View style={styles.priceBadge}>
            <Text style={styles.priceText} weight="bold">
              {price}
            </Text>
            <TouchableOpacity
              onPress={(e) => handleAdd(e)}
              style={styles.plusWrapper}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: 24,
    alignItems: "center",
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 16,
  },
  info: {
    flex: 1,
    marginLeft: 16,
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weight: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  priceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  priceText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  plusWrapper: {
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  plusText: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    lineHeight: 20,
    marginTop: -2,
  },
});
