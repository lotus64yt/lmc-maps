import React from "react";
import { Animated, View } from "react-native";
import { Marker } from "react-native-maps";
import * as Location from "expo-location";
import ArrowSVG from "./ArrowSVG";

interface UserLocationMarkerProps {
  location: Location.LocationObjectCoords;
  headingAnim: Animated.Value;
  compassMode: 'north' | 'heading';
  mapHeading?: number;
}

export default function UserLocationMarker({
  location,
  headingAnim,
  compassMode,
  mapHeading = 0
}: UserLocationMarkerProps) {
  
  // En mode heading, on doit compenser la rotation de la carte
  const getRotationTransform = () => {
    if (compassMode === 'heading') {
      // La flèche doit pointer dans la direction absolue du heading,
      // mais compensée par la rotation de la carte
      return headingAnim.interpolate({
        inputRange: [0, 360],
        outputRange: [`${180 - mapHeading}deg`, `${540 - mapHeading}deg`],
      });
    } else {
      // Mode normal, la flèche suit juste le heading
      return headingAnim.interpolate({
        inputRange: [0, 360],
        outputRange: ["180deg", "540deg"],
      });
    }
  };

  return (
    <Marker
      coordinate={{
        latitude: location.latitude,
        longitude: location.longitude,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <Animated.View
        style={{
          width: 40,
          height: 40,
          transform: [
            {
              rotate: getRotationTransform(),
            },
          ],
        }}
      >
        <ArrowSVG width={40} height={40} color="#007AFF" />
      </Animated.View>
    </Marker>
  );
}
