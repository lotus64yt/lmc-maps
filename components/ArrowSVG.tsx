import React from "react";
import { View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

interface NavigationArrowProps {
  size?: number;
  color?: string;
  width?: number;
  height?: number;
  styleTransform?: any;
  isNavigating?: boolean;
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
        // Ajout d'un fond pour améliorer la visibilité
        // backgroundColor: "rgba(0, 0, 0, 0.8)",
        // borderRadius: (width || size) / 2,
        // borderWidth: 2,
        // borderColor: "white",
      }}
    >
      <MaterialIcons
        name="navigation"
        size={size}
        color={color}
        // style={{
        //   // Ajout d'une ombre pour améliorer le contraste
        //   textShadowColor: "rgba(0, 0, 0, 0.8)",
        //   textShadowOffset: { width: 1, height: 1 },
        //   textShadowRadius: 2,
        // }}
      />
    </View>
  );
};

export default NavigationArrow;
