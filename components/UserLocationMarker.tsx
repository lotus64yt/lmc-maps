import React from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";

interface UserLocationMarkerProps {
  location: Location.LocationObjectCoords;
  isNavigating?: boolean;
  color?: string;
}

export default function UserLocationMarker({
  location,
  isNavigating = false,
  color = '#007AFF',
}: UserLocationMarkerProps) {
  
  if (isNavigating) {
    return (
      <View
        collapsable={false}
        style={{
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: color,
            borderWidth: 3,
            borderColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              transform: [{ rotate: '0deg' }],
            }}
          >
            <MaterialIcons name="navigation" size={20} color="white" />
          </View>
       </View>
      </View>
    );
  } else {
    return (
      <View
        collapsable={false}
        style={{
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: color,
            borderWidth: 3,
            borderColor: 'white',
          }}
        />
      </View>
    );
  }
}
