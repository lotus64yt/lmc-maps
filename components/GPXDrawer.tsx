import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  Vibration,
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Svg, { Polyline, Line, Polygon, Text as SvgText } from "react-native-svg";

export interface GPXPoint {
  latitude: number;
  longitude: number;
  name?: string;
}

interface GPXDrawerProps {
  visible: boolean;
  track: GPXPoint[];
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
  onNavigateToStart: (start: { latitude: number; longitude: number }) => void;
  onPreviewIndexChange?: (index: number) => void;
  previewIndex?: number;
  onOpened?: () => void;
  minimizeSignal?: number; // change value to request minimize-to-peek
  onStartFollowingTrack?: () => void;
  onClearRoute?: () => void;
  onStopNavigation?: () => void;
  importing?: boolean;
  importProgress?: number;
}

const { height: screenHeight } = Dimensions.get("window");
const DRAWER_HEIGHT = screenHeight * 0.52; // smaller drawer to reveal more map
const PEEK_HEIGHT = 350; // slightly smaller peek height

export default function GPXDrawer({
  visible,
  track,
  onClose,
  userLocation,
  onNavigateToStart,
  onPreviewIndexChange,
  previewIndex = 0,
  onOpened,
  minimizeSignal,
  onStartFollowingTrack,
  onClearRoute,
  onStopNavigation,
}: GPXDrawerProps) {
  // Follow RouteDrawer pattern: 0 = expanded, DRAWER_HEIGHT = hidden
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [navigatingToStart, setNavigatingToStart] = useState(false);
  const [arrived, setArrived] = useState(false);

  // Distance utils
  const getDistanceMeters = (
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const aVal =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return R * c;
  };

  const totalDistance = useMemo(() => {
    if (!track || track.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < track.length; i++) {
      sum += getDistanceMeters(track[i - 1], track[i]);
    }
    return sum;
  }, [track]);

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  };

  const estimatedDurationSec = useMemo(() => {
    // approx walking 5km/h => 1.388 m/s
    return totalDistance / 1.388;
  }, [totalDistance]);

  const formatDuration = (seconds: number) => {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} h ${m} min`;
    return `${m} min`;
  };

  useEffect(() => {
    if (visible) {
      // show at expanded by default
      setIsExpanded(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 8,
        speed: 12,
      }).start(() => onOpened && onOpened());
    } else {
      Animated.spring(translateY, {
        toValue: DRAWER_HEIGHT,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    }
  }, [visible]);

  // External minimize request (map panned or other)
  useEffect(() => {
    if (!visible) return;
    if (typeof minimizeSignal === "number") {
      setIsExpanded(false);
      Animated.spring(translateY, {
        toValue: DRAWER_HEIGHT - PEEK_HEIGHT,
        useNativeDriver: true,
        bounciness: 8,
      }).start();
    }
  }, [minimizeSignal]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) =>
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (evt, gestureState) => {
      const PEEK_TRANSLATE = DRAWER_HEIGHT - PEEK_HEIGHT;
      const base = isExpanded ? 0 : PEEK_TRANSLATE;
      let newY = base + gestureState.dy;
      newY = Math.max(0, Math.min(DRAWER_HEIGHT, newY));
      translateY.setValue(newY);
    },
    onPanResponderRelease: (evt, gestureState) => {
      const velocityThreshold = 0.3;
      const swipeDown =
        gestureState.dy > 80 || gestureState.vy > velocityThreshold;
      const swipeUp =
        gestureState.dy < -50 || gestureState.vy < -velocityThreshold;
      const PEEK_TRANSLATE = DRAWER_HEIGHT - PEEK_HEIGHT;
      if (swipeDown) {
        // Minimize to peek instead of closing
        setIsExpanded(false);
        Animated.spring(translateY, {
          toValue: PEEK_TRANSLATE,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
        return;
      }
      if (swipeUp) {
        setIsExpanded(true);
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
      } else {
        // Snap to nearest state based on current position
        translateY.stopAnimation((val: number) => {
          const snapToExpanded = val < PEEK_TRANSLATE / 2;
          setIsExpanded(snapToExpanded);
          Animated.spring(translateY, {
            toValue: snapToExpanded ? 0 : PEEK_TRANSLATE,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        });
      }
    },
  });

  // Build a downsampled index map for the slider and sparkline to keep it smooth
  const MAX_SLIDER_POINTS = 1000;
  const originalIndexMap = useMemo(() => {
    if (!track || track.length === 0) return [] as number[];
    if (track.length <= MAX_SLIDER_POINTS) return track.map((_, i) => i);
    const step = Math.max(1, Math.ceil(track.length / MAX_SLIDER_POINTS));
    const arr: number[] = [];
    for (let i = 0; i < track.length; i += step) arr.push(i);
    if (arr[arr.length - 1] !== track.length - 1) arr.push(track.length - 1);
    return arr;
  }, [track]);


  // Arrival detection: when navigatingToStart is true, watch userLocation
  // and mark arrived when within ARRIVAL_THRESHOLD meters of the start point.
  useEffect(() => {
    if (!navigatingToStart || !userLocation || !track || track.length === 0) return;
    const ARRIVAL_THRESHOLD = 25; // meters
    const startPoint = track[0];
    if (!startPoint || typeof startPoint.latitude !== "number" || typeof startPoint.longitude !== "number") return;
    const dist = getDistanceMeters(userLocation, startPoint);
    if (dist <= ARRIVAL_THRESHOLD) {
      setArrived(true);
      setNavigatingToStart(false);
    }
  }, [navigatingToStart, userLocation, track]);

  // Elevation sparkline data (downsampled to the same index map)
  const hasElevation = useMemo(
    () =>
      track &&
      track.some(
        (p: any) => typeof p?.elevation === "number" && isFinite(p.elevation)
      ),
    [track]
  );
  const elevationSeries = useMemo(() => {
    if (!hasElevation || !track || originalIndexMap.length === 0)
      return [] as number[];
    return originalIndexMap.map((idx) => {
      const p: any = track[idx];
      return typeof p?.elevation === "number" ? (p.elevation as number) : 0;
    });
  }, [track, hasElevation, originalIndexMap]);
  const elevationMin = useMemo(
    () => (elevationSeries.length ? Math.min(...elevationSeries) : 0),
    [elevationSeries]
  );
  const elevationMax = useMemo(
    () => (elevationSeries.length ? Math.max(...elevationSeries) : 0),
    [elevationSeries]
  );
  const sparkHeight = 36;
  const sparkPadding = 4;
  const sparkWidth = Dimensions.get("window").width - 32; // paddingHorizontal 16
  const sparkPoints = useMemo(() => {
    if (!elevationSeries.length || elevationMax === elevationMin) return "";
    const n = elevationSeries.length;
    const dx = sparkWidth / Math.max(1, n - 1);
    const scaleY = (val: number) => {
      const t = (val - elevationMin) / (elevationMax - elevationMin);
      // invert Y for svg (0 at top)
      return sparkPadding + (1 - t) * (sparkHeight - 2 * sparkPadding);
    };
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round(i * dx);
      const y = Math.round(scaleY(elevationSeries[i]));
      pts.push(`${x},${y}`);
    }
    return pts.join(" ");
  }, [elevationSeries, elevationMax, elevationMin, sparkWidth]);

  const scaleY = (val: number) => {
    if (elevationMax === elevationMin) {
      return sparkPadding + (sparkHeight - 2 * sparkPadding) / 2;
    }
    const t = (val - elevationMin) / (elevationMax - elevationMin);
    return sparkPadding + (1 - t) * (sparkHeight - 2 * sparkPadding);
  };

  if (!visible || !track || track.length === 0) return null;

  const start = track && track.length ? track[0] : { latitude: 0, longitude: 0 };
  const end = track && track.length ? track[track.length - 1] : { latitude: 0, longitude: 0 };

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.header}>
        <View style={styles.handle} />
        <TouchableOpacity
          onPress={() => {
            Vibration.vibrate(50);
            // clear any temporary navigation route when closing
            if (onClearRoute) onClearRoute();
            onClose();
          }}
          style={styles.closeButton}
        >
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Parcours GPX</Text>
        <Text style={styles.subtitle}>
          De ({start.latitude.toFixed(5)}, {start.longitude.toFixed(5)}) à (
          {end.latitude.toFixed(5)}, {end.longitude.toFixed(5)})
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon name="timeline" size={20} color="#007AFF" />
            <Text style={styles.statText}>{formatDistance(totalDistance)}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="access-time" size={20} color="#FF9500" />
            <Text style={styles.statText}>
              {formatDuration(estimatedDurationSec)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="place" size={20} color="#34C759" />
            <Text style={styles.statText}>{track.length} points</Text>
          </View>
        </View>

        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.primaryButton]}
            onPress={() => {
              Vibration.vibrate(60);
              setNavigatingToStart(true);
              setArrived(false);
              onNavigateToStart(start);
            }}
          >
            <Icon name="navigation" size={20} color="#FFF" />
            <Text style={styles.primaryButtonText}>
              Naviguer jusqu'au départ
            </Text>
          </TouchableOpacity>

          {navigatingToStart ? (
            <TouchableOpacity
              style={[styles.secondaryButton, { marginLeft: 8 }]}
              onPress={() => {
                Vibration.vibrate(40);
                setNavigatingToStart(false);
                setArrived(false);
                if (onStopNavigation) onStopNavigation();
                if (onClearRoute) onClearRoute();
              }}
            >
              <Icon name="stop" size={18} color="#007AFF" />
              <Text style={styles.secondaryButtonText}>Arrêter</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.previewContainer}>
          {navigatingToStart && !arrived ? (
            <View style={styles.navigatingHint}>
              <Text style={styles.navigatingText}>Navigation vers le départ en cours…</Text>
            </View>
          ) : null}
          {arrived ? (
            <View style={styles.arrivalContainer}>
              <Text style={styles.arrivalTitle}>Vous êtes arrivé · Départ atteint</Text>
              <TouchableOpacity
                style={styles.arrivalButton}
                onPress={() => {
                  Vibration.vibrate(80);
                  setArrived(false);
                  setNavigatingToStart(false);
                  if (onStartFollowingTrack) onStartFollowingTrack();
                }}
              >
                <Text style={styles.arrivalButtonText}>Commencer la navigation du parcours</Text>
              </TouchableOpacity>
            </View>
          ) : null}
      {hasElevation && (
            <View style={styles.elevationContainer}>
              <Svg width={sparkWidth} height={sparkHeight}>
        {/* sparkline only - no preview marker */}

                <Line
                  x1={0}
                  y1={sparkHeight - sparkPadding}
                  x2={sparkWidth}
                  y2={sparkHeight - sparkPadding}
                  stroke="#D1D1D6"
                  strokeWidth={1}
                />
                {sparkPoints ? (
                  <>
                    {/* zone bleue sous la courbe */}
                    <Polygon
                      points={`${sparkPoints} ${sparkWidth},${
                        sparkHeight - sparkPadding
                      } 0,${sparkHeight - sparkPadding}`}
                      fill="rgba(0,122,255,0.2)"
                    />
                    {/* courbe */}
                    <Polyline
                      points={sparkPoints}
                      fill="none"
                      stroke="#007AFF"
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </Svg>
            </View>
          )}
          {/* slider and preview removed */}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: "white",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    paddingBottom: 16,
  },
  header: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#DDD",
  },
  closeButton: {
    position: "absolute",
    right: 8,
    top: 6,
    padding: 8,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 14, color: "#333", fontWeight: "600" },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: { color: "#FFF", fontWeight: "700" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  secondaryButtonText: { color: "#007AFF", fontWeight: "700" },
  previewContainer: { marginTop: 16 },
  elevationContainer: { width: "100%", alignItems: "center", marginBottom: 6 },
  previewLabel: { fontSize: 12, color: "#666", marginBottom: 6 },
  previewInfoRow: { flexDirection: "row", justifyContent: "space-between" },
  previewInfoText: { fontSize: 12, color: "#666" },
  navigatingHint: { padding: 8, backgroundColor: "#FFF8E1", borderRadius: 8, marginBottom: 6 },
  navigatingText: { color: "#8A6D00", fontSize: 13 },
  arrivalContainer: { padding: 10, backgroundColor: "#E8F8F1", borderRadius: 8, marginBottom: 8 },
  arrivalTitle: { fontWeight: "700", color: "#0B6A3A", marginBottom: 8 },
  arrivalButton: { backgroundColor: "#007AFF", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  arrivalButtonText: { color: "#FFF", fontWeight: "700" },
});
