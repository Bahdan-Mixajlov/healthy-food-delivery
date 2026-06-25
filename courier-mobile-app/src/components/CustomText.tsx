import { Text, TextProps, StyleSheet } from "react-native";

interface CustomTextProps extends TextProps {
  weight?: "regular" | "medium" | "semibold" | "bold";
}

export default function CustomText({
  style,
  weight = "regular",
  ...props
}: CustomTextProps) {
  let fontFamily = "Inter_400Regular";

  if (weight === "medium") fontFamily = "Inter_500Medium";
  if (weight === "semibold") fontFamily = "Inter_600SemiBold";
  if (weight === "bold") fontFamily = "Inter_700Bold";

  const passedStyles = StyleSheet.flatten(style) || {};
  if (passedStyles.fontWeight === "bold" || passedStyles.fontWeight === "700") {
    fontFamily = "Inter_700Bold";
  } else if (passedStyles.fontWeight === "600") {
    fontFamily = "Inter_600SemiBold";
  } else if (passedStyles.fontWeight === "500") {
    fontFamily = "Inter_500Medium";
  }

  return (
    <Text {...props} style={[style, { fontFamily, fontWeight: undefined }]} />
  );
}
