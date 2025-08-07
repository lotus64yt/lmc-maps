import React from "react";
import { View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

interface NavigationArrowProps {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
  styleTransform?: any;
  onClick?: () => void;
}

const NavigationArrow: React.FC<NavigationArrowProps> = ({
  size = 24,
  color = "white",
  width,
  height,
  styleTransform,
  onClick,
}) => {
  return (
    <View
      style={{
        width: width || size,
        height: height || size,
        justifyContent: "center",
        alignItems: "center",
        transform: styleTransform || [],
      }}
    >
      <MaterialIcons 
        name="navigation" 
        size={size} 
        color={color}
      />
    </View>
  );
};

export default NavigationArrow;
