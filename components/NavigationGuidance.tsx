import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  SafeAreaView,
  Vibration,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import NavigationService from "../services/NavigationService";
import { NavigationState } from "../types/RouteTypes";
import {
  formatDistance,
  formatDurationFromSeconds,
} from "../utils/formatUtils";
import AllStepsDrawer from "./AllStepsDrawer";
import SpeedLimitIndicator from "./SpeedLimitIndicator";

interface NavigationGuidanceProps {
  visible: boolean;
  onStop: () => void;
  onShowAllSteps?: () => void; // Callback to adjust map view when drawer opens
  recenterMain?: any; // optional style or prop for custom recenter main layout
  onAddNavigationStep?: () => void; // Nouveau callback pour ajouter une étape
  isRecalculatingRoute?: boolean; // Nouvel état pour afficher le spinner de recalcul
  showRecenterPrompt?: boolean; // Afficher le prompt de recentrage
  onManualRecenter?: () => void; // Callback pour le recentrage manuel
  currentLocation?: { latitude: number; longitude: number } | null; // Position actuelle pour le SpeedLimitIndicator
  // Nouvelle prop : demande de démarrage d'itinéraire (start/end/mode). Si fournie,
  // le composant lancera le chargement de l'itinéraire et affichera un spinner
  // jusqu'à ce que la navigation soit prête.
  routeRequest?: {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    mode: string;
  } | null;
  // If the parent already fetched the route, pass it here to avoid re-fetching.
  // Expected to be in the same shape RouteService / NavigationService.convertRouteToNavigationSteps accepts.
  routeData?: any | null;
  onRouteReady?: () => void; // callback quand la route est prête
}

export default function NavigationGuidance({
  visible,
  onStop,
  onShowAllSteps,
  onAddNavigationStep,
  isRecalculatingRoute = false,
  showRecenterPrompt = false,
  onManualRecenter,
  currentLocation,
  routeRequest,
  routeData,
  onRouteReady,
}: NavigationGuidanceProps) {
  const [navigationState, setNavigationState] = useState<NavigationState>(
    NavigationService.getCurrentState()
  );
  const [isStepsDrawerVisible, setIsStepsDrawerVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // État pour le menu
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [recenterRemainingMs, setRecenterRemainingMs] = useState<number | null>(
    null
  );
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const recenterIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [timeMode, setTimeMode] = useState<number>(0); // 0 = formatted, 1 = minutes, 2 = seconds
  const [distanceMode, setDistanceMode] = useState<number>(0); // 0 = formatted, 1 = km, 2 = miles

  // Responsive positioning for recenter button / bottom guidance
  const { width, height } = useWindowDimensions
    ? useWindowDimensions()
    : { width: 360, height: 800 };
  const computedButtonBottom = Math.max(64, Math.round(height * 0.08));
  const computedButtonRight = width < 360 ? 12 : 16;
  const computedBottomGuidancePaddingRight = Math.max(
    96,
    Math.round(width * 0.12)
  );

  // S'abonner aux changements d'état de navigation
  useEffect(() => {
    const handleStateChange = (state: NavigationState) => {
      setNavigationState(state);
    };

    NavigationService.addListener(handleStateChange);

    return () => {
      NavigationService.removeListener(handleStateChange);
    };
  }, []);

  // When a routeRequest is provided, load the route here and show a spinner.
  // If `routeData` is provided by the parent (already fetched), use it directly
  // to start navigation and skip the network fetch/spinner.
  useEffect(() => {
    let mounted = true;
    const loadRoute = async () => {
      console.log('[NavigationGuidance] loadRoute start', { visible, hasRouteData: routeData != null, hasRouteRequest: routeRequest != null });
      
      if (!visible) {
        console.log('[NavigationGuidance] loadRoute aborted: visible=false');
        return;
      }

      if ((routeData as any) != null) {
        console.log('[NavigationGuidance] Using provided routeData -> start navigation');
        try {
          const navigationSteps =
            NavigationService.convertRouteToNavigationSteps(routeData);
          NavigationService.startNavigation(navigationSteps);
          onRouteReady?.();
        } catch (e) {
          console.warn(
            "Erreur lors du d\u00e9marrage de la navigation depuis routeData",
            e
          );
        }
        return;
      }

      if (!routeRequest) {
        console.log('[NavigationGuidance] No routeRequest provided; nothing to fetch');
        return;
      }

      console.log('[NavigationGuidance] No routeData; will fetch route from hosts');
      setIsLoadingRoute(true);
      try {
        const { start, end, mode } = routeRequest;
        const osrmMode =
          mode === "walking"
            ? "foot"
            : mode === "bicycling"
            ? "bike"
            : "driving";

        const hosts = [
          "https://routing.openstreetmap.de/routed-car",
          "https://routing.openstreetmap.de",
        ];
        let fetchedRoute: any = null;
        console.log('[NavigationGuidance] Trying hosts:', hosts);
        for (const host of hosts) {
          try {
            console.log(`[NavigationGuidance] Attempting host: ${host}`);
            // routing.openstreetmap.de routed-car endpoint expects the same path but under /routed-car
            const url = `${host}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true&alternatives=true`;
            const res = await fetch(url);
            console.log(`[NavigationGuidance] Host ${host} response:`, res.status, res.ok);
            if (!res.ok) continue;
            const d = await res.json();
            if (d && d.routes && d.routes.length > 0) {
              console.log(`[NavigationGuidance] Host ${host} returned route`);
              fetchedRoute = d;
              break;
            } else {
              console.log(`[NavigationGuidance] Host ${host} returned no routes`);
              continue;
            }
          } catch (e) {
            console.warn(`[NavigationGuidance] Host ${host} fetch error:`, e);
            continue;
          }
        }

        if (!fetchedRoute) {
          const ORS_KEY =
            (global as any)?.OPENROUTESERVICE_API_KEY ||
            (process &&
              process.env &&
              (process.env.OPENROUTESERVICE_API_KEY ||
                process.env.ORS_API_KEY));
          if (ORS_KEY) {
            try {
              console.log('[NavigationGuidance] Trying ORS fallback');
              const profile =
                osrmMode === "bike"
                  ? "cycling-regular"
                  : osrmMode === "foot"
                  ? "foot-walking"
                  : "driving-car";
              const url = `https://api.openrouteservice.org/v2/directions/${profile}?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
              const res = await fetch(url, {
                headers: { Authorization: ORS_KEY },
              });
              console.log('[NavigationGuidance] ORS response:', res.status, res.ok);
              if (res.ok) {
                const d = await res.json();
                if (d && d.features && d.features.length > 0) {
                  console.log('[NavigationGuidance] ORS returned route');
                  fetchedRoute = d;
                } else {
                  console.log('[NavigationGuidance] ORS returned no features');
                }
              }
            } catch (e) {
              console.warn("[NavigationGuidance] ORS fetch error:", e);
              // ignore
            }
          }
        }

        if (mounted && fetchedRoute) {
          const navigationSteps =
            NavigationService.convertRouteToNavigationSteps(fetchedRoute);
          NavigationService.startNavigation(
            navigationSteps,
            undefined,
            osrmMode
          );
          onRouteReady?.();
        }
      } catch (e) {
        console.warn(
          "Erreur lors du chargement de l'itin\u00e9raire dans NavigationGuidance",
          e
        );
      } finally {
        if (mounted) {
          console.log('[NavigationGuidance] loadRoute finished, setIsLoadingRoute(false)');
          setIsLoadingRoute(false);
        }
      }
    };

    loadRoute();
    return () => {
      mounted = false;
    };
  }, [routeRequest, routeData, visible]);

  // Fade the guidance in/out when visible changes or navigation state updates.
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [visible, navigationState.isNavigating]);

  // Debug lifecycle & spinner state
  useEffect(() => {
    console.log('[NavigationGuidance] mounted');
    return () => {
      console.log('[NavigationGuidance] unmounted');
    };
  }, []);

  useEffect(() => {
    console.log('[NavigationGuidance] isLoadingRoute=', isLoadingRoute);
  }, [isLoadingRoute]);


  const handleStopNavigation = () => {
    Vibration.vibrate(100); // Vibration plus longue pour arrêter la navigation
    NavigationService.stopNavigation();
    onStop();
  };

  // Helpers to display time/distance in different units when tapped
  const formatTimeByMode = (secondsRaw: number | undefined, mode: number) => {
    const seconds = typeof secondsRaw === 'number' ? secondsRaw : 0;
    switch (mode) {
      case 1:
        return `${Math.round(seconds / 60)}min`;
      case 2:
        return `${Math.round(seconds)}s`;
      default:
        return formatDurationFromSeconds(seconds);
    }
  };

  const formatDistanceByMode = (metersRaw: number | undefined, mode: number) => {
    const meters = typeof metersRaw === 'number' ? metersRaw : 0;
    switch (mode) {
      case 1: {
        const km = meters / 1000;
        return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
      }
      case 2: {
        const miles = meters / 1609.344;
        return miles < 10 ? `${miles.toFixed(2)}mi` : `${Math.round(miles)}mi`;
      }
      default:
        return formatDistance(meters);
    }
  };

  const handleOpenStepsDrawer = () => {
    setIsStepsDrawerVisible(true);
    onShowAllSteps?.(); // Notify parent to adjust map view
  };

  const handleCloseStepsDrawer = () => {
    setIsStepsDrawerVisible(false);
  };

  const handleMenuToggle = () => {
    if (!showMenu) openMenu();
    else closeMenu();
  };

  const handleAddStep = () => {
    setShowMenu(false);
    onAddNavigationStep?.();
  };

  const handleStopFromMenu = () => {
    closeMenu(() => handleStopNavigation());
  };

  // Animated menu control
  const [menuVisible, setMenuVisible] = useState(false); // controls Modal visible
  const menuAnim = React.useRef(new Animated.Value(0)).current; // 0..1

  const openMenu = () => {
    setMenuVisible(true);
    // small delay to ensure modal is visible
    requestAnimationFrame(() => {
      Animated.spring(menuAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
    setShowMenu(true);
  };

  const closeMenu = (cb?: () => void) => {
    // sequence: slight pop then exit
    Animated.sequence([
      Animated.timing(menuAnim, {
        toValue: 1.05,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMenuVisible(false);
      setShowMenu(false);
      menuAnim.setValue(0);
      if (cb) cb();
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Barre de guidage en haut - Prochaine étape */}
      <SafeAreaView>
        {isLoadingRoute ? (
          <View style={styles.loadingTopGuidance}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>Chargement de l'itinéraire</Text>
          </View>
        ) : (
          <View style={styles.topGuidance}>
            <View style={styles.maneuverContainer}>
              <Icon
                name={
                  NavigationService.getManeuverIcon(
                    navigationState.nextStep?.maneuver || "straight"
                  ) as any
                }
                size={32}
                color="#007AFF"
              />
            </View>
            <View style={styles.instructionContainer}>
              <Text style={styles.instruction} numberOfLines={2}>
                {navigationState.nextStep?.instruction ||
                  "Continuer tout droit"}
              </Text>
              <Text style={styles.streetName} numberOfLines={1}>
                {navigationState.nextStep?.streetName || ""}
              </Text>
            </View>
            <View style={styles.distanceContainer}>
              <Text style={styles.distanceToNext}>
                {formatDistance(navigationState.distanceToNextStep)}
              </Text>
              <Text style={styles.direction}>
                {navigationState.nextStep?.direction || ""}
              </Text>
            </View>
          </View>
        )}

        {/* Barre de recalcul (montrée si le parent demande un recalcul ou si ce composant charge la route) */}
        {(isRecalculatingRoute || isLoadingRoute) && (
          <View style={styles.recalculatingBar}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.recalculatingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Barre de statut en bas - Informations globales ou prompt de recentrage */}
      <View style={styles.bottomGuidance}>
        {showRecenterPrompt ? (
          // Affichage du prompt de recentrage avec compte à rebours visuel
          <TouchableOpacity
            onPress={onManualRecenter}
            activeOpacity={0.8}
            style={styles.recenterButton}
          >
            <Animated.View
              style={[
                styles.recenterPromptContainer,
                {
                  // light blue progress background based on progressAnim
                  backgroundColor: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["rgba(255,255,255,1)", "rgba(220,235,255,1)"],
                  }) as any,
                },
              ]}
            >
              <View style={styles.recenterMain}>
                <Text style={styles.recenterText}>Recentrer ?</Text>
                <Icon name="my-location" size={24} color="#007AFF" />
              </View>

              {/* Countdown badge - only show last 3 seconds with numbers 3,2,1 */}
              {recenterRemainingMs !== null && recenterRemainingMs <= 3000 && (
                <View style={styles.countdownContainer} pointerEvents="none">
                  <Animated.View
                    style={[
                      styles.countdownBar,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                  <View style={styles.countdownBadge}>
                    <Text style={styles.countdownText}>
                      {Math.ceil(recenterRemainingMs / 1000)}
                    </Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>
        ) : (
          // Affichage normal des statistiques
          <View style={styles.statsContainer}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => setTimeMode((m) => (m + 1) % 3)}
            >
              <Icon name="schedule" size={20} color="#666" />
              <Text style={styles.statLabel}>Temps restant</Text>
              <Text style={styles.statValue}>
                {formatTimeByMode(navigationState.remainingDuration, timeMode)}
              </Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              style={styles.statItem}
              onPress={() => setDistanceMode((m) => (m + 1) % 3)}
            >
              <Icon name="straighten" size={20} color="#666" />
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>
                {formatDistanceByMode(navigationState.remainingDistance, distanceMode)}
              </Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              style={styles.statItem}
              onPress={handleOpenStepsDrawer}
            >
              <Icon name="list" size={20} color="#007AFF" />
              <Text style={styles.statLabel}>Étapes</Text>
              <Text style={styles.stepCounter}>
                {navigationState.currentStepIndex + 1}/
                {navigationState.steps.length}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.menuButton} onPress={handleMenuToggle}>
          <Icon name="more-vert" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Indicateur de limite de vitesse - en dessous du bandeau de navigation */}
      <SpeedLimitIndicator
        visible={visible}
        currentLocation={currentLocation}
      />

      {/* Menu contextuel */}
      {!showRecenterPrompt && (
        <Modal
          visible={menuVisible}
          transparent={true}
          animationType="none"
          onRequestClose={() => closeMenu()}
        >
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => closeMenu()}
          >
            <Animated.View
              style={[
                styles.menuContainer,
                {
                  transform: [
                    {
                      translateY: menuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                      }),
                    },
                    {
                      scale: menuAnim.interpolate({
                        inputRange: [0, 1.05],
                        outputRange: [0.98, 1],
                      }),
                    },
                  ],
                  opacity: menuAnim,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  closeMenu(() => handleAddStep());
                }}
              >
                <Icon name="add-location" size={20} color="#333" />
                <Text style={styles.menuItemText}>Ajouter une étape</Text>
              </TouchableOpacity>

              <View style={styles.menuSeparator} />

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={() => closeMenu(() => handleStopNavigation())}
              >
                <Icon name="stop" size={20} color="#FF3B30" />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                  Arrêter la navigation
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* AllStepsDrawer */}
      <AllStepsDrawer
        visible={isStepsDrawerVisible}
        onClose={handleCloseStepsDrawer}
        steps={navigationState.steps}
        currentStepIndex={navigationState.currentStepIndex}
        totalDistance={navigationState.steps.reduce(
          (total, step) => total + step.distance,
          0
        )}
        totalDuration={navigationState.steps.reduce(
          (total, step) => total + step.duration,
          0
        )}
        remainingDistance={navigationState.remainingDistance}
        remainingDuration={navigationState.remainingDuration}
        distanceToNextStep={navigationState.distanceToNextStep}
        currentStepDistance={
          navigationState.steps[navigationState.currentStepIndex]?.distance || 0
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    pointerEvents: "box-none",
  },

  // Barre de guidage en haut
  topGuidance: {
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  maneuverContainer: {
    width: 48,
    height: 48,
    backgroundColor: "#F0F8FF",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  loadingTopGuidance: {
    backgroundColor: "white",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#333",
  },
  instructionContainer: {
    flex: 1,
    marginRight: 12,
  },
  instruction: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  streetName: {
    fontSize: 14,
    color: "#666",
  },
  distanceContainer: {
    alignItems: "flex-end",
  },
  distanceToNext: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007AFF",
  },
  direction: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },

  // Barre de statut en bas
  bottomGuidance: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 34, // Pour l'encoche iPhone
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  statsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 2,
  },
  stepCounter: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    marginTop: 2,
  },
  separator: {
    width: 1,
    height: 30,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 8,
  },
  stopButton: {
    width: 48,
    height: 48,
    backgroundColor: "#FF3B30",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 16,
  },
  menuButton: {
    width: 48,
    height: 48,
    backgroundColor: "#666",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 16,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 100, // Espacement au-dessus de la barre de navigation
  },
  menuContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    // shadow removed
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuItemDanger: {
    // Pas de style spécial, juste pour la différenciation
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginLeft: 12,
  },
  menuItemTextDanger: {
    color: "#FF3B30",
    fontWeight: "600",
  },
  menuSeparator: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 16,
  },

  // Styles pour la barre de recalcul
  recalculatingBar: {
    backgroundColor: "#F0F0F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  countdownContainer: {
    position: "absolute",
    right: 8,
    top: -6,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  countdownBar: {
    position: "absolute",
    left: 0,
    top: 24,
    height: 6,
    backgroundColor: "rgba(0,122,255,0.2)",
    borderRadius: 3,
  },
  countdownBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8F4FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,122,255,0.2)",
  },
  countdownText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  recalculatingText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#007AFF",
    marginLeft: 8,
  },

  // Styles pour le prompt de recentrage
  recenterMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  recenterPromptContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    width: "auto",
  },
  recenterText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  recenterButton: {
    width: "50%",
  },
});
