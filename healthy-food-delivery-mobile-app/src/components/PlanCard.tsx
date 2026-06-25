import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import Text from "../components/CustomText";
import { COLORS } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";

interface PlanCardProps {
  title: string;
  calories: string;
  price: string;
  image: string;
  onPress?: () => void;
}

const screenWidth = Dimensions.get("window").width;
const cardWidth = screenWidth * 0.8;

export default function PlanCard({
  title,
  calories,
  price,
  image,
  onPress,
}: PlanCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.95}
    >
      <View style={styles.imageMask}>
        <Image source={{ uri: image }} style={styles.image} />

        <View style={styles.topBadge}>
          <Ionicons name="flame" size={14} color="#FF9500" />
          <Text style={styles.topBadgeText} weight="bold">
            {calories}
          </Text>
        </View>

        <View style={styles.glassFooter}>
          <View style={styles.textColumn}>
            <Text style={styles.cardLabel} weight="bold">
              ПЛАН ПИТАНИЯ
            </Text>
            <Text style={styles.title} weight="bold" numberOfLines={1}>
              {title}
            </Text>
          </View>

          <View style={styles.priceContainer}>
            <Text style={styles.priceText} weight="bold">
              {price.split(" ")[0]}
            </Text>
            <Text style={styles.currencyText} weight="bold">
              BYN
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    height: 250,
    marginRight: 18,
    marginBottom: 20,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  imageMask: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  topBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  topBadgeText: {
    fontSize: 12,
    color: "#1D1D1D",
    marginLeft: 4,
  },
  glassFooter: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  textColumn: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 9,
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 19,
    color: "#1D1D1D",
  },
  priceContainer: {
    backgroundColor: COLORS.primary,
    minWidth: 55,
    height: 45,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  priceText: {
    color: "#FFF",
    fontSize: 16,
    lineHeight: 18,
  },
  currencyText: {
    color: "#FFF",
    fontSize: 8,
  },
});
