import { useEffect, useRef } from "react";
import { TouchableOpacity, Animated, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

interface CustomSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export default function CustomSwitch({
  value,
  onValueChange,
}: CustomSwitchProps) {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const trackColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["#E5E5EA", COLORS.primary],
  });

  const thumbPosition = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 24],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.thumb, { transform: [{ translateX: thumbPosition }] }]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 54,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
});
