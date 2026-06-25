import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Text from "./CustomText";
import { COLORS } from "../constants/theme";

interface ToastProps {
  visible: boolean;
  message: string;
  onHide: () => void;
}

export default function Toast({ visible, message, onHide }: ToastProps) {
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.spring(translateY, {
        toValue: 60,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        hide();
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      hide();
    }
  }, [visible]);

  const hide = () => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShouldRender(false);
      onHide();
    });
  };

  if (!shouldRender) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={18} color="#FFF" />
        </View>
        <Text style={styles.text} weight="medium">
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#333333",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  text: {
    color: "#FFF",
    fontSize: 14,
  },
});
