import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Text from "./CustomText";
import { COLORS } from "../constants/theme";

const STATUSES = [
  {
    id: "created",
    label: "Заказ принят",
    subLabel: "Ресторан уже начал обработку",
    icon: "receipt",
  },
  {
    id: "cooking",
    label: "Готовим",
    subLabel: "Шеф-повар создает ваш шедевр",
    icon: "restaurant",
  },
  {
    id: "on_way",
    label: "В пути",
    subLabel: "Курьер мчится к вашему дому",
    icon: "bicycle",
  },
  {
    id: "delivered",
    label: "Доставлен",
    subLabel: "Приятного аппетита!",
    icon: "checkmark-done",
  },
];

export default function OrderStatusTimeline({
  currentStatus,
}: {
  currentStatus: string;
}) {
  const currentIndex = STATUSES.findIndex((s) => s.id === currentStatus);

  return (
    <View style={styles.container}>
      {STATUSES.map((status, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        const isPending = index > currentIndex;
        const isLast = index === STATUSES.length - 1;

        return (
          <View key={status.id} style={styles.stepWrapper}>
            <View style={styles.iconColumn}>
              <View
                style={[
                  styles.circle,
                  isDone && styles.circleDone,
                  isActive && styles.circleActive,
                  isPending && styles.circlePending,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                ) : (
                  <Ionicons
                    name={status.icon as any}
                    size={isActive ? 20 : 16}
                    color={
                      isActive
                        ? "#FFF"
                        : isPending
                          ? "#BDC3C7"
                          : COLORS.textLight
                    }
                  />
                )}
              </View>

              {!isLast && (
                <View style={[styles.line, isDone && styles.lineDone]} />
              )}
            </View>

            <View style={[styles.textColumn, isLast && { paddingBottom: 0 }]}>
              <Text
                style={[
                  styles.label,
                  isActive && styles.labelActive,
                  isPending && styles.labelPending,
                ]}
                weight={isActive ? "bold" : "medium"}
              >
                {status.label}
              </Text>
              <Text style={styles.subLabel}>{status.subLabel}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  stepWrapper: {
    flexDirection: "row",
  },
  iconColumn: {
    alignItems: "center",
    width: 42,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  circleDone: {
    backgroundColor: "#2ECC71",
  },
  circleActive: {
    backgroundColor: COLORS.primary,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 4,
    borderColor: "rgba(255, 102, 0, 0.15)",
  },
  circlePending: {
    backgroundColor: "#F4F5F7",
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: "#F4F5F7",
    marginVertical: 2,
  },
  lineDone: {
    backgroundColor: "#2ECC71",
  },
  textColumn: {
    marginLeft: 15,
    flex: 1,
    paddingTop: 4,
    paddingBottom: 25,
  },
  label: {
    fontSize: 16,
    color: COLORS.text,
  },
  labelActive: {
    color: COLORS.primary,
    fontSize: 17,
  },
  labelPending: {
    color: "#BDC3C7",
  },
  subLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
    lineHeight: 18,
  },
});
