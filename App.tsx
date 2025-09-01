import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Modal,
  Alert,
  Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapContainer from "./components/MapContainer";
import ControlButtons from "./components/ControlButtons";
import ExpandableSearch from "./components/ExpandableSearch";
import RouteDrawer from "./components/RouteDrawer";
import POIDrawer from "./components/POIDrawer";
import MultiStepRouteDrawer from "./components/MultiStepRouteDrawer";
import NavigationGuidance from "./components/NavigationGuidance";
import LocationInfoDrawer from "./components/LocationInfoDrawer";
import NavigationStepDrawer from "./components/NavigationStepDrawer";
import ArrivalDrawer from "./components/ArrivalDrawer";
import ParkingDrawer from "./components/ParkingDrawer";
import { MapViewProvider } from "./contexts/MapViewContext";
import { useLocationAndNavigation } from "./hooks/useLocationAndNavigation";
import { useMapControls } from "./hooks/useMapControls";
import { OverpassPOI, OverpassService } from "./services/OverpassService";
import { RouteStep } from "./types/RouteTypes";
import { Coordinate } from "./services/RouteService";
import NavigationService from "./services/NavigationService";
import { LastTripStorage, LastTripData } from "./services/LastTripStorage";
import ResumeTripModal from "./components/ResumeTripModal";
import { SafetyTestConfig } from "./config/SafetyTestConfig";

export default function Map() {
  return (
    <MapViewProvider>
      <MapContent />
    </MapViewProvider>
  );
}

function MapContent() {
  // Log de la configuration du système de sécurité au démarrage
  useEffect(() => {
    SafetyTestConfig.logConfiguration();
  }, []);

  const [search, setSearch] = useState("");
  const [showRouteDrawer, setShowRouteDrawer] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);

  // États pour les POI
  const [showPOIDrawer, setShowPOIDrawer] = useState(false);
  const [selectedAmenityType, setSelectedAmenityType] = useState<string>("");
  const [poiRadius, setPOIRadius] = useState(1000);
  const [selectedPOI, setSelectedPOI] = useState<OverpassPOI | null>(null);
  const [allPOIs, setAllPOIs] = useState<OverpassPOI[]>([]);

  // État pour mémoriser si le mode suivi était actif avant de calculer une route
  const [wasFollowingBeforeRoute, setWasFollowingBeforeRoute] = useState(false);
  // États pour les itinéraires multi-étapes
  const [showMultiStepDrawer, setShowMultiStepDrawer] = useState(false);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [multiStepRouteCoords, setMultiStepRouteCoords] = useState<any[]>([]);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);

  // États pour la navigation
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationSteps, setNavigationSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const [showNavigationGuidance, setShowNavigationGuidance] = useState(false);
  const [pendingRouteRequest, setPendingRouteRequest] = useState<{
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    mode: string;
  } | null>(null);

  // États pour la progression de navigation
  const [completedRouteCoords, setCompletedRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [remainingRouteCoords, setRemainingRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [progressPercentage, setProgressPercentage] = useState(0);

  // États pour le parking
  const [showParkingDrawer, setShowParkingDrawer] = useState(false);
  const [parkingLocation, setParkingLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Modal de reprise de trajet
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [lastTrip, setLastTrip] = useState<LastTripData | null>(null);

  // États pour le système de sécurité routière
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showRestReminder, setShowRestReminder] = useState(false);
  const [safetyChoice, setSafetyChoice] = useState<
    "remind" | "rest-stops" | "ignore" | null
  >(null);
  const [restReminderTimer, setRestReminderTimer] =
    useState<NodeJS.Timeout | null>(null);
  const [navigationStartTime, setNavigationStartTime] = useState<Date | null>(
    null
  );
  const [longTripDuration, setLongTripDuration] = useState<number>(0); // en minutes

  // Position personnalisée pour la recherche POI (position future pour sécurité routière)
  const [customPOILocation, setCustomPOILocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isFutureLocationSearch, setIsFutureLocationSearch] = useState(false);
  // Au démarrage, charger le dernier trajet inachevé
  useEffect(() => {
    (async () => {
      const trip = await LastTripStorage.load();
      if (
        trip &&
        trip.destination &&
        trip.mode &&
        trip.routeSteps?.length > 0
      ) {
        setLastTrip(trip);
        setResumeModalVisible(true);
      }
    })();
  }, []);
  // Handler pour valider la reprise du trajet
  const handleResumeTrip = async (mode: string) => {
    if (!lastTrip) return;
    setResumeModalVisible(false);
    // Relancer la navigation avec les infos stockées
    await NavigationService.startNavigation(
      lastTrip.routeSteps,
      undefined,
      mode,
      lastTrip.fullRouteCoordinates,
      lastTrip.destination
    );
    setIsNavigating(true);
    // Nettoyer le storage (sera aussi fait par NavigationService)
    await LastTripStorage.clear();
    setLastTrip(null);
  };

  // Handler pour annuler le trajet sauvegardé
  const handleCancelResumeTrip = async () => {
    setResumeModalVisible(false);
    await LastTripStorage.clear();
    setLastTrip(null);
  };

  // Fonctions pour le système de sécurité routière
  const checkTripSafety = (durationInMinutes: number) => {
    if (durationInMinutes > SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES) {
      setLongTripDuration(durationInMinutes);
      setShowSafetyModal(true);
      return true;
    }
    return false;
  };

  const handleSafetyChoice = (choice: "remind" | "rest-stops" | "ignore") => {
    setSafetyChoice(choice);
    setShowSafetyModal(false);

    switch (choice) {
      case "remind":
        // Programmer un rappel dans 2 heures (config automatique selon le mode test/production)
        const reminderTimer = setTimeout(() => {
          setShowRestReminder(true);
        }, SafetyTestConfig.getReminderDelayMs());
        setRestReminderTimer(reminderTimer);
        setNavigationStartTime(new Date());
        break;

      case "rest-stops":
        // Rechercher et ajouter des aires de repos automatiquement
        handleFindRestStops();
        break;

      case "ignore":
        // Ne rien faire, continuer normalement
        break;
    }

    // Démarrer la navigation maintenant
    startNavigationAfterSafetyChoice();
  };

  const startNavigationAfterSafetyChoice = () => {
    if (navigationSteps.length > 0) {
      // Utiliser le mode de transport approprié
      const transportMode = navigationMode || "driving";
      let osrmMode = "driving";

      if (transportMode === "walking") {
        osrmMode = "foot";
        startWalkingNavigation();
      } else {
        osrmMode = "driving";
        startDrivingNavigation();
      }

      NavigationService.startNavigation(
        navigationSteps,
        routeService,
        osrmMode
      );
      setIsNavigating(true);
      setShowMultiStepDrawer(false);
      setShowRouteDrawer(false);
    }
  };

  // Fonction pour calculer la position estimée dans X heures selon la route
  const calculateFuturePosition = (
    hoursAhead: number
  ): { latitude: number; longitude: number } | null => {
    if (
      !location ||
      !routeCoords ||
      routeCoords.length === 0 ||
      !isNavigating
    ) {
      return null;
    }

    // Vitesse moyenne estimée selon le mode de transport (km/h)
    const averageSpeeds = {
      driving: 50, // 50 km/h en moyenne (ville + route)
      walking: 5, // 5 km/h à pied
      cycling: 15, // 15 km/h à vélo
    };

    const currentSpeed =
      averageSpeeds[navigationMode as keyof typeof averageSpeeds] ||
      averageSpeeds.driving;

    // Distance à parcourir en X heures (en kilomètres, puis convertie en mètres)
    const targetDistanceMeters = hoursAhead * currentSpeed * 1000;

    // Fonction pour calculer la distance entre deux points
    const getDistance = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ): number => {
      const R = 6371e3; // Rayon de la Terre en mètres
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    // Parcourir la route depuis la position actuelle
    let accumulatedDistance = 0;
    let currentLat = location.latitude;
    let currentLon = location.longitude;

    // Trouver le point de route le plus proche de notre position actuelle
    let closestPointIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const distance = getDistance(
        currentLat,
        currentLon,
        routeCoords[i].latitude,
        routeCoords[i].longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = i;
      }
    }

    // Partir du point le plus proche et avancer sur la route
    for (let i = closestPointIndex; i < routeCoords.length - 1; i++) {
      const pointA = routeCoords[i];
      const pointB = routeCoords[i + 1];

      const segmentDistance = getDistance(
        pointA.latitude,
        pointA.longitude,
        pointB.latitude,
        pointB.longitude
      );

      if (accumulatedDistance + segmentDistance >= targetDistanceMeters) {
        // La position cible est sur ce segment
        const remainingDistance = targetDistanceMeters - accumulatedDistance;
        const ratio = remainingDistance / segmentDistance;

        const futurePosition = {
          latitude:
            pointA.latitude + (pointB.latitude - pointA.latitude) * ratio,
          longitude:
            pointA.longitude + (pointB.longitude - pointA.longitude) * ratio,
        };

        return futurePosition;
      }

      accumulatedDistance += segmentDistance;
    }

    // Si on arrive ici, la destination est plus proche que X heures
    // Retourner la destination finale
    const finalPosition = routeCoords[routeCoords.length - 1];
    return finalPosition;
  };

  const handleFindRestStops = async () => {
    if (!location) return;

    try {
      // Calculer la position dans 2 heures (ou selon la config)
      const twoHoursFromNow = calculateFuturePosition(
        SafetyTestConfig.IS_TEST_MODE ? 0.17 : 2
      ); // 10 minutes en mode test, 2h en production

      if (!twoHoursFromNow) {
        // Fallback sur la position actuelle si on ne peut pas calculer
        setCustomPOILocation(null);
        setIsFutureLocationSearch(false);
        handleShowPOI("fuel");
        return;
      }

      // Définir la position personnalisée pour la recherche POI
      setCustomPOILocation(twoHoursFromNow);
      setIsFutureLocationSearch(true);

      handleShowPOI("fuel"); // Commencer par les stations essence qui ont souvent des aires de repos
    } catch (error) {
      console.error("Erreur lors de la recherche d'aires de repos:", error);
      // Fallback sur la position actuelle
      setCustomPOILocation(null);
      setIsFutureLocationSearch(false);
      handleShowPOI("fuel");
    }
  };

  const handleRestReminderAction = (
    action: "rest" | "find-stop" | "ignore"
  ) => {
    setShowRestReminder(false);

    switch (action) {
      case "rest":
        // Proposer de chercher une aire de repos
        handleFindRestStops();
        break;

      case "find-stop":
        // Chercher directement des aires de repos
        handleFindRestStops();
        break;

      case "ignore":
        // Programmer un nouveau rappel dans 2 heures (config automatique selon le mode test/production)
        const newReminderTimer = setTimeout(() => {
          setShowRestReminder(true);
        }, SafetyTestConfig.getRepeatedReminderDelayMs());
        setRestReminderTimer(newReminderTimer);
        break;
    }
  };

  // Nettoyer les timers quand la navigation s'arrête
  const cleanupSafetyTimers = () => {
    if (restReminderTimer) {
      clearTimeout(restReminderTimer);
      setRestReminderTimer(null);
    }
    setSafetyChoice(null);
    setNavigationStartTime(null);
    setLongTripDuration(0);
  };

  // État pour le drawer d'informations de lieu
  const [showLocationInfoDrawer, setShowLocationInfoDrawer] = useState(false);
  const [selectedLocationCoordinate, setSelectedLocationCoordinate] =
    useState<Coordinate | null>(null);
  const [showLocationPoint, setShowLocationPoint] = useState(false);

  // États pour le drawer d'étape de navigation
  const [showNavigationStepDrawer, setShowNavigationStepDrawer] =
    useState(false);
  const [selectedNavigationStep, setSelectedNavigationStep] =
    useState<any>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  // États pour le drawer d'arrivée
  const [showArrivalDrawer, setShowArrivalDrawer] = useState(false);
  const [hasReachedDestination, setHasReachedDestination] = useState(false);

  // État pour le parking sélectionné
  const [selectedParking, setSelectedParking] = useState<{
    coordinate: Coordinate;
    name: string;
  } | null>(null);

  // État pour bloquer les animations automatiques pendant la sélection de parking
  const [isParkingAnimating, setIsParkingAnimating] = useState(false);

  // État pour le modal de recherche pendant la navigation
  const [showNavigationSearch, setShowNavigationSearch] = useState(false);

  // Fonction utilitaire pour calculer les coordonnées ajustées selon le drawer padding
  const getAdjustedCoordinate = (
    coordinate: Coordinate,
    zoomLevel?: number,
    pitch?: number,
    drawerHeight: number = 0 // hauteur du drawer en pixels (0 si aucun)
  ) => {
    const screenHeight = Dimensions.get("window").height;

    // Si aucun drawer, conserver le comportement centré par défaut
    if (!drawerHeight || drawerHeight <= 0) {
      return {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        pitch: pitch || 0,
      };
    }

    // Placer le POI légèrement au-dessus du drawer (marge fixe) plutôt que
    // centrer la zone visible — évite des offsets trop importants.
    const DEFAULT_MARGIN_PX = 80; // distance en pixels au-dessus du drawer
    const margin = DEFAULT_MARGIN_PX;

    // Calculer la position Y désirée en pixels depuis le haut de l'écran
    let desiredY = screenHeight - drawerHeight - margin;
    // Clamp pour éviter valeurs extrêmes
    const minY = 40;
    const maxY = screenHeight - drawerHeight - 10;
    if (desiredY < minY) desiredY = minY;
    if (desiredY > maxY) desiredY = maxY;

    const screenCenterY = screenHeight / 2;
    const pixelOffset = desiredY - screenCenterY; // négatif si above center

    // Estimer les mètres/pixel en WebMercator pour le zoom donné
    const usedZoom = zoomLevel || 13;
    const latRad = (coordinate.latitude * Math.PI) / 180;
    // m/px = 156543.03392 * cos(lat) / 2^zoom
    const metersPerPixel =
      (156543.03392 * Math.cos(latRad)) / Math.pow(2, usedZoom);

    // Convertir pixels -> mètres -> degrés latitude
    const metersPerDegreeLat = 111320; // approx. à la latitude moyenne
    const offsetMeters = pixelOffset * metersPerPixel;
    const offsetLat = offsetMeters / metersPerDegreeLat;

    return {
      latitude: coordinate.latitude + offsetLat,
      longitude: coordinate.longitude,
      pitch: pitch || 0,
    };
  };

  const {
    location,
    headingAnim,
    destination,
    routeCoords,
    currentHeading,
    setDestination,
    getRoute,
    getHybridRouteFromCurrentLocation,
    directLineCoords,
    nearestRoadPoint,
    hasDirectLineSegment,
    routeService,
    clearRoute,
    clearRouteKeepDestination,
    // Nouvelle propriété pour la direction de la route
    routeDirection,
  } = useLocationAndNavigation();

  const {
    recenterMap,
    animateToCoordinate,
    animateToCoordinateLocked,
    fitToRoute,
    compassMode,
    toggleCompassMode,
    updateMapHeading,
    isFollowingUser,
    followUserLocation,
    handleMapPanDrag,
    disableFollowModeTemporarily,
    reactivateFollowMode,
    setDrawerPadding,
    drawerPadding,
    clearDrawerPadding,
    setDrawerCameraControl,
    releaseDrawerCameraControl,
    // Nouvelles fonctions de navigation
    isNavigating: isMapNavigating,
    navigationMode,
    startWalkingNavigation,
    startDrivingNavigation,
    startNavigationForMode,
    stopNavigation,
    adjustNavigationCamera,
    calculateDistance,
    // Nouvelles fonctions pour le recentrage automatique
    showRecenterPrompt,
    manualRecenter,
  } = useMapControls();

  // État local pour forcer l'orientation de la caméra (null = pas d'override)
  const [cameraHeadingOverride, setCameraHeadingOverride] = useState<
    number | null
  >(null);

  // Refs pour limiter la fréquence des appels à updateMapHeading
  const lastSentHeadingRef = React.useRef<number | null>(null);
  const lastSentHeadingTimeRef = React.useRef<number>(0);

  useEffect(() => {
    // En navigation, forcer la rotation de la carte pour se placer derrière la flèche
    if (isMapNavigating) {
      // Si on suit une route et qu'on est sur la route, utiliser le bearing de la route
      const headingToUse =
        routeDirection && routeDirection.isOnRoute
          ? routeDirection.bearing
          : currentHeading;

      if (headingToUse !== undefined && headingToUse !== null) {
        // Normaliser l'angle et éviter les appels répétés
        const normalize = (a: number) => ((a % 360) + 360) % 360;
        const now = Date.now();
        const last = lastSentHeadingRef.current;
        const lastTime = lastSentHeadingTimeRef.current;
        const h = normalize(headingToUse);

        let shouldUpdate = true;
        if (last !== null) {
          // Calculer la plus petite différence angulaire
          let diff = Math.abs(h - last);
          if (diff > 180) diff = 360 - diff;
          // Seuil pour éviter updates infimes
          if (diff < 2 && now - lastTime < 500) {
            shouldUpdate = false;
          }
        }

        if (shouldUpdate) {
          lastSentHeadingRef.current = h;
          lastSentHeadingTimeRef.current = now;
          // Utiliser l'état local en priorité pour piloter la caméra
          setCameraHeadingOverride(h);
        }
      }
      return;
    }

    // Si on n'est pas en navigation, annuler tout override
    setCameraHeadingOverride(null);

    // Comportement normal : mettre à jour uniquement si on est en mode 'heading'
    if (currentHeading !== undefined && compassMode === "heading") {
      updateMapHeading(currentHeading);
    }
  }, [
    currentHeading,
    compassMode,
    updateMapHeading,
    isMapNavigating,
    routeDirection,
  ]);

  // Suivre automatiquement l'utilisateur quand le mode suivi est actif
  // mais pas quand on vient de sélectionner un parking ou un point d'intérêt
  useEffect(() => {
    // PROTECTION ABSOLUE : Ne jamais suivre l'utilisateur si un parking est sélectionné
    // ou si une animation de parking n'est en cours
    if (
      location &&
      isFollowingUser &&
      !selectedParking &&
      !showLocationInfoDrawer &&
      !showParkingDrawer &&
      !isParkingAnimating
    ) {
      // Délai supplémentaire pour s'assurer qu'aucune animation de parking n'est en cours
      const delayBeforeFollow = selectedParking ? 2000 : 0; // 2 secondes après sélection de parking

      setTimeout(() => {
        // Vérifier à nouveau que les conditions sont toujours valides
        if (isFollowingUser && !selectedParking && !isParkingAnimating) {
          followUserLocation(location);
        } else {
        }
      }, delayBeforeFollow);
    } else {
      if (location && isFollowingUser) {
      }
    }
  }, [
    location,
    isFollowingUser,
    selectedParking,
    showLocationInfoDrawer,
    showParkingDrawer,
    isParkingAnimating,
  ]);

  // Ajuster la caméra automatiquement pendant la navigation
  useEffect(() => {
    if (location && isMapNavigating && !isParkingAnimating) {
      const currentNavState = NavigationService.getCurrentState();

      const computeBearingTo = (
        from: { latitude: number; longitude: number },
        to: { latitude: number; longitude: number }
      ) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const toDeg = (d: number) => (d * 180) / Math.PI;
        const lat1 = toRad(from.latitude);
        const lat2 = toRad(to.latitude);
        const dLon = toRad(to.longitude - from.longitude);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
          Math.cos(lat1) * Math.sin(lat2) -
          Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
        return brng;
      };

      if (currentNavState.nextStep && currentNavState.isNavigating) {
        const nextStepLocation = {
          latitude: currentNavState.nextStep.coordinates[1], // Latitude
          longitude: currentNavState.nextStep.coordinates[0], // Longitude
        };

        // Déterminer headingOverride : priorité au routeDirection si on est sur la route
        let headingOverride: number | undefined;
        if (routeDirection && routeDirection.isOnRoute) {
          headingOverride = routeDirection.bearing;
        } else {
          headingOverride = computeBearingTo(location, nextStepLocation);
        }

        // Passer la distance à la prochaine étape pour le zoom adaptatif
        adjustNavigationCamera(
          location,
          nextStepLocation,
          currentNavState.distanceToNextStep,
          headingOverride
        );
      } else if (destination) {
        // Fallback sur la destination générale si pas d'étape spécifique
        const headingOverride =
          routeDirection && routeDirection.isOnRoute
            ? routeDirection.bearing
            : computeBearingTo(location, destination);

        adjustNavigationCamera(
          location,
          destination,
          undefined,
          headingOverride
        );
      }
    }
  }, [
    location,
    isMapNavigating,
    adjustNavigationCamera,
    isParkingAnimating,
    routeDirection,
    destination,
  ]);

  // Écouter les changements de NavigationService
  useEffect(() => {
    const handleNavigationUpdate = (navigationState: any) => {
      setNavigationSteps(navigationState.steps);
      setCurrentStepIndex(navigationState.currentStepIndex);

      // Mettre à jour les données de progression
      if (navigationState.completedRouteCoordinates) {
        setCompletedRouteCoords(
          navigationState.completedRouteCoordinates.map(
            (coord: [number, number]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          )
        );
      }

      if (navigationState.remainingRouteCoordinates) {
        setRemainingRouteCoords(
          navigationState.remainingRouteCoordinates.map(
            (coord: [number, number]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          )
        );
      }

      if (navigationState.progressPercentage !== undefined) {
        setProgressPercentage(navigationState.progressPercentage);
      }
    };

    NavigationService.addListener(handleNavigationUpdate);

    return () => {
      NavigationService.removeListener(handleNavigationUpdate);
    };
  }, []);

  // Gérer le padding du viewport quand les drawers s'ouvrent/ferment
  useEffect(() => {
    if (showRouteDrawer) {
      setDrawerPadding(180); // réduire le padding pour laisser plus d'espace pour la carte
      setDrawerCameraControl("route-drawer");
    } else if (showMultiStepDrawer) {
      setDrawerPadding(350); // 350px pour le MultiStepDrawer (un peu plus haut)
      setDrawerCameraControl("multistep-drawer");
    } else if (showLocationInfoDrawer) {
      setDrawerPadding(200); // 200px pour le LocationInfoDrawer (plus petit)
      setDrawerCameraControl("location-info-drawer");
    } else if (showNavigationStepDrawer) {
      setDrawerPadding(250); // 250px pour le NavigationStepDrawer
      setDrawerCameraControl("navigation-step-drawer");
    } else if (showArrivalDrawer) {
      setDrawerPadding(400); // 400px pour le ArrivalDrawer (le plus grand)
      setDrawerCameraControl("arrival-drawer");
    } else if (showParkingDrawer) {
      setDrawerPadding(350); // 350px pour le ParkingDrawer
      // Le contrôle est déjà pris dans handleSelectParking
    } else if (showPOIDrawer) {
      setDrawerPadding(400);
      setDrawerCameraControl("poi-drawer");
    } else {
      clearDrawerPadding();
      releaseDrawerCameraControl(); // Relâcher le contrôle quand aucun drawer n'est ouvert
    }
  }, [
    showRouteDrawer,
    showMultiStepDrawer,
    showLocationInfoDrawer,
    showNavigationStepDrawer,
    showArrivalDrawer,
    showParkingDrawer,
    showPOIDrawer,
  ]);

  // Détection automatique de l'arrivée à destination
  useEffect(() => {
    if (isNavigating && location && destination && !hasReachedDestination) {
      // Calculer la distance entre la position actuelle et la destination
      const distance = getDistanceBetweenPoints(
        location.latitude,
        location.longitude,
        destination.latitude,
        destination.longitude
      );

      // Seuil d'arrivée: 20 mètres (ajustable selon les besoins)
      const arrivalThreshold = 20; // mètres

      if (distance <= arrivalThreshold) {
        handleArrivalAtDestination();
      }
    }
  }, [location, destination, isNavigating, hasReachedDestination]);

  // Fonction pour calculer la distance entre deux points (formule haversine)
  const getDistanceBetweenPoints = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371000; // Rayon de la Terre en mètres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance en mètres
  };

  const handleSelectLocation = async (result: any) => {
    // Mémoriser si le mode suivi était actif et le désactiver temporairement
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    // Réinitialiser l'état d'arrivée pour une nouvelle destination
    setHasReachedDestination(false);
    setShowArrivalDrawer(false);

    const coord = {
      latitude: result.latitude,
      longitude: result.longitude,
    };

    setDestination(coord);

    if (location) {
      await getHybridRouteFromCurrentLocation(coord, "driving");

      // Ajuster la vue pour afficher le trajet complet
      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true // Le drawer sera visible
      );
    } else {
      // Si pas de localisation, simplement animer vers la destination avec ajustement pour le drawer
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        undefined,
        undefined,
        0
      );
      animateToCoordinate(adjustedCoord);
    }

    setShowRouteDrawer(true);
    setSelectedDestination({
      title: result.title || result.display_name || "",
      subtitle: result.subtitle || "",
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const handleShowRoute = (result: any) => {
    setSelectedDestination({
      title: result.title,
      subtitle: result.subtitle,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    // Move camera to the searched place so user sees it immediately when drawer opens
    const coord = { latitude: result.latitude, longitude: result.longitude };
    // Use the adjusted coordinate helper to compensate for the drawer height
    const adjusted = getAdjustedCoordinate(coord, undefined, undefined, 180);
    animateToCoordinate(adjusted, 15);
    setShowRouteDrawer(true);
  };

  // Gestion des clics sur la carte pour ouvrir le LocationInfoDrawer
  const handleMapPress = (coordinate: Coordinate) => {
    // Désactiver temporairement le suivi utilisateur si activé
    disableFollowModeTemporarily();

    const screenHeight = Dimensions.get("window").height;
    const latitudeDelta = 0.01; // Remplacez par le delta actuel de la carte si possible

    // Calcul du décalage en latitude pour compenser le DrawerPadding
    const offsetLat = (drawerPadding / screenHeight) * latitudeDelta;

    const adjustedCoordinate = {
      latitude: coordinate.latitude + offsetLat, // Décaler vers le nord selon le padding
      longitude: coordinate.longitude,
    };

    animateToCoordinate(adjustedCoordinate, 17); // Zoom serré pour voir le détail

    // Ouvrir le LocationInfoDrawer
    setSelectedLocationCoordinate(coordinate);
    setShowLocationInfoDrawer(true);
  };

  // Nouvelle fonction pour démarrer un itinéraire depuis le LocationInfoDrawer
  const handleStartRouteFromLocation = (coordinate: Coordinate) => {
    // Fermer le LocationInfoDrawer
    setShowLocationInfoDrawer(false);

    // Réinitialiser l'état d'arrivée
    setHasReachedDestination(false);
    setShowArrivalDrawer(false);

    // Si on n'est pas en navigation, procéder normalement
    if (!isNavigating) {
      // Mémoriser si le mode suivi était actif et le désactiver temporairement
      const wasFollowing = disableFollowModeTemporarily();
      setWasFollowingBeforeRoute(wasFollowing);

      setSelectedDestination({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
      setShowRouteDrawer(true);
    } else {
      // Si on est en navigation, l'alerte a déjà été gérée dans LocationInfoDrawer
      // On peut maintenant abandonner la navigation et créer une nouvelle route
      handleStopNavigation();

      // Attendre un petit délai pour que la navigation s'arrête complètement
      setTimeout(() => {
        const wasFollowing = disableFollowModeTemporarily();
        setWasFollowingBeforeRoute(wasFollowing);

        setSelectedDestination({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        });
        setShowRouteDrawer(true);
      }, 100);
    }
  };

  // Fonction pour gérer le clic sur une étape de navigation
  const handleNavigationStepPress = (stepIndex: number, step: any) => {
    setSelectedStepIndex(stepIndex);
    setSelectedNavigationStep(step);
    setShowNavigationStepDrawer(true);

    // Zoomer sur l'étape sélectionnée avec ajustement pour le drawer
    if (step && step.coordinates) {
      const coord = {
        latitude: step.coordinates[1], // Latitude
        longitude: step.coordinates[0], // Longitude
      };
      const adjustedCoord = getAdjustedCoordinate(coord, 17, undefined, 250); // navigation-step drawer height ~250
      animateToCoordinate(adjustedCoord, 17); // Zoom plus serré pour voir l'étape en détail
    }
  };

  // Fonction pour fermer le drawer d'étape et revenir au zoom normal
  const handleCloseNavigationStepDrawer = () => {
    setShowNavigationStepDrawer(false);
    setSelectedNavigationStep(null);

    // Revenir au zoom de navigation si on est toujours en navigation
    if (isNavigating && location) {
      // Recentrer sur la position actuelle avec zoom de navigation
      animateToCoordinate(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        16
      ); // Zoom de navigation normal
    }
  };

  // Fonction pour gérer l'arrivée à destination
  const handleArrivalAtDestination = async () => {
    if (destination && location) {
      // Vérifier si c'est un arrêt intermédiaire (avec destination finale)
      const isIntermediateStop = selectedDestination?.finalDestination;

      if (isIntermediateStop) {
        // Debug: continuation to final destination
        try {
          setIsRecalculatingRoute(true);

          const finalDestination = selectedDestination?.finalDestination;
          if (finalDestination) {
            // Calculer la route vers la destination finale
            await getHybridRouteFromCurrentLocation(
              finalDestination,
              "driving"
            );

            // Calculer les étapes de navigation vers la destination finale
            const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${location.longitude},${location.latitude};${finalDestination.longitude},${finalDestination.latitude}?overview=full&geometries=geojson&steps=true&alternatives=true`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
              const navigationSteps =
                NavigationService.convertRouteToNavigationSteps(data);

              // Redémarrer la navigation vers la destination finale
              NavigationService.startNavigation(
                navigationSteps,
                routeService,
                navigationMode || "driving"
              );

              // Mettre à jour les états
              setNavigationSteps(navigationSteps);
              setCurrentStepIndex(0);
              setDestination(finalDestination);

              // Nettoyer la référence à l'arrêt intermédiaire
              setSelectedDestination({
                title: "Destination finale",
                subtitle: "",
                latitude: finalDestination.latitude,
                longitude: finalDestination.longitude,
              });
            }
          }
        } catch (error) {
          console.error("❌ Erreur lors de la reprise de navigation:", error);
          // En cas d'erreur, arrêter la navigation
          setIsNavigating(false);
          setHasReachedDestination(true);
          setShowArrivalDrawer(true);
        } finally {
          setIsRecalculatingRoute(false);
        }
      } else {
        // Arrivée à la destination finale
        setHasReachedDestination(true);
        setShowArrivalDrawer(true);
        setIsNavigating(false);

        // Zoom pour voir à la fois la destination et la position utilisateur avec ajustement pour le drawer
        const midLat = (destination.latitude + location.latitude) / 2;
        const midLng = (destination.longitude + location.longitude) / 2;

        const midCoord = {
          latitude: midLat,
          longitude: midLng,
        };
        const adjustedCoord = getAdjustedCoordinate(
          midCoord,
          15,
          undefined,
          400
        ); // arrival drawer ~400

        animateToCoordinate(adjustedCoord, 15); // Zoom pour voir les deux points
      }
    }
  };

  // Fonction pour fermer le drawer d'arrivée
  const handleCloseArrivalDrawer = () => {
    setShowArrivalDrawer(false);
    clearDrawerPadding();
  };

  // Fonction pour désactiver temporairement le suivi lors de l'ouverture du drawer d'arrivée
  const handleDisableFollowUserForArrival = () => {
    disableFollowModeTemporarily();
  };

  // Fonction pour réactiver le suivi lors de la fermeture du drawer d'arrivée
  const handleEnableFollowUserForArrival = () => {
    reactivateFollowMode();
  };

  // Fonction pour ajuster la caméra pour que l'utilisateur apparaisse au-dessus du drawer
  const handleAdjustCameraForArrival = (coordinate: Coordinate) => {
    if (location) {
      // Calculer le centre entre la position de l'utilisateur et la destination
      const centerLat = (location.latitude + coordinate.latitude) / 2;
      const centerLng = (location.longitude + coordinate.longitude) / 2;

      const centerCoord = {
        latitude: centerLat,
        longitude: centerLng,
      };
      const adjustedCoord = getAdjustedCoordinate(
        centerCoord,
        16,
        undefined,
        400
      ); // arrival drawer ~400

      animateToCoordinate(adjustedCoord, 16); // Zoom approprié pour voir les deux points
    }
  };

  // Fonction pour naviguer à nouveau vers la même destination
  const handleNavigateAgain = () => {
    setShowArrivalDrawer(false);
    setHasReachedDestination(false);
    if (destination) {
      // Relancer la navigation
      if (navigationMode === "driving") {
        startDrivingNavigation();
      } else {
        startWalkingNavigation();
      }
      setIsNavigating(true);
    }
  };

  // Fonction pour gérer l'affichage du point de location
  const handleShowLocationPoint = (show: boolean) => {
    setShowLocationPoint(show);

    // Si on masque le point, réactiver le suivi utilisateur SEULEMENT si pas de parking sélectionné
    if (!show && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
    }
  };

  // Gestion des étapes multiples
  const handleAddStep = (result: any) => {
    const newStep: RouteStep = {
      id: Date.now().toString(),
      title: result.title,
      subtitle: result.subtitle,
      latitude: result.latitude,
      longitude: result.longitude,
      type: result.type === "overpass" ? "poi" : "address",
      amenityType: result.amenityType,
    };

    setRouteSteps((prev) => [...prev, newStep]);
    setShowMultiStepDrawer(true);
  };

  const handleRemoveStep = (stepId: string) => {
    setRouteSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const handleReorderSteps = (newSteps: RouteStep[]) => {
    setRouteSteps(newSteps);
  };

  // Fonction pour ajouter un arrêt pendant la navigation
  const handleAddNavigationStop = async (result: any) => {
    if (!location) {
      console.warn(
        "⚠️ Position utilisateur non disponible pour ajouter un arrêt"
      );
      return;
    }

    try {
      // Créer un waypoint temporaire
      const stopCoordinate = {
        latitude: result.latitude,
        longitude: result.longitude,
      };

      // Afficher une alerte pour confirmer l'ajout de l'arrêt
      Alert.alert(
        "Ajouter un arrêt",
        `Voulez-vous faire un arrêt à "${result.title}" ?`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Ajouter l'arrêt",
            onPress: async () => {
              try {
                setIsRecalculatingRoute(true);

                // Sauvegarder la destination finale actuelle
                const finalDestination = destination;
                if (!finalDestination) {
                  throw new Error("Aucune destination finale trouvée");
                }
                // Debug: adding stopCoordinate

                // Calculer un itinéraire multi-étapes : Position actuelle -> Arrêt -> Destination finale
                const waypoints = [
                  `${location.longitude},${location.latitude}`, // Position actuelle
                  `${stopCoordinate.longitude},${stopCoordinate.latitude}`, // Arrêt
                  `${finalDestination.longitude},${finalDestination.latitude}`, // Destination finale
                ];

                const waypointsUrl = waypoints.join(";");
                const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${waypointsUrl}?overview=full&geometries=geojson&steps=true&alternatives=true`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                  // Calculer la nouvelle route hybride vers l'arrêt d'abord
                  await getHybridRouteFromCurrentLocation(
                    stopCoordinate,
                    "driving"
                  );

                  // Convertir les étapes pour NavigationService (tout l'itinéraire multi-étapes)
                  const navigationSteps =
                    NavigationService.convertRouteToNavigationSteps(data);

                  // Redémarrer la navigation avec l'itinéraire complet
                  NavigationService.startNavigation(
                    navigationSteps,
                    routeService,
                    navigationMode || "driving"
                  );

                  // Mettre à jour les étapes de navigation pour l'affichage
                  setNavigationSteps(navigationSteps);
                  setCurrentStepIndex(0);

                  // La destination affichée devient temporairement l'arrêt, mais la destination finale est conservée
                  setDestination(stopCoordinate);

                  // Stocker l'arrêt pour référence, mais garder la destination finale en mémoire
                  setSelectedDestination({
                    title: result.title,
                    subtitle: result.subtitle,
                    latitude: result.latitude,
                    longitude: result.longitude,
                    // Ajouter une propriété pour indiquer que c'est un arrêt temporaire
                    finalDestination: finalDestination,
                  });

                  // Ajuster la vue pour montrer la nouvelle route
                  if (fitToRoute) {
                    setTimeout(() => {
                      fitToRoute(
                        {
                          latitude: location.latitude,
                          longitude: location.longitude,
                        },
                        stopCoordinate,
                        routeCoords,
                        false // Pas de drawer visible
                      );
                    }, 500); // Délai pour s'assurer que routeCoords est mis à jour
                  }
                  // Afficher une notification de succès
                  Alert.alert(
                    "Arrêt ajouté avec succès",
                    `L'arrêt "${result.title}" a été ajouté à votre itinéraire. Vous continuerez ensuite vers votre destination finale.`
                  );
                } else {
                  throw new Error(
                    "Aucune route trouvée pour l'itinéraire avec arrêt"
                  );
                }
              } catch (error) {
                console.error("❌ Erreur lors de l'ajout de l'arrêt:", error);
                Alert.alert(
                  "Erreur",
                  "Impossible d'ajouter cet arrêt. Veuillez réessayer."
                );
              } finally {
                // Masquer le spinner de recalcul
                setIsRecalculatingRoute(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ Erreur lors de la préparation de l'arrêt:", error);
    }
  };

  // Fonction pour rechercher des POI à proximité pendant la navigation
  const handleSearchNearbyPOI = async (amenityType: string) => {
    if (!location) {
      console.warn(
        "⚠️ Position utilisateur non disponible pour la recherche POI"
      );
      return;
    }

    try {
      // Utiliser le service Overpass pour chercher des POI dans un rayon de 5km
      const searchRadius = 5000; // 5km
      const pois = await OverpassService.searchPOI(
        location.latitude,
        location.longitude,
        searchRadius,
        amenityType
      );

      if (pois.length > 0) {
        // Ouvrir le drawer POI avec les résultats
        setSelectedAmenityType(amenityType);
        setAllPOIs(pois);
        setShowPOIDrawer(true);

        // Animer vers le premier POI avec un délai pour que le drawer prenne le contrôle
        const firstPOI = pois[0];
        if (firstPOI) {
          const coord = {
            latitude: firstPOI.lat,
            longitude: firstPOI.lon,
          };

          // Utiliser un délai pour permettre au drawer de s'ouvrir et prendre le contrôle de la caméra
          setTimeout(() => {
            const adjustedCoord = getAdjustedCoordinate(
              coord,
              15,
              undefined,
              400
            ); // POI drawer ~400
            animateToCoordinate(adjustedCoord, 15); // Zoom pour voir la zone
          }, 300); // Délai de 300ms pour que le drawer soit complètement ouvert
        }
      } else {
        Alert.alert(
          "Aucun résultat",
          `Aucun "${amenityType}" trouvé dans un rayon de ${
            searchRadius / 1000
          }km.`
        );
      }
    } catch (error) {
      console.error("❌ Erreur lors de la recherche POI:", error);
      Alert.alert(
        "Erreur",
        "Impossible de rechercher les points d'intérêt. Veuillez réessayer."
      );
    }
  };

  const handleCalculateMultiStepRoute = async (transportMode: string) => {
    if (!location || routeSteps.length === 0) return;

    // Mémoriser si le mode suivi était actif et le désactiver temporairement
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    // Mapper les modes vers les modes OSRM appropriés
    let osrmMode = "driving";
    switch (transportMode) {
      case "driving":
        osrmMode = "driving";
        break;
      case "walking":
        osrmMode = "foot";
        break;
      case "bicycling":
        osrmMode = "driving";
        break;
      case "transit":
        osrmMode = "driving";
        break;
    }

    // Créer la liste des coordonnées incluant la position de l'utilisateur
    const coordinates = [
      [location.longitude, location.latitude],
      ...routeSteps.map((step) => [step.longitude, step.latitude]),
    ];

    try {
      let totalDist = 0;
      let totalDur = 0;
      const allRouteCoords: any[] = [];

      // Calculer les routes segment par segment
      for (let i = 0; i < coordinates.length - 1; i++) {
        await getRoute(
          [coordinates[i][0], coordinates[i][1]] as [number, number],
          [coordinates[i + 1][0], coordinates[i + 1][1]] as [number, number],
          osrmMode
        );

        // Calculer la distance euclidienne comme approximation
        const lat1 = coordinates[i][1];
        const lon1 = coordinates[i][0];
        const lat2 = coordinates[i + 1][1];
        const lon2 = coordinates[i + 1][0];

        const R = 6371e3; // Rayon de la Terre en mètres
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        totalDist += distance;

        // Estimer la durée basée sur le mode de transport
        let speed = 50; // km/h par défaut (voiture)
        switch (transportMode) {
          case "walking":
            speed = 5;
            break;
          case "bicycling":
            speed = 15;
            break;
          case "driving":
            speed = 50;
            break;
          case "transit":
            speed = 30;
            break;
        }

        totalDur += (distance / 1000 / speed) * 3600; // durée en secondes
      }

      setTotalDistance(totalDist);
      setTotalDuration(totalDur);

      // TODO: Ajuster la vue pour voir tout l'itinéraire avec le nouveau contexte MapView
      // Les coordonnées seraient utilisées ici pour ajuster la caméra
    } catch (error) {
      console.error(
        "Erreur lors du calcul de l'itinéraire multi-étapes:",
        error
      );
    }
  };

  const handleStartMultiStepNavigation = async () => {
    // Démarrer la navigation avec l'itinéraire multi-étapes
    if (routeSteps.length > 0 && location && multiStepRouteCoords.length > 0) {
      try {
        // Créer les coordonnées des waypoints pour l'API OSRM
        const waypoints = [
          { latitude: location.latitude, longitude: location.longitude },
          ...routeSteps.map((step) => ({
            latitude: step.latitude,
            longitude: step.longitude,
          })),
        ];

        // Construire l'URL pour l'API OSRM avec tous les waypoints
        const coordinates = waypoints
          .map((wp) => `${wp.longitude},${wp.latitude}`)
          .join(";");
        const osrmMode = "driving"; // Mode par défaut pour multi-étapes
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/${osrmMode}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const navigationSteps =
            NavigationService.convertRouteToNavigationSteps(data);

          // Calculer la durée totale en minutes pour le check de sécurité
          const routeDurationMinutes = Math.round(data.routes[0].duration / 60);

          // Vérifier si c'est un long trajet (plus de 2h)
          const isLongTrip = checkTripSafety(routeDurationMinutes);

          if (isLongTrip) {
            // Le modal de sécurité va s'afficher, mais on prépare la navigation
            setNavigationSteps(navigationSteps);
            return; // Attendre la décision de l'utilisateur
          }

          // Démarrer la navigation avec le service de route
          NavigationService.startNavigation(
            navigationSteps,
            routeService,
            osrmMode
          );
          setIsNavigating(true);
        }
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des étapes de navigation multi-étapes:",
          error
        );
      }

      setShowMultiStepDrawer(false);
    }
  };

  const handleCloseMultiStepDrawer = () => {
    setShowMultiStepDrawer(false);

    // Si le mode suivi était actif avant le calcul de la route, le réactiver
    // MAIS seulement si aucun parking n'est sélectionné
    if (wasFollowingBeforeRoute && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
      setWasFollowingBeforeRoute(false);
    }

    // Optionnellement, nettoyer les coordonnées de route
    setMultiStepRouteCoords([]);
  };

  // Gestion des POI
  const handleShowPOI = (
    amenityType: string,
    preloadedPois?: OverpassPOI[]
  ) => {
    setSelectedAmenityType(amenityType);
    setShowPOIDrawer(true);

    // Si on a des POI pré-chargés, les utiliser
    if (preloadedPois && preloadedPois.length > 0) {
      setAllPOIs(preloadedPois);
    }
  };

  const handleClosePOIDrawer = () => {
    setShowPOIDrawer(false);
    setSelectedAmenityType("");
    setSelectedPOI(null);
    setAllPOIs([]);
    setCustomPOILocation(null); // Nettoyer la position personnalisée
    setIsFutureLocationSearch(false); // Nettoyer le flag de recherche future
    // Nettoyer les marqueurs POI de la carte
    setDestination(null);
  };

  const handleSelectPOI = (poi: OverpassPOI) => {
    setSelectedPOI(poi);

    // Désactiver temporairement le suivi utilisateur pour que l'animation
    // vers le POI ne soit pas immédiatement annulée par le mode 'follow'
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    // Centrer la carte sur le POI sélectionné avec ajustement pour le drawer
    // Utiliser un délai pour s'assurer que le drawer POI a déjà le contrôle de la caméra
    setTimeout(() => {
      const coord = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      // Utiliser le padding courant du drawer si disponible pour un meilleur ajustement
      const drawerH = typeof drawerPadding === "number" ? drawerPadding : 400;
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        16,
        undefined,
        drawerH
      );
      // Utiliser l'animation verrouillée (forcer) pour éviter qu'un autre contrôleur
      // (drawer, follow-mode, etc.) n'ignore la requête de caméra.
      // Passer explicitement zoom et pitch pour un résultat prévisible.
      animateToCoordinateLocked(adjustedCoord, 16, adjustedCoord.pitch || 0);
    }, 350); // Légèrement plus long pour laisser le drawer finir son animation
  };

  const handlePOIRoute = async (poi: OverpassPOI, transportMode: string) => {
    // Mémoriser si le mode suivi était actif et le désactiver temporairement
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    // Quand on lance la navigation vers ce POI, on retire la sélection visuelle
    setSelectedPOI(null);

    // Préparer la destination pour le RouteDrawer
    const destination = {
      title: poi.tags.name || poi.tags.amenity || "POI",
      subtitle: poi.tags.addr_street || "Adresse non disponible",
      latitude: poi.lat,
      longitude: poi.lon,
    };

    setSelectedDestination(destination);

    // Si on a une position utilisateur, calculer directement la route et ajuster la vue
    if (location) {
      const coord = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      setDestination(coord);

      // Mapper le mode de transport
      let osrmMode = "driving";
      switch (transportMode) {
        case "driving":
          osrmMode = "driving";
          break;
        case "walking":
          osrmMode = "foot";
          break;
        case "bicycling":
          osrmMode = "driving";
          break;
        case "transit":
          osrmMode = "driving";
          break;
      }

      // Calculer la route hybride
      const poiDestination = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      await getHybridRouteFromCurrentLocation(poiDestination, osrmMode);

      // Ajuster la vue pour afficher le trajet complet
      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true // Le drawer sera visible
      );
    }

    // Fermer le POI drawer et ouvrir le RouteDrawer
    setShowPOIDrawer(false);
    setShowRouteDrawer(true);
  };

  // Quand le RouteDrawer s'ouvre, recentrer la carte sur la destination recherchée
  useEffect(() => {
    if (showRouteDrawer && selectedDestination) {
      const coord = {
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
      };
      const adjusted = getAdjustedCoordinate(coord, undefined, undefined, 180);
      // animation courte pour montrer la position recherchée
      animateToCoordinate(adjusted, 15);
    }
  }, [showRouteDrawer, selectedDestination]);

  const handlePOIRadiusChange = (radius: number) => {
    setPOIRadius(radius);
  };

  const handlePOIsFound = (pois: OverpassPOI[]) => {
    setAllPOIs(pois);

    // TODO: Ajuster le zoom pour voir tous les POI avec le nouveau contexte MapView
    // Les coordonnées seraient utilisées ici pour ajuster la caméra
  };

  const handleStartNavigation = async (transportMode: string = "driving") => {
    if (!selectedDestination || !location) return;

    // Close drawer immediately and show navigation guidance UI.
    setShowRouteDrawer(false);
    setShowNavigationGuidance(true);

    // Prepare routeRequest object that NavigationGuidance will handle.
    const start = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    const end = {
      latitude: selectedDestination.latitude,
      longitude: selectedDestination.longitude,
    };

    // If we already have raw route data from the routeService that targets the same
    // destination, reuse it to avoid duplicate requests.
    const hasExistingRouteData =
      routeService &&
      routeService.lastRawRouteData &&
      selectedDestination &&
      routeService.destination &&
      routeService.destination.latitude === selectedDestination.latitude &&
      routeService.destination.longitude === selectedDestination.longitude;

    if (hasExistingRouteData) {
      // Pass routeData via NavigationGuidance by keeping pendingRequest null and
      // relying on App's `routeService.lastRawRouteData` prop already wired to NavigationGuidance.
      setPendingRouteRequest(null);
    } else {
      setPendingRouteRequest({ start, end, mode: transportMode });
      setIsRecalculatingRoute(true);
    }

    // Start the UI navigation mode (visual) immediately while guidance loads the route.
    if (transportMode === "walking") startWalkingNavigation();
    else startDrivingNavigation();
    // Quickly animate the camera to the user's position so NavigationGuidance appears faster
    if (location) {
      // zoom ~17, short duration for snappier transition
      animateToCoordinateLocked(
        { latitude: location.latitude, longitude: location.longitude },
        17,
        undefined,
        300
      );
    }
    // Protect route from being cleared while navigation is starting
    setIsNavigating(true);
  };

  const handleStopNavigation = () => {
    NavigationService.stopNavigation();
    stopNavigation(); // Arrêter la navigation piétonne aussi
    setIsNavigating(false);
    setShowNavigationGuidance(false);
    setNavigationSteps([]);
    setCurrentStepIndex(0);

    // Nettoyer les timers de sécurité
    cleanupSafetyTimers();

    // Effacer la route quand on arrête la navigation
    clearRoute();
  };

  const handleCloseDrawer = () => {
    setShowRouteDrawer(false);
    setSelectedDestination(null);

    // Si le mode suivi était actif avant le calcul de la route, le réactiver
    // MAIS seulement si aucun parking n'est sélectionné
    if (wasFollowingBeforeRoute && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
      setWasFollowingBeforeRoute(false);
    }

    // Si c'est une route multi-étapes (il y a des étapes en cours)
    if (routeSteps.length > 0) {
      // Revenir au drawer multi-étapes pour continuer la création
      setShowMultiStepDrawer(true);
    } else if (!isNavigating) {
      // Sinon, effacer complètement la route SEULEMENT si on n'est pas en navigation
      clearRoute();
    }
    // Si on est en navigation, garder la route affichée
  };

  const handleTransportModeChange = async (mode: string, destination: any) => {
    // Mémoriser si le mode suivi était actif et le désactiver temporairement
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    if (location) {
      // Définir la destination pour l'affichage du marqueur
      const coord = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      setDestination(coord);

      // Mapper les modes vers les modes OSRM appropriés
      let osrmMode = "driving";
      switch (mode) {
        case "driving":
          osrmMode = "driving";
          break;
        case "walking":
          osrmMode = "foot";
          break;
        case "bicycling":
          osrmMode = "driving"; // OSRM n'a pas de mode vélo, on utilise driving
          break;
        case "transit":
          osrmMode = "driving"; // OSRM n'a pas de transport public, on utilise driving
          break;
      }

      // Calculer et afficher le trajet hybride selon le mode de transport
      await getHybridRouteFromCurrentLocation(destination, osrmMode);

      // Ajuster la vue pour afficher le trajet complet avec départ et arrivée
      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true // Le drawer sera visible
      );
    } else {
      // Si pas de localisation, simplement définir la destination et animer vers elle avec ajustement pour le drawer
      const coord = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      setDestination(coord);
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        undefined,
        undefined,
        350
      ); // multi-step drawer ~350
      animateToCoordinate(adjustedCoord);
    }
  };

  // Fonction pour gérer la recherche de parking depuis ArrivalDrawer
  const handleFindParkingFromArrival = (location: {
    latitude: number;
    longitude: number;
  }) => {
    setParkingLocation(location);
    setShowParkingDrawer(true);

    // Fermer l'ArrivalDrawer quand le ParkingDrawer s'ouvre
    setShowArrivalDrawer(false);
  };

  // Fonction pour effacer les étapes de navigation
  const handleClearSteps = () => {
    // Effacer les étapes multi-étapes
    setRouteSteps([]);

    // Effacer les coordonnées de route multi-étapes
    setMultiStepRouteCoords([]);

    // Réinitialiser les distances et durées
    setTotalDistance(0);
    setTotalDuration(0);

    // Effacer les étapes de navigation en cours
    setNavigationSteps([]);
    setCurrentStepIndex(0);

    // Si on est en navigation, l'arrêter
    if (isNavigating) {
      handleStopNavigation();
    }

    // Effacer seulement les coordonnées de route, mais garder la destination
    // pour permettre la navigation vers un parking
    clearRouteKeepDestination();
  };

  // Fonctions pour gérer le ParkingDrawer
  const handleCloseParkingDrawer = () => {
    setShowParkingDrawer(false);
    setParkingLocation(null);

    // RELÂCHER le contrôle exclusif de la caméra
    releaseDrawerCameraControl("parking-drawer");

    // Délai avant de nettoyer le parking sélectionné pour éviter les animations conflictuelles
    setTimeout(() => {
      setSelectedParking(null); // Nettoyer le parking sélectionné
      setIsParkingAnimating(false); // Réactiver les animations automatiques
    }, 200);

    // NE PAS réactiver automatiquement le suivi utilisateur
    // L'utilisateur doit le faire manuellement via les contrôles si souhaité
  };

  const handleSelectParking = (parking: any, useExactSpot?: boolean) => {
    // Déterminer les coordonnées du parking
    // Essayer différentes structures possibles
    const parkingCoordinate = {
      latitude:
        parking.coordinate?.latitude ||
        parking.coordinates?.[1] ||
        parking.latitude,
      longitude:
        parking.coordinate?.longitude ||
        parking.coordinates?.[0] ||
        parking.longitude,
    };
    // BLOQUER TOUTES LES ANIMATIONS AUTOMATIQUES pendant la sélection du parking
    setIsParkingAnimating(true);

    // LE PARKING DRAWER PREND LE CONTRÔLE EXCLUSIF DE LA CAMÉRA
    setDrawerCameraControl("parking-drawer");

    // FORCER la désactivation du suivi utilisateur avant l'animation
    // Cela empêche le useEffect de followUserLocation d'interférer
    const wasFollowing = disableFollowModeTemporarily();

    // Mettre à jour l'état du parking sélectionné pour l'afficher sur la carte
    setSelectedParking({
      coordinate: parkingCoordinate,
      name: parking.name || "Parking sélectionné",
    });

    // Pour la vue de parking, utiliser les coordonnées exactes SANS ajustement de drawer
    // Car le parking doit être centré exactement au bon endroit avec vue de haut
    // Debug: animating camera to selected parkingCoordinate (locked)

    // Utiliser l'animation verrouillée pour éviter les conflits
    setTimeout(() => {
      // Utiliser les coordonnées exactes du parking avec une légère correction vers le sud
      // pour compenser le décalage automatique vers le nord
      const correctedCoordinate = {
        latitude: parkingCoordinate.latitude - 0.00045, // Légère correction vers le sud
        longitude: parkingCoordinate.longitude,
      };
      animateToCoordinateLocked(correctedCoordinate, 18, 0); // Animation verrouillée avec vue de haut (pitch=0)

      // Réactiver les animations automatiques après l'animation du parking (délai plus long pour sécurité)
      setTimeout(() => {
        setIsParkingAnimating(false);
        // NOTE: On ne relâche PAS le contrôle caméra ici - seulement quand le drawer se ferme
      }, 2500); // 2.5 secondes pour être sûr que l'animation est complètement terminée
    }, 150); // Délai initial légèrement plus long

    // Fermer l'ArrivalDrawer s'il est ouvert
    setShowArrivalDrawer(false);

    // Le drawer de parking reste ouvert pour montrer les détails du parking sélectionné
  };

  // Fonction pour naviguer vers l'entrée du parking
  const handleNavigateToParking = async (parking: any) => {
    if (!location) {
      console.warn("⚠️ Position utilisateur non disponible pour la navigation");
      return;
    }

    try {
      // Coordonnées du parking
      const parkingCoordinate = {
        latitude:
          parking.coordinate?.latitude ||
          parking.coordinates?.[1] ||
          parking.latitude,
        longitude:
          parking.coordinate?.longitude ||
          parking.coordinates?.[0] ||
          parking.longitude,
      };

      // Rechercher l'entrée du parking en utilisant l'API Overpass
      // On cherche les nœuds d'entrée (entrance) près du parking
      const radius = 50; // 50 mètres autour du parking
      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["entrance"~"^(yes|main|service)$"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
          node["amenity"="parking_entrance"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
          node["barrier"="entrance"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
        );
        out geom;
      `;

      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        overpassQuery
      )}`;
      const response = await fetch(overpassUrl);
      const data = await response.json();

      let entranceCoordinate = parkingCoordinate; // Par défaut, utiliser les coordonnées du parking

      // Si on trouve des entrées, utiliser la plus proche
      if (data.elements && data.elements.length > 0) {
        // Trouver l'entrée la plus proche de la position utilisateur
        let closestEntrance = data.elements[0];
        let minDistance = Infinity;

        for (const entrance of data.elements) {
          const distance = getDistanceBetweenPoints(
            location.latitude,
            location.longitude,
            entrance.lat,
            entrance.lon
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestEntrance = entrance;
          }
        }

        entranceCoordinate = {
          latitude: closestEntrance.lat,
          longitude: closestEntrance.lon,
        };
      } else {
      }

      // Fermer le drawer de parking
      setShowParkingDrawer(false);

      // Réinitialiser l'état d'arrivée
      setHasReachedDestination(false);
      setShowArrivalDrawer(false);

      // Mémoriser si le mode suivi était actif et le désactiver temporairement
      const wasFollowing = disableFollowModeTemporarily();
      setWasFollowingBeforeRoute(wasFollowing);

      // Définir la nouvelle destination (entrée du parking)
      setDestination(entranceCoordinate);

      // Préparer les données pour le RouteDrawer
      setSelectedDestination({
        title: parking.name || "Entrée de parking",
        subtitle: "Navigation vers l'entrée",
        latitude: entranceCoordinate.latitude,
        longitude: entranceCoordinate.longitude,
      });

      // Calculer la route vers l'entrée
      await getHybridRouteFromCurrentLocation(entranceCoordinate, "driving");

      // Ajuster la vue pour afficher le trajet complet
      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        entranceCoordinate,
        routeCoords,
        true // Le drawer sera visible
      );

      // Ouvrir le RouteDrawer pour la navigation
      setShowRouteDrawer(true);
    } catch (error) {
      console.error(
        "❌ Erreur lors de la recherche d'entrée de parking:",
        error
      );

      // En cas d'erreur, naviguer directement vers le parking
      const parkingCoordinate = {
        latitude:
          parking.coordinate?.latitude ||
          parking.coordinates?.[1] ||
          parking.latitude,
        longitude:
          parking.coordinate?.longitude ||
          parking.coordinates?.[0] ||
          parking.longitude,
      };

      handleStartRouteFromLocation(parkingCoordinate);
    }
  };

  const handleRecenter = async () => {
    if (location) {
      await recenterMap(location);
    }
  };

  return (
    <View style={styles.container}>
      {/* Modal de reprise de trajet */}
      <ResumeTripModal
        visible={resumeModalVisible}
        destination={lastTrip?.destination || {}}
        mode={lastTrip?.mode || "driving"}
        onValidate={handleResumeTrip}
        onCancel={handleCancelResumeTrip}
      />
      {/* Barre de recherche normale (hors navigation) */}
      {!isNavigating && (
        <ExpandableSearch
          value={search}
          onChangeText={setSearch}
          onSelectLocation={handleSelectLocation}
          onShowRoute={handleShowRoute}
          onShowPOI={handleShowPOI}
          onAddStep={handleAddStep}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              setTimeout(() => {
                if (offset) {
                  const screenHeight = Dimensions.get("window").height;
                  const latitudeDelta = 0.01;
                  const offsetLat = (offset.y / screenHeight) * latitudeDelta;
                  const adjustedCoord = {
                    latitude: coordinate.latitude + offsetLat,
                    longitude: coordinate.longitude,
                    pitch: 0,
                  };
                  animateToCoordinateLocked(adjustedCoord);
                } else {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }
              }, 100);
            } else {
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }, 100);
              }
            }
          }}
        />
      )}

      {/* Modal de recherche étendue pendant la navigation */}
      {showNavigationSearch && (
        <ExpandableSearch
          value={search}
          onChangeText={setSearch}
          onSelectLocation={(result) => {
            handleSelectLocation(result);
            setShowNavigationSearch(false);
          }}
          onShowRoute={handleShowRoute}
          onShowPOI={handleShowPOI}
          onAddStep={handleAddStep}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          isNavigating={isNavigating}
          onAddNavigationStop={(result) => {
            handleAddNavigationStop(result);
            setShowNavigationSearch(false);
          }}
          onSearchNearbyPOI={handleSearchNearbyPOI}
          placeholder="Rechercher un arrêt..."
          autoExpand={true}
          onClose={() => setShowNavigationSearch(false)}
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              setTimeout(() => {
                if (offset) {
                  const screenHeight = Dimensions.get("window").height;
                  const latitudeDelta = 0.01;
                  const offsetLat = (offset.y / screenHeight) * latitudeDelta;
                  const adjustedCoord = {
                    latitude: coordinate.latitude + offsetLat,
                    longitude: coordinate.longitude,
                    pitch: 0,
                  };
                  animateToCoordinateLocked(adjustedCoord);
                } else {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }
              }, 100);
            } else {
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }, 100);
              }
            }
          }}
        />
      )}

      {/* Bouton d'accès rapide pour l'itinéraire multi-étapes */}
      {routeSteps.length > 0 && (
        <TouchableOpacity
          style={styles.multiStepButton}
          onPress={() => setShowMultiStepDrawer(true)}
        >
          <MaterialIcons name="route" size={20} color="#FFF" />
          <Text style={styles.multiStepButtonText}>
            Itinéraire ({routeSteps.length} étapes)
          </Text>
        </TouchableOpacity>
      )}

      <>
        <MapContainer
          mapHeadingOverride={cameraHeadingOverride}
          location={location}
          headingAnim={headingAnim}
          destination={destination}
          routeCoords={routeCoords}
          onLongPress={handleMapPress}
          compassMode={compassMode}
          currentHeading={currentHeading}
          onMapPanDrag={handleMapPanDrag}
          pois={allPOIs}
          selectedPOI={selectedPOI}
          isFirstLoad={!location}
          isNavigating={isMapNavigating}
          navigationMode={navigationMode}
          showDirectLine={isMapNavigating && navigationMode === "walking"}
          navigationSteps={navigationSteps}
          currentStepIndex={currentStepIndex}
          onNavigationStepPress={handleNavigationStepPress}
          // Nouvelles props pour le tracé hybride
          directLineCoords={directLineCoords}
          nearestRoadPoint={nearestRoadPoint}
          hasDirectLineSegment={hasDirectLineSegment}
          // Props pour le point de location sélectionné
          showLocationPoint={showLocationPoint}
          selectedLocationCoordinate={selectedLocationCoordinate}
          // Props pour le parking sélectionné
          selectedParking={selectedParking}
          // Nouvelles props pour la progression de navigation
          completedRouteCoords={completedRouteCoords}
          remainingRouteCoords={remainingRouteCoords}
          progressPercentage={progressPercentage}
          // Nouvelle prop pour la direction de la route
          routeDirection={routeDirection}
        />

        <ControlButtons
          onRecenter={handleRecenter}
          onToggleCompass={toggleCompassMode}
          compassMode={compassMode}
          isFollowingUser={isFollowingUser}
          isNavigating={isNavigating}
        />

        <RouteDrawer
          visible={showRouteDrawer}
          destination={selectedDestination}
          onClose={handleCloseDrawer}
          onStartNavigation={handleStartNavigation}
          onTransportModeChange={handleTransportModeChange}
          onOpened={() => {
            // Re-apply fitToRoute once drawer animation completed so camera accounts for final drawer size
            if (
              location &&
              selectedDestination &&
              routeCoords &&
              routeCoords.length > 0
            ) {
              fitToRoute(
                { latitude: location.latitude, longitude: location.longitude },
                {
                  latitude: selectedDestination.latitude,
                  longitude: selectedDestination.longitude,
                },
                routeCoords,
                true
              );
            }
          }}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          isCalculatingRoute={routeService ? routeService.isCalculating : false}
          isOsrmAvailable={routeService ? routeService.isOsrmAvailable : true}
          provider={routeService ? routeService.routingHost : undefined}
          lastRequestTimings={
            routeService ? routeService.lastRequestTimings : undefined
          }
        />

        <POIDrawer
          visible={showPOIDrawer}
          amenityType={selectedAmenityType}
          userLocation={
            customPOILocation || // Utiliser la position personnalisée si définie (sécurité routière)
            (location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null)
          }
          onClose={handleClosePOIDrawer}
          onSelectPOI={handleSelectPOI}
          onShowRoute={handlePOIRoute}
          onRadiusChange={handlePOIRadiusChange}
          onPOIsFound={handlePOIsFound}
          initialRadius={poiRadius}
          preloadedPois={allPOIs.length > 0 ? allPOIs : undefined}
          isNavigating={isNavigating}
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              // Animer vers les coordonnées du POI avec offset personnalisé ou ajustement par défaut
              setTimeout(() => {
                if (offset && typeof offset.y === "number") {
                  // Traiter offset.y comme la hauteur du drawer (en pixels)
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    offset.y
                  );
                  animateToCoordinate(adjustedCoord);
                } else {
                  // Utiliser l'ajustement par défaut (pas de drawer)
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinate(adjustedCoord);
                }
              }, 100);
            } else {
              // Animer vers la position de l'utilisateur avec ajustement pour le drawer
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinate(adjustedCoord);
                }, 100);
              }
            }
          }}
          onAddNavigationStop={(poi) => {
            // Convertir le POI en format compatible avec handleAddNavigationStop
            const result = {
              id: `poi_${poi.id}`,
              title: poi.tags.name || poi.tags.amenity || "POI",
              subtitle:
                poi.tags.addr_street ||
                `${poi.tags.amenity} - ${Math.round(poi.distance || 0)}m`,
              latitude: poi.lat,
              longitude: poi.lon,
              type: "overpass" as const,
              amenityType: poi.tags.amenity,
            };
            handleAddNavigationStop(result);
            setShowPOIDrawer(false); // Fermer le drawer après ajout
          }}
        />

        <MultiStepRouteDrawer
          visible={showMultiStepDrawer}
          steps={routeSteps}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          onClose={handleCloseMultiStepDrawer}
          onAddStep={(step) => {
            setRouteSteps((prev) => [...prev, step]);
          }}
          onRemoveStep={handleRemoveStep}
          onReorderSteps={handleReorderSteps}
          onCalculateRoute={handleCalculateMultiStepRoute}
          onStartNavigation={handleStartMultiStepNavigation}
          onShowPOIsOnMap={(pois) => {
            // Afficher les POI sur la carte
            setAllPOIs(pois);
          }}
          onSelectPOIOnMap={(poi) => {
            // Sélectionner un POI sur la carte
            setSelectedPOI(poi);
          }}
          totalDistance={totalDistance}
          totalDuration={totalDuration}
        />

        <NavigationGuidance
          visible={showNavigationGuidance || isNavigating || isMapNavigating}
          onStop={handleStopNavigation}
          onShowAllSteps={() => {
            if (
              location &&
              destination &&
              routeCoords &&
              routeCoords.length > 0
            ) {
              fitToRoute(
                { latitude: location.latitude, longitude: location.longitude },
                destination,
                routeCoords,
                true // drawer visible
              );
            }
          }}
          onAddNavigationStep={() => setShowNavigationSearch(true)}
          isRecalculatingRoute={isRecalculatingRoute}
          showRecenterPrompt={showRecenterPrompt}
          onManualRecenter={manualRecenter}
          currentLocation={location}
          routeRequest={pendingRouteRequest}
          routeData={routeService ? routeService.lastRawRouteData : null}
          // Forward provider/timings for display/debug
          // (NavigationGuidance doesn't currently render these but they are available)
          // provider passed to RouteDrawer already; NavigationGuidance can inspect routeData
          onRouteReady={() => {
            // NavigationGuidance signaled the route is ready. Clear pending request.
            setPendingRouteRequest(null);
            // Keep isNavigating true and ensure route is not cleared during navigation
            setIsNavigating(true);
            setIsRecalculatingRoute(false);
          }}
        />

        <LocationInfoDrawer
          visible={showLocationInfoDrawer}
          coordinate={selectedLocationCoordinate}
          onClose={() => setShowLocationInfoDrawer(false)}
          onStartRoute={handleStartRouteFromLocation}
          hasActiveRoute={!!destination || isNavigating}
          onShowLocationPoint={handleShowLocationPoint}
        />

        <NavigationStepDrawer
          visible={showNavigationStepDrawer}
          step={selectedNavigationStep}
          stepIndex={selectedStepIndex}
          totalSteps={navigationSteps.length}
          onClose={handleCloseNavigationStepDrawer}
          isCurrentStep={selectedStepIndex === currentStepIndex}
          isCompletedStep={selectedStepIndex < currentStepIndex}
        />

        <ArrivalDrawer
          visible={showArrivalDrawer}
          destination={
            destination
              ? {
                  coordinate: {
                    latitude: destination.latitude,
                    longitude: destination.longitude,
                  },
                  name:
                    selectedDestination?.display_name ||
                    selectedDestination?.name,
                  address: selectedDestination?.address,
                }
              : null
          }
          onClose={handleCloseArrivalDrawer}
          onNavigateAgain={handleNavigateAgain}
          onDisableFollowUser={handleDisableFollowUserForArrival}
          onEnableFollowUser={handleEnableFollowUserForArrival}
          onAdjustCamera={handleAdjustCameraForArrival}
          onFindParking={handleFindParkingFromArrival}
          onClearSteps={handleClearSteps}
        />

        <ParkingDrawer
          visible={showParkingDrawer}
          searchLocation={parkingLocation}
          onClose={handleCloseParkingDrawer}
          onParkingSelect={handleSelectParking}
          onNavigateToParking={handleNavigateToParking}
        />

        {/* Modal de sécurité routière pour les longs trajets */}
        <Modal
          visible={showSafetyModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowSafetyModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="warning" size={32} color="#FF9500" />
                <Text style={styles.modalTitle}>Sécurité routière</Text>
              </View>

              <Text style={styles.modalDescription}>
                Votre trajet dure plus de 2 heures (
                {Math.round(longTripDuration / 60)}h
                {String(longTripDuration % 60).padStart(2, "0")}). Pour votre
                sécurité et celle des autres usagers, il est recommandé de faire
                une pause ou de changer de conducteur toutes les 2 heures.
              </Text>

              <View style={styles.modalButtonsVertical}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => handleSafetyChoice("remind")}
                >
                  <MaterialIcons name="access-time" size={20} color="#FFF" />
                  <Text style={styles.modalButtonTextPrimary}>
                    Me rappeler dans 2h
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleSafetyChoice("rest-stops")}
                >
                  <MaterialIcons
                    name="local-gas-station"
                    size={20}
                    color="#007AFF"
                  />
                  <Text style={styles.modalButtonTextSecondary}>
                    Trouver des aires de repos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleSafetyChoice("ignore")}
                >
                  <MaterialIcons name="close" size={20} color="#FF3B30" />
                  <Text
                    style={[
                      styles.modalButtonTextSecondary,
                      { color: "#FF3B30" },
                    ]}
                  >
                    Ignorer et continuer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de rappel de pause */}
        <Modal
          visible={showRestReminder}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowRestReminder(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="schedule" size={32} color="#FF9500" />
                <Text style={styles.modalTitle}>Temps de pause</Text>
              </View>

              <Text style={styles.modalDescription}>
                Il est temps de faire une pause ! Vous conduisez depuis 2
                heures. Prenez quelques minutes pour vous reposer ou cherchez
                une aire de repos à proximité.
              </Text>

              <View style={styles.modalButtonsVertical}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => handleRestReminderAction("find-stop")}
                >
                  <MaterialIcons
                    name="local-gas-station"
                    size={20}
                    color="#FFF"
                  />
                  <Text style={styles.modalButtonTextPrimary}>
                    Trouver une aire de repos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleRestReminderAction("rest")}
                >
                  <MaterialIcons name="pause" size={20} color="#007AFF" />
                  <Text style={styles.modalButtonTextSecondary}>
                    Je prends une pause ici
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleRestReminderAction("ignore")}
                >
                  <MaterialIcons name="schedule" size={20} color="#FF9500" />
                  <Text
                    style={[
                      styles.modalButtonTextSecondary,
                      { color: "#FF9500" },
                    ]}
                  >
                    Rappeler dans 2h
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
  },
  multiStepButton: {
    position: "absolute",
    top: 100,
    right: 16,
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  multiStepButtonText: {
    color: "#FFF",
    fontWeight: "bold",
    marginLeft: 4,
    fontSize: 12,
  },
  // Styles pour le modal de localisation
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    maxWidth: 340,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalButtonsVertical: {
    flexDirection: "column",
    gap: 12,
    width: "100%",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    width: "100%",
    gap: 8,
  },
  modalButtonHorizontal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    gap: 8,
  },
  modalButtonPrimary: {
    backgroundColor: "#007AFF",
  },
  modalButtonSecondary: {
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  modalButtonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
  modalButtonTextSecondary: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
  // Styles ajoutés pour les modaux de sécurité
  modalContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    maxWidth: 360,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  modalDescription: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
});
