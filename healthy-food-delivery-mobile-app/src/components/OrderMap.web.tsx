import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { COLORS } from "../constants/theme";

export default function OrderMap() {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <iframe
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        allowFullScreen
        src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d18911.23456789!2d23.8131!3d53.6693!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sru!2sby!4v1700000000000!5m2!1sru!2sby"
      ></iframe>

      <View style={styles.markerOverlay} pointerEvents="none">
        <Animated.View
          style={[
            styles.pulse,
            {
              transform: [
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 3],
                  }),
                },
              ],
              opacity: opacityAnim,
            },
          ]}
        />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEE",
    position: "relative",
  },
  markerOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: "#FFF",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  pulse: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    opacity: 0.5,
  },
});
