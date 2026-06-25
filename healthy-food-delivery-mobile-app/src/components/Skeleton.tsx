import { useEffect, useRef } from "react";
import { Animated, ViewStyle, StyleProp } from "react-native";

interface SkeletonProps {
  width: number | string;
  height: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Skeleton({
  width,
  height,
  borderRadius = 12,
  style,
}: SkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#E1E9EE",
          opacity: pulseAnim,
        } as any,
        style,
      ]}
    />
  );
}
