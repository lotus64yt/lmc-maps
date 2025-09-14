import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type Props = { progressPercentage: number };

export default function ProgressSidebar({ progressPercentage }: Props) {
  const [barHeight, setBarHeight] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const arrowSize = 20;

  const windowHeight = Dimensions.get("window").height;
  const dynamicHeight = Math.round(windowHeight * 0.6);
  const containerTop = Math.max(8, Math.round((windowHeight - dynamicHeight) / 2));

  useEffect(() => {
    if (!barHeight) return;
    const clamped = Math.max(0, Math.min(100, progressPercentage));
    const toValue = (1 - clamped / 100) * Math.max(0, barHeight - arrowSize);
    Animated.timing(anim, { toValue, duration: 250, useNativeDriver: true }).start();
  }, [progressPercentage, barHeight, anim]);

  const fillHeight = barHeight
    ? (barHeight * Math.max(0, Math.min(100, progressPercentage))) / 100
    : 0;

  return (
    <View pointerEvents="none" style={[styles.container, { top: containerTop }]}>
      <View style={styles.sidebar}>
        <View
          style={[styles.barBox, { height: dynamicHeight }]}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.track} />
          {fillHeight > 0 && (
            <View style={[styles.fill, { height: fillHeight }]} />
          )}

          <Animated.View
            style={[
              styles.arrowContainer,
              {
                top: 0,
                left: "50%",
                marginLeft: -18,
                transform: [{ translateY: anim }],
              },
            ]}
          >
            <View style={styles.arrowBg}>
              <MaterialIcons name="navigation" size={20} color="#1976D2" />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    top: 80,
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
  },
  sidebar: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  barBox: {
    width: 20,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 3,
  },
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    zIndex: 1,
    backgroundColor: "#1976D2",
  },
  arrowContainer: {
    position: "absolute",
    width: 36,
    alignItems: "center",
    zIndex: 10,
  },
  arrowBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 4,
  },
});

