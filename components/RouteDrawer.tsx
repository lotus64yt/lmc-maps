import React, { useRef, useEffect } from "react";
import { useMapControls } from "../hooks/useMapControls";
import { useLabs } from "../contexts/LabsContext";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  Vibration,
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { formatDuration, formatDistance } from "../utils/formatUtils";

interface Destination {
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

interface TransportMode {
  id: string;
  name: string;
  icon: string;
  duration: string;
  distance: string;
  color: string;
}

interface RouteDrawerProps {
  visible: boolean;
  destination: Destination | null;
  onClose: () => void;
  onStartNavigation: (transportMode: string) => void;
  onTransportModeChange?: (mode: string, destination: Destination) => void;
  userLocation: { latitude: number; longitude: number } | null;
  isCalculatingRoute?: boolean;
  isOsrmAvailable?: boolean;
  provider?: string;
  // Debug timings from the route service
  lastRequestTimings?: {
    host: string;
    durationMs: number;
    success: boolean;
    endpoint?: string;
  }[];
  // Timestamp (ms) updated by parent when the user interacts with the map
  userInteractionAt?: number;
  // Notifie le parent quand le drawer passe en mode expandé / réduit
  onExpandChange?: (isExpanded: boolean) => void;
  onOpened?: () => void;
}

const { height: screenHeight } = Dimensions.get("window");
// Make the drawer large enough to expand almost full-screen while keeping a small top margin
const DRAWER_HEIGHT = screenHeight * 0.85; // was 0.45, increased to allow full expansion
const PEEK_HEIGHT = 120;
const SEARCH_BAR_HEIGHT = 100; // Hauteur approximative de la barre de recherche + marges

export default function RouteDrawer({
  visible,
  destination,
  onClose,
  onStartNavigation,
  onTransportModeChange,
  userLocation,
  isCalculatingRoute = false,
  isOsrmAvailable = true,
  provider,
  lastRequestTimings,
  userInteractionAt,
  onExpandChange,
  onOpened,
}: RouteDrawerProps) {
  const { fitToRoute, setDrawerCameraControl, releaseDrawerCameraControl } =
    useMapControls();
  const { showDebugInfo } = useLabs();
  const isDebugMode = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const handleBounce = useRef(new Animated.Value(0)).current;
  const [selectedTransport, setSelectedTransport] = React.useState("driving");
  const [isExpanded, setIsExpanded] = React.useState(false);
  const inactivityTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const inactivityAnimRef = React.useRef<Animated.CompositeAnimation | null>(
    null
  );
  const inactivityTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const inactivityCancelledRef = React.useRef(false);
  const lastInternalInteractionRef = React.useRef<number>(Date.now());
  const lastTranslateYRef = React.useRef<number>(DRAWER_HEIGHT);

  // Fonction pour changer le mode de transport et déclencher l'affichage du trajet
  const handleTransportModeChange = (modeId: string) => {
    Vibration.vibrate(50); // Vibration pour feedback de sélection
    setSelectedTransport(modeId);

    // Déclencher l'affichage du trajet sur la carte
    if (onTransportModeChange && destination) {
      onTransportModeChange(modeId, destination);
    }
  };

  // Fonction pour fermer avec vibration
  const handleCloseWithVibration = () => {
    Vibration.vibrate(50);
    onClose();
  };

  // Fonction pour démarrer navigation avec vibration
  const handleStartNavigationWithVibration = () => {
    Vibration.vibrate(100); // Vibration plus forte pour action importante
    onStartNavigation(selectedTransport);
  };

  // Modes de transport avec estimations
  const [durations, setDurations] = React.useState<{ [mode: string]: string }>(
    {}
  );

  const transportModes: TransportMode[] = [
    {
      id: "driving",
      name: "Voiture",
      icon: "directions-car",
      duration: calculateDuration("driving"),
      distance: calculateDistance(),
      color: "#4285F4",
    },
    {
      id: "walking",
      name: "À pied",
      icon: "directions-walk",
      duration: calculateDuration("walking"),
      distance: calculateDistance(),
      color: "#34A853",
    },
    {
      id: "bicycling",
      name: "Vélo",
      icon: "directions-bike",
      duration: calculateDuration("bicycling"),
      distance: calculateDistance(),
      color: "#FBBC04",
    },
  ];

  // Calcul approximatif de la distance
  function calculateDistance(): string {
    if (!destination || !userLocation) return "-- km";

    const R = 6371; // Rayon de la Terre en km
    const dLat =
      ((destination.latitude - userLocation.latitude) * Math.PI) / 180;
    const dLon =
      ((destination.longitude - userLocation.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.latitude * Math.PI) / 180) *
        Math.cos((destination.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    return formatDistance(distanceKm * 1000); // Convertir en mètres pour formatDistance
  }

  // Calcul approximatif de la durée selon le mode
  // Utilise l'API OSRM (Open Source Routing Machine) pour calculer la durée estimée
  // https://project-osrm.org/docs/v5.5.1/api/#route-service
  // Pas de clé API requise, usage libre pour tests/démos

  async function fetchDuration(mode: string) {
    if (!destination || !userLocation) return "-- min";
    // OSRM profile: car, bike, foot
    let profile = "car";
    if (mode === "walking") profile = "foot";
    else if (mode === "bicycling") profile = "bike";
    else if (mode === "transit") return "-- min"; // OSRM ne gère pas le transit

    const url = `https://routing.openstreetmap.de/routed-car/route/v1/${profile}/${userLocation.longitude},${userLocation.latitude};${destination.longitude},${destination.latitude}?overview=false&alternatives=true&steps=true`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const durationMin = data.routes[0].duration / 60;
        return formatDuration(durationMin);
      }
    } catch (e) {
      // ignore
    }
    return "-- min";
  }

  // Met à jour les durées à chaque changement de destination ou userLocation
  useEffect(() => {
    if (!destination || !userLocation) return;
    ["driving", "walking", "bicycling"].forEach(async (mode) => {
      const d = await fetchDuration(mode);
      setDurations((prev) => ({ ...prev, [mode]: d }));
    });
    // Transit non supporté par OSRM
    setDurations((prev) => ({ ...prev, transit: "-- min" }));
  }, [destination, userLocation]);

  function calculateDuration(mode: string): string {
    return durations[mode] || "-- min";
  }

  // Gestion du pan pour glisser le drawer
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dy) > 5;
    },
    onPanResponderMove: (_, gestureState) => {
      // Allow dragging up and down relative to the current peek/expanded position
      const PEEK_TRANSLATE = DRAWER_HEIGHT - PEEK_HEIGHT;
      const base = isExpanded ? 0 : PEEK_TRANSLATE;
      let newY = base + gestureState.dy;
      newY = Math.max(0, Math.min(DRAWER_HEIGHT, newY));
      translateY.setValue(newY);
      lastTranslateYRef.current = newY;
      // mark interaction
      lastInternalInteractionRef.current = Date.now();
      resetInactivityTimer();
    },
    onPanResponderRelease: (_, gestureState) => {
      const velocityThreshold = 0.3;
      const swipeUp =
        gestureState.dy < -50 || gestureState.vy < -velocityThreshold;
      const swipeDown =
        gestureState.dy > 80 || gestureState.vy > velocityThreshold;

      if (swipeDown) {
        // If currently expanded, a downward fling should collapse to peek first
        if (isExpanded) {
          collapseToPeek();
          return;
        }

        // If already collapsed/peek, only close when user dragged near the bottom
        // This avoids accidental closes from a simple strong swipe.
        const CLOSE_THRESHOLD = DRAWER_HEIGHT - 80; // near bottom
        if (lastTranslateYRef.current > CLOSE_THRESHOLD) {
          closeDrawer();
          return;
        }

        // Otherwise, snap back to peek
        collapseToPeek();
        return;
      }

      if (swipeUp) {
        // expand
        expandDrawer();
      } else {
        // snap back to peek
        collapseToPeek();
      }
    },
  });

  const openDrawer = () => {
    // Open to peek (small part visible) so the route remains mostly visible
    const PEEK_TRANSLATE = DRAWER_HEIGHT - PEEK_HEIGHT;
    Animated.spring(translateY, {
      toValue: PEEK_TRANSLATE,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      setIsExpanded(false);
      if (onExpandChange) onExpandChange(false);
      // Notify parent that the drawer has finished opening (useful to adjust camera)
      if (typeof onOpened === "function") onOpened();
    });
    resetInactivityTimer();
  };

  const expandDrawer = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      setIsExpanded(true);
      if (onExpandChange) onExpandChange(true);
      // Stop any running inactivity hint animations when user expands
      stopInactivityAnimations();
      if (typeof onOpened === "function") onOpened();
    });
    resetInactivityTimer();
  };

  const collapseToPeek = () => {
    const PEEK_TRANSLATE = DRAWER_HEIGHT - PEEK_HEIGHT;
    Animated.spring(translateY, {
      toValue: PEEK_TRANSLATE,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      setIsExpanded(false);
      if (onExpandChange) onExpandChange(false);
    });
    resetInactivityTimer();
  };

  const closeDrawer = () => {
    // Ensure any inactivity hint animation is stopped when closing
    stopInactivityAnimations();
    Animated.timing(translateY, {
      toValue: DRAWER_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  // Stop and cleanup any running inactivity hint animations/timers
  function stopInactivityAnimations() {
    inactivityCancelledRef.current = true;
    // stop any active Animated composite
    try {
      if (
        inactivityAnimRef.current &&
        typeof inactivityAnimRef.current.stop === "function"
      ) {
        inactivityAnimRef.current.stop();
      }
    } catch (e) {
      // ignore
    }
    inactivityAnimRef.current = null;

    // clear any scheduled timeouts used by the animate loop
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current as any);
      inactivityTimeoutRef.current = null;
    }

    // clear the main inactivity timer too
    clearInactivityTimer();

    // reset handle bounce to neutral state
    try {
      handleBounce.stopAnimation(() => {
        handleBounce.setValue(0);
      });
    } catch (e) {
      handleBounce.setValue(0);
    }
  }

  // Idle hint animation (bounce handle) after 5s of inactivity
  const startInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      // only hint if drawer is visible and not expanded
      if (!isExpanded) {
        // stronger bounce + small wiggle to make it obvious
        // only animate the small handle, repeat a few times
        inactivityCancelledRef.current = false;
        handleBounce.setValue(0);
        const bounceSeq = Animated.sequence([
          Animated.timing(handleBounce, {
            toValue: -28,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(handleBounce, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(handleBounce, {
            toValue: -14,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(handleBounce, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
        ]);

        // Repeat the handle bounce a few times so it's noticeable but not annoying
        const loop = Animated.loop(bounceSeq, { iterations: 3 });
        inactivityAnimRef.current = loop;
        loop.start();
      }
    }, 5000); // 5 seconds
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const resetInactivityTimer = () => {
    lastInternalInteractionRef.current = Date.now();
    startInactivityTimer();
  };

  useEffect(() => {
    if (visible) {
      // Claim camera control for this drawer so our fitToRoute call is honored
      try {
        setDrawerCameraControl && setDrawerCameraControl("route-drawer");
      } catch (e) {
        // ignore
      }

      openDrawer();
      // Afficher le trajet par défaut (voiture) quand le drawer s'ouvre,
      // sauf si un calcul est déjà en cours (évite les doubles requêtes).
      // Le parent peut aussi avoir déjà lancé le calcul avant d'ouvrir le drawer.
      if (
        onTransportModeChange &&
        destination &&
        !isCalculatingRoute // do not trigger a new calculation if already running
      ) {
        onTransportModeChange("driving", destination);
      }
      // Camera fit is handled by parent (App.tsx) via onOpened so it can supply the full route geometry.
    } else {
      // Release camera control when drawer closes
      try {
        releaseDrawerCameraControl &&
          releaseDrawerCameraControl("route-drawer");
      } catch (e) {
        // ignore
      }
      closeDrawer();
    }
    // Start/clear inactivity timer when visibility changes
    if (visible) startInactivityTimer();
    else clearInactivityTimer();
  }, [visible]);

  // small helper to display provider label
  const providerLabel = provider
    ? `Provider: ${provider.replace(/^https?:\/\//, "")}`
    : null;

  // If parent signals user interaction elsewhere (map), reset inactivity timer
  useEffect(() => {
    if (userInteractionAt) {
      resetInactivityTimer();
    }
  }, [userInteractionAt]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearInactivityTimer();
    };
  }, []);

  if (!visible || !destination) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Handle pour glisser */}
      {/* handleBounce drives translateY and a small scale for visibility */}
      <Animated.View
        style={[styles.handle, { transform: [{ translateY: handleBounce }] }]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            // toggle expand/collapse
            if (isExpanded) collapseToPeek();
            else expandDrawer();
            resetInactivityTimer();
          }}
        >
          <Animated.View
            style={[
              styles.handleInner,
              {
                transform: [
                  {
                    scale: handleBounce.interpolate({
                      inputRange: [-28, -14, 0],
                      outputRange: [1.15, 1.07, 1],
                      extrapolate: "clamp",
                    }),
                  },
                  {
                    translateY: handleBounce,
                  },
                ],
              },
            ]}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Contenu du drawer */}
      {isOsrmAvailable ? (
        <>
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => {
              resetInactivityTimer();
            }}
            onTouchStart={() => {
              resetInactivityTimer();
            }}
          >
            {/* Skeleton / loading indicator when route is being calculated */}
            {isCalculatingRoute && (
              <View style={styles.skeletonContainer}>
                <View style={styles.skelTitle} />
                <View style={styles.skelSubtitle} />
                <View style={styles.skelRow}>
                  <View style={styles.skelBox} />
                  <View style={styles.skelBoxSmall} />
                </View>
              </View>
            )}

            {/* Informations destination */}
            <View style={styles.destinationInfo}>
              <Icon name="place" size={24} color="#EA4335" />
              <View style={styles.destinationText}>
                <Text style={styles.destinationTitle} numberOfLines={1}>
                  {destination.title}
                </Text>
                <Text style={styles.destinationSubtitle} numberOfLines={2}>
                  {destination.subtitle}
                </Text>
                {providerLabel && (
                  <Text style={styles.providerLabel} numberOfLines={1}>
                    {providerLabel}
                  </Text>
                )}
                {showDebugInfo &&
                  lastRequestTimings &&
                  lastRequestTimings.length > 0 && (
                    <View style={styles.timingsContainer}>
                      {lastRequestTimings.map((t, i) => (
                        <Text
                          key={i}
                          style={styles.timingText}
                          numberOfLines={1}
                        >
                          {`${t.host.replace(/^https?:\/\//, "")} — ${
                            t.durationMs
                          }ms ${t.success ? "OK" : "ERR"}`}
                        </Text>
                      ))}
                    </View>
                  )}
              </View>
              {/* Bouton de fermeture */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleCloseWithVibration}
              >
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Modes de transport + détails + actions */}
            <View style={styles.transportSection}>
              <Text style={styles.sectionTitle}>Modes de transport</Text>
              <View style={styles.transportModes}>
                {transportModes.map((mode) => (
                  <TouchableOpacity
                    key={mode.id}
                    style={[
                      styles.transportMode,
                      selectedTransport === mode.id &&
                        styles.transportModeSelected,
                    ]}
                    onPress={() => handleTransportModeChange(mode.id)}
                  >
                    <Icon
                      name={mode.icon as any}
                      size={24}
                      color={
                        selectedTransport === mode.id ? "#fff" : mode.color
                      }
                    />
                    <Text
                      style={[
                        styles.transportName,
                        selectedTransport === mode.id &&
                          styles.transportNameSelected,
                      ]}
                    >
                      {mode.name}
                    </Text>
                    <Text
                      style={[
                        styles.transportDuration,
                        selectedTransport === mode.id &&
                          styles.transportDurationSelected,
                      ]}
                    >
                      {mode.duration}
                    </Text>
                    <Text
                      style={[
                        styles.transportDistance,
                        selectedTransport === mode.id &&
                          styles.transportDistanceSelected,
                      ]}
                    >
                      {mode.distance}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.routeDetails}>
              <Text style={styles.sectionTitle}>Détails du trajet</Text>
              <View style={styles.routeInfo}>
                {transportModes.find((m) => m.id === selectedTransport) && (
                  <View style={styles.routeStats}>
                    <View style={styles.statItem}>
                      <Icon name="schedule" size={20} color="#666" />
                      <Text style={styles.statText}>
                        {
                          transportModes.find((m) => m.id === selectedTransport)
                            ?.duration
                        }
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Icon name="straighten" size={20} color="#666" />
                      <Text style={styles.statText}>
                        {
                          transportModes.find((m) => m.id === selectedTransport)
                            ?.distance
                        }
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCloseWithVibration}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStartNavigationWithVibration}
              >
                <Icon name="navigation" size={20} color="#fff" />
                <Text style={styles.startButtonText}>Démarrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </>
      ) : (
        // Compact non-scrollable view when OSRM is down: show banner + dest + minimal actions
        <View style={[styles.content, styles.compactContent]}>
          <View style={styles.osrmBanner}>
            <Text style={styles.osrmBannerText}>
              Serveur OSRM indisponible — les calculs d'itinéraires sont
              désactivés
            </Text>
          </View>

          <View style={styles.destinationInfo}>
            <Icon name="place" size={24} color="#EA4335" />
            <View style={styles.destinationText}>
              <Text style={styles.destinationTitle} numberOfLines={1}>
                {destination.title}
              </Text>
              <Text style={styles.destinationSubtitle} numberOfLines={2}>
                {destination.subtitle}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseWithVibration}
            >
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCloseWithVibration}
            >
              <Text style={styles.cancelButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  handleInner: {
    // width: 40,
    // height: 4,
    // backgroundColor: "#DDD",
    // borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  compactContent: {
    justifyContent: "flex-start",
    paddingVertical: 12,
  },
  destinationInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  destinationText: {
    flex: 1,
    marginLeft: 12,
  },
  destinationTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  destinationSubtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  providerLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },
  timingsContainer: {
    marginTop: 6,
  },
  timingText: {
    fontSize: 12,
    color: "#666",
  },
  transportSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  transportModes: {
    gap: 8,
  },
  transportMode: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  transportModeSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  transportName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginLeft: 12,
    flex: 1,
  },
  transportNameSelected: {
    color: "#fff",
  },
  transportDuration: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginRight: 8,
  },
  transportDurationSelected: {
    color: "#fff",
  },
  transportDistance: {
    fontSize: 12,
    color: "#999",
    minWidth: 50,
    textAlign: "right",
  },
  transportDistanceSelected: {
    color: "#fff",
  },
  routeDetails: {
    marginBottom: 24,
  },
  routeInfo: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
  },
  routeStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 32,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  startButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    padding: 8,
    marginLeft: "auto",
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  // Skeleton styles
  skeletonContainer: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  skelTitle: {
    height: 18,
    backgroundColor: "#EEE",
    borderRadius: 6,
    marginBottom: 8,
  },
  skelSubtitle: {
    height: 12,
    width: "60%",
    backgroundColor: "#F2F2F2",
    borderRadius: 6,
    marginBottom: 12,
  },
  skelRow: {
    flexDirection: "row",
    gap: 8,
  },
  skelBox: {
    flex: 1,
    height: 40,
    backgroundColor: "#EEE",
    borderRadius: 8,
  },
  skelBoxSmall: {
    width: 80,
    height: 40,
    backgroundColor: "#EEE",
    borderRadius: 8,
  },
  osrmBanner: {
    backgroundColor: "#FFF4E5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFD59A",
  },
  osrmBannerText: {
    color: "#8A4B00",
    fontSize: 13,
    fontWeight: "600",
  },
  debugContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#f2f2f2",
    backgroundColor: "#fafafa",
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  debugText: { fontSize: 12, color: "#666" },
});
