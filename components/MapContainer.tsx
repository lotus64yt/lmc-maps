import React, { useRef, useEffect, useState } from "react";
import { StyleSheet, Dimensions, View, Text } from "react-native";
import Mapbox, {
  MapView,
  PointAnnotation,
  ShapeSource,
  LineLayer,
  Camera,
  CircleLayer,
  SymbolLayer,
  AnimatedShape,
} from "@rnmapbox/maps";
import * as Location from "expo-location";
import { Animated } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { OverpassPOI } from "../services/OverpassService";
import { MapStorageService } from "../services/MapStorageService";
import { useMapView } from "../contexts/MapViewContext";
import { NavigationStep } from "../types/RouteTypes";
import { useLocationService } from "@/services/LocationService";
import UserLocationMarker from "./UserLocationMarker";
import NavigationArrow from "./ArrowSVG";
// Use local Mapbox style JSON instead of remote styleURL
import libertyStyle from "../assets/styles/liberty.json";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface MapContainerProps {
  location: Location.LocationObjectCoords | null;
  headingAnim: Animated.Value;
  destination: Coordinate | null;
  routeCoords: Coordinate[];
  onLongPress: (coordinate: Coordinate) => void;
  compassMode: "north" | "heading";
  currentHeading: number;
  onMapPanDrag?: () => void;
  pois?: OverpassPOI[];
  selectedPOI?: OverpassPOI | null;
  isFirstLoad?: boolean;
  isNavigating?: boolean;
  navigationMode?: "driving" | "walking";
  showDirectLine?: boolean;
  navigationSteps?: NavigationStep[];
  currentStepIndex?: number;
  onNavigationStepPress?: (stepIndex: number, step: NavigationStep) => void;
  directLineCoords?: Coordinate[];
  nearestRoadPoint?: Coordinate | null;
  hasDirectLineSegment?: boolean;
  showLocationPoint?: boolean;
  userLocationColor?: string;
  selectedLocationCoordinate?: Coordinate | null;
  selectedParking?: { coordinate: Coordinate; name: string } | null;
  completedRouteCoords?: Coordinate[];
  remainingRouteCoords?: Coordinate[];
  progressPercentage?: number;
  routeDirection?: { bearing: number; isOnRoute: boolean } | undefined;
  mapHeadingOverride?: number | null;
  previewMarkerCoordinate?: Coordinate | null;
  previewMarkerBearing?: number;
  gpxRouteCoords?: Coordinate[];
  alternativeRoutes?: Array<{
    coords: Coordinate[];
    duration?: number;
    distance?: number;
  }>;
  selectedAlternativeIndex?: number;
}

export default function MapContainer({
  location,
  headingAnim,
  destination,
  routeCoords,
  onLongPress,
  compassMode,
  currentHeading,
  onMapPanDrag,
  pois = [],
  selectedPOI,
  isFirstLoad = false,
  isNavigating = false,
  navigationMode = "driving",
  showDirectLine = false,
  navigationSteps = [],
  currentStepIndex = 0,
  onNavigationStepPress,
  directLineCoords = [],
  nearestRoadPoint,
  hasDirectLineSegment = false,
  showLocationPoint = false,
  selectedLocationCoordinate,
  selectedParking,
  completedRouteCoords = [],
  remainingRouteCoords = [],
  progressPercentage = 0,
  routeDirection,
  mapHeadingOverride = null,
  userLocationColor,
  previewMarkerCoordinate,
  previewMarkerBearing,
  gpxRouteCoords = [],
  alternativeRoutes = [],
  selectedAlternativeIndex = 0,
}: MapContainerProps) {
  // ...existing code...
  // Utiliser le contexte MapView
  const {
    mapRef,
    centerCoordinate,
    zoomLevel,
    pitch,
    setPitch,
    setCameraConfig,
    notifyMapReady,
  } = useMapView();
  const { heading: mapHeading } = useMapView();

  const { heading } = useLocationService();

  // Debug: tracer les changements de routeCoords
  useEffect(() => {
    console.log('[MAP] 📍 RouteCoords mis à jour:', routeCoords.length, 'points');
    if (routeCoords.length > 0) {
      console.log('[MAP] Premiers points de la nouvelle route:', routeCoords.slice(0, 3));
      console.log('[MAP] ✅ NOUVEAU CHEMIN DEVRAIT ÊTRE AFFICHÉ SUR LA CARTE');
    } else {
      console.log('[MAP] ❌ Aucune coordonnée de route - chemin vidé');
    }
  }, [routeCoords]);

  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(
    null
  );
  const [initialZoom, setInitialZoom] = useState<number>(13);
  const [hasZoomedToUser, setHasZoomedToUser] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const [isMapReady, setIsMapReady] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const lastCameraUpdateRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);
  const [useOverlayMarker, setUseOverlayMarker] = useState(false);

  // Debug log pour le heading
  useEffect(() => {
    // Log user marker state for debugging
    try {
      const rotation = getArrowRotation();
    } catch (e) {
      // ignore
    }
  }, [
    heading,
    currentHeading,
    compassMode,
    mapBearing,
    isNavigating,
    routeDirection,
  ]);

  // Fonction utilitaire pour calculer la distance entre deux points
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3; // Rayon de la Terre en mètres
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

  // Calculate bearing (degrees) from point A to point B (lat/lon in degrees)
  const calculateBearing = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    let θ = (Math.atan2(y, x) * 180) / Math.PI;
    if (θ < 0) θ += 360;
    return θ;
  };

  // Helpers to validate coordinates before rendering PointAnnotation
  const isValidCoordArray = (c: any): c is [number, number] => {
    return (
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number" &&
      isFinite(c[0]) &&
      isFinite(c[1])
    );
  };

  const isValidCoordObj = (
    o: any
  ): o is { latitude: number; longitude: number } => {
    return (
      o &&
      typeof o.latitude === "number" &&
      typeof o.longitude === "number" &&
      isFinite(o.latitude) &&
      isFinite(o.longitude)
    );
  };

  // Fonction pour calculer le heading approprié pour la caméra
  const getCameraHeading = () => {
    // Si un override est fourni depuis le composant parent (App), l'utiliser en priorité
    const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
    if (typeof mapHeadingOverride === "number" && !isNaN(mapHeadingOverride)) {
      return normalizeAngle(mapHeadingOverride);
    }
    // Utiliser la même logique de mélange que pour la flèche, mais moins agressive
    const isOnRoute = routeDirection && routeDirection.isOnRoute;

    // Facteurs de mélange pour la caméra (plus conservateurs que la flèche) :
    // - Navigation + sur route : 80% direction, 20% boussole (précision mais pas trop brusque)
    // - Navigation + hors route : 50% direction, 50% boussole
    // - Mode normal : 100% boussole (pas de rotation automatique)

    let directionWeight = 0;

    if (isNavigating && isOnRoute && compassMode === "heading") {
      directionWeight = 0.8; // Navigation précise mais smooth
    } else if (isNavigating && routeDirection && compassMode === "heading") {
      directionWeight = 0.5; // Navigation hors route, mélange équilibré
    } else {
      directionWeight = 0.0; // Mode normal ou nord : pas de rotation automatique
    }

    if (directionWeight === 0) {
      // Mode boussole standard
      if (compassMode === "heading") {
        // Preferer le heading défini par le contexte (setCameraConfig/updateMapHeading)
        if (typeof mapHeading === "number" && !isNaN(mapHeading)) {
          return mapHeading;
        }

        return heading !== 0 ? heading : currentHeading || 0;
      } else {
        return 0;
      }
    }

    // Mélange direction + boussole pour la caméra
    const directionAngle = routeDirection?.bearing || 0;
    const compassAngle =
      typeof mapHeading === "number" && !isNaN(mapHeading)
        ? mapHeading
        : heading !== 0
        ? heading
        : currentHeading || 0;

    // Normaliser et calculer le mélange
    const normDirectionAngle = normalizeAngle(directionAngle);
    const normCompassAngle = normalizeAngle(compassAngle);

    let angleDiff = normDirectionAngle - normCompassAngle;
    if (angleDiff > 180) angleDiff -= 360;
    if (angleDiff < -180) angleDiff += 360;

    const finalAngle = normCompassAngle + angleDiff * directionWeight;

    return normalizeAngle(finalAngle);
  };

  // Fonction pour calculer la rotation appropriée de la flèche utilisateur
  const getArrowRotation = (): string => {
    // Déterminer l'intensité du mélange direction/boussole
    const isOnRoute = routeDirection && routeDirection.isOnRoute;

    // Facteurs de mélange :
    // - Navigation + sur route : 100% direction de déplacement (précision maximale)
    // - Navigation + hors route : 70% direction, 30% boussole (guidage vers la route)
    // - Mode normal + direction disponible : 40% direction, 60% boussole (économie ressources)
    // - Mode normal sans direction : 100% boussole

    let directionWeight = 0; // Poids de la direction de déplacement (0-1)

    if (isNavigating && isOnRoute) {
      // Navigation précise : priorité totale à la direction
      directionWeight = 1.0;
    } else if (isNavigating && routeDirection) {
      // Navigation hors route : mélange pour guider vers la route
      directionWeight = 0.7;
    } else if (routeDirection && routeDirection.isOnRoute) {
      // Mode normal avec direction : mélange économique
      directionWeight = 0.4;
    } else {
      // Pas de direction disponible : boussole uniquement
      directionWeight = 0.0;
    }

    // Calculer l'angle de direction de déplacement
    let directionAngle = 0;
    if (routeDirection && directionWeight > 0) {
      directionAngle = routeDirection.bearing;
    }

    // Calculer l'angle de la boussole actuel (sans animation pour simplifier)
    let compassAngle = currentHeading || 0;

    // Calculer l'angle final avec mélange
    let finalAngle = compassAngle;

    if (directionWeight > 0 && routeDirection) {
      // Mélange : interpolation entre direction et boussole
      // Normaliser les angles pour éviter les problèmes de 360°/0°
      const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;

      const normDirectionAngle = normalizeAngle(directionAngle);
      const normCompassAngle = normalizeAngle(compassAngle);

      // Calculer la différence angulaire pour choisir le chemin le plus court
      let angleDiff = normDirectionAngle - normCompassAngle;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;

      // Angle final mélangé
      finalAngle = normCompassAngle + angleDiff * directionWeight;
      finalAngle = normalizeAngle(finalAngle);
    }

    // Toujours retourner une string pour la cohérence
    return `${finalAngle}deg`;
  };

  // Fonction pour gérer les changements de la caméra
  const onCameraChanged = (state) => {
    setMapBearing(state.properties.bearing || 0);
    setPitch(state.properties.pitch || 0);
  };

  // Handler pour quand la map est prête
  const handleMapReady = () => {
    // Small delay to avoid Android race where native MapView tries to resolve
    // React view tags before the RN views have been attached. This prevents
    // errors like: "ViewTagResolver | view: null found with tag: XX"
    // A short timeout or requestAnimationFrame gives RN time to attach child
    // views used by annotations (PointAnnotation) before native lookup.
    setTimeout(() => {
      setIsMapReady(true);
      // Notifier le contexte que la Map native est prête pour vider la file d'attente
      try {
        if (notifyMapReady) notifyMapReady();
      } catch (e) {
        // Ignorer les erreurs ici - le flush est best-effort
      }
    }, 50);
  };

  // Charger la dernière position depuis AsyncStorage au montage
  useEffect(() => {
    const loadLastPosition = async () => {
      if (hasInitialized) return; // Éviter la réinitialisation multiple

      const savedMapState = await MapStorageService.loadLastMapPosition();
      const initialCoords =
        MapStorageService.getMapboxCoordinates(savedMapState);
      setInitialCenter(initialCoords);
      setInitialZoom(savedMapState.zoomLevel);

      // Initialiser le contexte avec la position sauvegardée
      setCameraConfig({
        centerCoordinate: initialCoords,
        zoomLevel: savedMapState.zoomLevel,
      });

      setHasInitialized(true);
    };

    loadLastPosition();
  }, [setCameraConfig, hasInitialized]);

  // Zoomer sur la position utilisateur quand elle devient disponible
  useEffect(() => {
    if (location && !hasZoomedToUser && initialCenter) {
      // Sauvegarder la nouvelle position de l'utilisateur
      MapStorageService.saveMapPosition(
        location.latitude,
        location.longitude,
        16
      );
      setHasZoomedToUser(true);
    }
  }, [location, hasZoomedToUser, initialCenter]);

  // Effet pour gérer la caméra en mode navigation (optimisé pour éviter les boucles)
  useEffect(() => {
    if (!location || !isMapReady) return;

    const now = Date.now();
    // Rendre la caméra plus réactive en navigation
    const MIN_UPDATE_INTERVAL = isNavigating ? 300 : 1000; // ms
    const MIN_DISTANCE_THRESHOLD = isNavigating ? 1 : 5; // mètres

    // Vérifier si assez de temps s'est écoulé
    if (
      lastCameraUpdateRef.current &&
      now - lastCameraUpdateRef.current.timestamp < MIN_UPDATE_INTERVAL
    ) {
      return;
    }

    // Vérifier si l'utilisateur s'est suffisamment déplacé
    if (lastCameraUpdateRef.current) {
      const distance = calculateDistance(
        lastCameraUpdateRef.current.latitude,
        lastCameraUpdateRef.current.longitude,
        location.latitude,
        location.longitude
      );

      if (distance < MIN_DISTANCE_THRESHOLD && !isNavigating) {
        return; // Pas assez de mouvement et pas en navigation
      }
    }

    if (isNavigating) {
      // En navigation : zoom proche et suivi automatique
      // Only update center here. Navigation camera (useMapControls.adjustNavigationCamera)
      // is responsible for zoom/pitch/heading to avoid conflicting writers and zoom jank.
      setCameraConfig({
        centerCoordinate: [location.longitude, location.latitude],
        animationDuration: 300,
      });
      lastCameraUpdateRef.current = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
      };
      // Prefer overlay marker while navigating unless user has manually moved the map
      if (!touchMovedRef.current) setUseOverlayMarker(true);
    } else if (!hasZoomedToUser) {
      // Première fois : zoom modéré sur la position utilisateur
      setCameraConfig({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 16,
      });
      setHasZoomedToUser(true);
      lastCameraUpdateRef.current = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
      };
    }
    // Pas de lastCameraUpdateRef dans les dépendances car c'est un ref
    // Pas de setCameraConfig car c'est une fonction stable du contexte
  }, [isNavigating, location, isMapReady, hasZoomedToUser]);

  // Ensure overlay marker is enabled when navigation starts (unless user recently panned)
  useEffect(() => {
    if (isNavigating && isMapReady && location && !touchMovedRef.current) {
      setUseOverlayMarker(true);
    }
  }, [isNavigating, isMapReady, location]);

  // Gérer les changements de région de la carte
  const handleRegionDidChange = async (feature: any) => {
    if (feature && feature.geometry && feature.geometry.coordinates) {
      const [longitude, latitude] = feature.geometry.coordinates;
      // Sauvegarder la nouvelle position
      await MapStorageService.saveMapPosition(latitude, longitude, 15);
    }
  };
  // Créer les données GeoJSON pour la route
  const routeGeoJSON = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: routeCoords.map((coord) => [
        coord.longitude,
        coord.latitude,
      ]),
    },
  };

  // Créer les données GeoJSON pour la ligne à vol d'oiseau (utilise directLineCoords si disponible)
  const directLineGeoJSON =
    hasDirectLineSegment && directLineCoords.length >= 2
      ? {
          type: "Feature" as const,
          properties: {},

          geometry: {
            type: "LineString" as const,
            coordinates: directLineCoords.map((coord) => [
              coord.longitude,
              coord.latitude,
            ]),
          },
        }
      : location && destination && showDirectLine
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [location.longitude, location.latitude],
              [destination.longitude, destination.latitude],
            ],
          },
        }
      : null;
  // Debug log pour voir les données hybrides
  if (hasDirectLineSegment || (isNavigating && navigationMode === "walking")) {
  }

  // Créer les données GeoJSON pour la progression de la route
  const completedRouteGeoJSON =
    isNavigating && completedRouteCoords.length > 1
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: completedRouteCoords.map((coord) => [
              coord.longitude,
              coord.latitude,
            ]),
          },
        }
      : null;

  const remainingRouteGeoJSON =
    isNavigating && remainingRouteCoords.length > 1
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: remainingRouteCoords.map((coord) => [
              coord.longitude,
              coord.latitude,
            ]),
          },
        }
      : null;

  // Créer les données GeoJSON pour les intersections (seulement virages serrés)
  const intersectionsGeoJSON = {
    type: "FeatureCollection" as const,
    features: detectSharpTurnsInRoute(routeCoords).map((turn, index) => ({
      type: "Feature" as const,
      properties: {
        turnIndex: index,
        angle: turn.angle,
        type: "sharp-turn",
        instruction: `Virage ${
          turn.angle >= 135 ? "serré" : "important"
        } (${Math.round(turn.angle)}°)`,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [turn.coordinate.longitude, turn.coordinate.latitude],
      },
    })),
  };

  // Générer des IDs uniques pour les sources pour éviter les conflits Mapbox
  // Use a stable instance id so source/layer ids do not change across renders
  const instanceIdRef = useRef<string | null>(null);
  if (instanceIdRef.current === null) instanceIdRef.current = `${Date.now()}`;
  const instanceId = instanceIdRef.current;
  const routeSourceId = `route-source-${instanceId}`;
  const directLineSourceId = `direct-line-source-${instanceId}`;
  const intersectionsSourceId = `intersections-source-${instanceId}`;

  // Fonction pour détecter les virages serrés dans la route
  function detectSharpTurnsInRoute(
    coordinates: Coordinate[]
  ): Array<{ coordinate: Coordinate; angle: number }> {
    const sharpTurns: Array<{ coordinate: Coordinate; angle: number }> = [];

    for (let i = 1; i < coordinates.length - 1; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const next = coordinates[i + 1];

      // Calculer les vecteurs
      const vec1 = {
        x: curr.longitude - prev.longitude,
        y: curr.latitude - prev.latitude,
      };
      const vec2 = {
        x: next.longitude - curr.longitude,
        y: next.latitude - curr.latitude,
      };

      // Calculer l'angle entre les vecteurs
      const dot = vec1.x * vec2.x + vec1.y * vec2.y;
      const mag1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
      const mag2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);

      if (mag1 > 0 && mag2 > 0) {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        const angleDegrees = (angle * 180) / Math.PI;

        // Si l'angle est >= 90 degrés, c'est un virage serré
        if (angleDegrees >= 90) {
          sharpTurns.push({
            coordinate: curr,
            angle: angleDegrees,
          });
        }
      }
    }

    return sharpTurns;
  }

  // Gestion du clic sur la carte pour ouvrir le RouteDrawer
  const handleMapPress = async (event: any) => {
    // Mapbox events can come in several shapes depending on platform/version.
    // Try a few common locations for coordinates.
    try {
      let coords: number[] | null = null;

      if (event?.geometry?.coordinates) {
        coords = event.geometry.coordinates;
      } else if (Array.isArray(event?.coordinates)) {
        coords = event.coordinates as number[];
      } else if (event?.nativeEvent?.coordinates) {
        coords = event.nativeEvent.coordinates;
      } else if (
        event?.features &&
        Array.isArray(event.features) &&
        event.features[0]?.geometry?.coordinates
      ) {
        coords = event.features[0].geometry.coordinates;
      } else if (event?.properties?.coordinate) {
        const c = event.properties.coordinate;
        if (
          c &&
          typeof c.longitude === "number" &&
          typeof c.latitude === "number"
        ) {
          onLongPress({ latitude: c.latitude, longitude: c.longitude });
          return;
        }
      }

      // If we couldn't find coords in the event, fallback to map center if available
      if (
        !coords &&
        mapRef &&
        (mapRef as any).current &&
        typeof (mapRef as any).current.getCenter === "function"
      ) {
        try {
          const center = await (mapRef as any).current.getCenter();
          if (Array.isArray(center) && center.length >= 2) {
            coords = center as number[]; // [lon, lat]
          }
        } catch (e) {
          // ignore fallback failure
        }
      }

      if (coords && coords.length >= 2) {
        const [longitude, latitude] = coords;
        console.debug("handleMapPress coords", longitude, latitude);
        onLongPress({ latitude, longitude });
        return;
      }

      console.warn(
        "handleMapPress: unable to determine coordinates from event",
        event
      );
    } catch (e) {
      console.warn("handleMapPress error", e);
    }
  };

  // Touch handlers to detect small taps that slightly move the map
  const handleTouchStart = (e: any) => {
    try {
      const ne = e?.nativeEvent;
      if (ne && typeof ne.pageX === "number" && typeof ne.pageY === "number") {
        touchStartRef.current = { x: ne.pageX, y: ne.pageY };
        touchMovedRef.current = false;
      }
      // also call external pan drag handler if provided
      if (onMapPanDrag) onMapPanDrag();
    } catch (err) {
      // ignore
    }
  };

  const handleTouchMove = (e: any) => {
    try {
      const ne = e?.nativeEvent;
      if (!ne || !touchStartRef.current) return;
      const dx = Math.abs(ne.pageX - touchStartRef.current.x);
      const dy = Math.abs(ne.pageY - touchStartRef.current.y);
      if (dx > 6 || dy > 6) {
        touchMovedRef.current = true;
        // User moved the map: switch back to map-layer marker
        if (useOverlayMarker) setUseOverlayMarker(false);
      }
    } catch (err) {
      // ignore
    }
  };

  const handleTouchEnd = async (e: any) => {
    try {
      // If touch did not move beyond threshold, consider it a tap
      if (!touchMovedRef.current) {
        // Try to extract coords from event first
        if (e?.nativeEvent?.coordinates) {
          await handleMapPress(e);
          return;
        }

        // Fallback to center coordinate
        if (
          mapRef &&
          (mapRef as any).current &&
          typeof (mapRef as any).current.getCenter === "function"
        ) {
          const center = await (mapRef as any).current.getCenter();
          if (Array.isArray(center) && center.length >= 2) {
            const [longitude, latitude] = center as number[];
            onLongPress({ latitude, longitude });
            return;
          }
        }
        return;
      }

      // If the touch DID move (user panned), ensure overlay marker is disabled
      if (touchMovedRef.current && useOverlayMarker) {
        setUseOverlayMarker(false);
      }
    } catch (err) {
      // ignore
    }
  };

  // Effet pour ajuster la caméra selon le mode boussole
  // useEffect(() => {
  //   if (location) {
  //   }
  // }, [compassMode, currentHeading, location]);

  return (
    <View style={styles.container}>
      {initialCenter && (
        <MapView
          ref={mapRef}
          style={styles.map}
          styleJSON={JSON.stringify(libertyStyle)}
          // Use onLongPress for location selection; also attach onPress to cover platform differences
          onLongPress={handleMapPress}
          onPress={handleMapPress}
          onTouchStart={(e) => {
            handleTouchStart(e);
            if (onMapPanDrag) onMapPanDrag();
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => {
            handleTouchEnd(e);
          }}
          onDidFinishLoadingMap={handleMapReady}
          onCameraChanged={onCameraChanged}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
        >
          {/* Composant Camera pour contrôler la position et le zoom */}
          {isMapReady && (
            <Camera
              centerCoordinate={centerCoordinate || initialCenter}
              zoomLevel={zoomLevel}
              pitch={pitch}
              heading={getCameraHeading()}
              animationDuration={1000}
            />
          )}

          {/* ==================== ROUTES (RENDU EN PREMIER - DESSOUS) ==================== */}

          {/* Affichage de la route avec progression en navigation ou route normale */}
          {isMapReady &&
          isNavigating &&
          (completedRouteGeoJSON || remainingRouteGeoJSON) ? (
            <>
              {remainingRouteGeoJSON && (
                <ShapeSource
                  id={`remaining-route-${instanceId}`}
                  shape={remainingRouteGeoJSON}
                >
                  <LineLayer
                    id={`remaining-route-layer-${instanceId}`}
                    style={{
                      lineColor: "#007AFF", // Bleu pour la route restante
                      lineWidth: 4,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              )}
            </>
          ) : (
            /* Route normale (quand pas en navigation ou pas de données de progression) */
            isMapReady &&
            (alternativeRoutes && alternativeRoutes.length > 0 ? (
              // Render each alternative route
              <>
                {alternativeRoutes.map((alt, idx) => {
                  if (!alt || !alt.coords || alt.coords.length === 0)
                    return null;
                  const shape = {
                    type: "Feature" as const,
                    properties: {},
                    geometry: {
                      type: "LineString" as const,
                      coordinates: alt.coords.map((c) => [
                        c.longitude,
                        c.latitude,
                      ]),
                    },
                  };
                  const isSelected = idx === (selectedAlternativeIndex || 0);
                  return (
                    <ShapeSource
                      key={`alt-${idx}-${instanceId}`}
                      id={`alt-route-${idx}-${instanceId}`}
                      shape={shape}
                    >
                      <LineLayer
                        id={`alt-route-layer-${idx}-${instanceId}`}
                        style={{
                          lineColor: isSelected ? "#007AFF" : "#B0B0B0",
                          lineWidth: isSelected ? 5 : 3,
                          lineCap: "round",
                          lineJoin: "round",
                          lineOpacity: isSelected ? 1 : 0.8,
                        }}
                      />
                    </ShapeSource>
                  );
                })}
              </>
            ) : (
              isMapReady &&
              routeCoords.length > 0 && (
                <ShapeSource id={routeSourceId} shape={routeGeoJSON}>
                  <LineLayer
                    id={`route-layer-${instanceId}`}
                    style={{
                      lineColor: "#007AFF",
                      lineWidth: 4,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              )
            ))
          )}

          {/* Ligne à vol d'oiseau (en plus de la route normale si besoin) */}
          {isMapReady && directLineGeoJSON && (
            <ShapeSource id={directLineSourceId} shape={directLineGeoJSON}>
              <LineLayer
                id={`direct-line-layer-${instanceId}`}
                style={{
                  lineColor: "#FF6B35",
                  lineWidth: 3,
                  lineCap: "round",
                  lineJoin: "round",
                  lineDasharray: [2, 3],
                  lineOpacity: 0.8,
                }}
              />
            </ShapeSource>
          )}

          {/* ==================== MARQUEURS UTILISATEUR (RENDU AU-DESSUS) ==================== */}

          {/* Marqueur de position utilisateur (ShapeSource + cercles d'accuracy) */}
          {isMapReady && location && (
            <>
              {/* Source de données pour le marqueur utilisateur (cercles seulement) */}
              <ShapeSource
                id="user-location-source"
                shape={{
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [location.longitude, location.latitude],
                  },
                  properties: {
                    heading: currentHeading || 0,
                  },
                }}
              >
                <CircleLayer
                  id="user-accuracy-circle"
                  style={{
                    circleRadius: location.accuracy
                      ? Math.max(location.accuracy / 2, 10)
                      : 20,
                    circleColor: "rgba(0, 122, 255, 0.1)",
                    circleStrokeColor: "rgba(0, 122, 255, 0.3)",
                    circleStrokeWidth: 1,
                    circlePitchAlignment: "map",
                  }}
                />

                {/* Afficher le cercle bleu seulement si on n'utilise pas UserLocationMarker */}
                {useOverlayMarker && (
                  <CircleLayer
                    id="user-location-dot"
                    style={{
                      circleRadius: 18,
                      circleColor: "#007AFF",
                      circleStrokeColor: "white",
                      circleStrokeWidth: 3,
                    }}
                  />
                )}
              </ShapeSource>
            </>
          )}

          {isMapReady && isValidCoordObj(destination) && (
            <PointAnnotation
              id="destination"
              coordinate={[destination.longitude, destination.latitude]}
            >
              <View collapsable={false} style={styles.destinationMarker}>
                <MaterialIcons name="place" size={30} color="#34C759" />
              </View>
            </PointAnnotation>
          )}

          {/* Point de location sélectionné */}
          {isMapReady &&
            showLocationPoint &&
            isValidCoordObj(selectedLocationCoordinate) && (
              <PointAnnotation
                id="selected-location"
                coordinate={[
                  selectedLocationCoordinate.longitude,
                  selectedLocationCoordinate.latitude,
                ]}
              >
                <View collapsable={false} style={styles.selectedLocationMarker}>
                  <MaterialIcons name="location-on" size={30} color="#007AFF" />
                </View>
              </PointAnnotation>
            )}

          {/* -------------------- USER ARROW (RENDER LAST TO BE ON TOP) -------------------- */}
          {isMapReady &&
            location &&
            isFinite(location.longitude) &&
            isFinite(location.latitude) &&
            !useOverlayMarker && (
              <PointAnnotation
                key={`user-location-${isNavigating ? 'nav' : 'normal'}`}
                id="user-location-arrow"
                coordinate={[location.longitude, location.latitude]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <UserLocationMarker
                  location={location}
                  isNavigating={isNavigating}
                  color={userLocationColor || "#007AFF"}
                />
              </PointAnnotation>
            )}

          {/* Aperçu GPX: flèche transparente à la position du slider */}
          {isMapReady && isValidCoordObj(previewMarkerCoordinate) && (
            <PointAnnotation
              id="gpx-preview-arrow"
              coordinate={[
                previewMarkerCoordinate.longitude,
                previewMarkerCoordinate.latitude,
              ]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View collapsable={false} style={{ opacity: 0.6 }}>
                <NavigationArrow
                  size={28}
                  color="rgba(0,122,255,0.6)"
                  styleTransform={[
                    { rotate: `${(previewMarkerBearing || 0).toFixed(2)}deg` },
                  ]}
                />
              </View>
            </PointAnnotation>
          )}

          {/* Parking sélectionné */}
          {isMapReady &&
            selectedParking &&
            isValidCoordObj(selectedParking.coordinate) && (
              <PointAnnotation
                id="selected-parking"
                coordinate={[
                  selectedParking.coordinate.longitude,
                  selectedParking.coordinate.latitude,
                ]}
              >
                <View collapsable={false} style={styles.parkingMarker}>
                  <MaterialIcons
                    name="local-parking"
                    size={28}
                    color="#FF9500"
                  />
                </View>
              </PointAnnotation>
            )}

          {/* Marqueurs POI */}
          {isMapReady &&
            pois
              .filter(
                (poi) =>
                  poi.lat != null &&
                  poi.lon != null &&
                  !isNaN(poi.lat) &&
                  !isNaN(poi.lon)
              )
              .map((poi, index) => (
                <PointAnnotation
                  key={`poi-${poi.id}-${index}`}
                  id={`poi-${poi.id}-${index}`}
                  coordinate={[poi.lon, poi.lat]}
                >
                  <View collapsable={false} style={styles.poiMarker}>
                    <MaterialIcons
                      name="place"
                      size={selectedPOI?.id === poi.id ? 30 : 24}
                      color={selectedPOI?.id === poi.id ? "#FF0000" : "#007AFF"}
                    />
                  </View>
                </PointAnnotation>
              ))}

          {/* Marqueur dédié pour le POI sélectionné (surdimensionné et visible au-dessus) */}
          {isMapReady &&
            selectedPOI &&
            selectedPOI.lat != null &&
            selectedPOI.lon != null && (
              <PointAnnotation
                id="selected-poi"
                coordinate={[selectedPOI.lon, selectedPOI.lat]}
              >
                <View collapsable={false} style={styles.selectedPoiMarker}>
                  <MaterialIcons name="place" size={36} color="#FF3B30" />
                </View>
              </PointAnnotation>
            )}

          {/* Intersections et étapes de navigation */}
          {isMapReady && intersectionsGeoJSON.features.length > 0 && (
            <ShapeSource
              id={intersectionsSourceId}
              shape={intersectionsGeoJSON}
            >
              <CircleLayer
                id={`intersections-layer-${instanceId}`}
                style={{
                  circleRadius: [
                    "case",
                    ["==", ["get", "type"], "navigation-step"],
                    [
                      "case",
                      ["get", "isCurrent"],
                      12,
                      ["get", "isCompleted"],
                      8,
                      10,
                    ],
                    ["==", ["get", "type"], "sharp-turn"],
                    6, // Plus petit pour les virages
                    8, // Défaut
                  ],
                  circleColor: [
                    "case",
                    ["==", ["get", "type"], "navigation-step"],
                    [
                      "case",
                      ["get", "isCurrent"],
                      "#FF3B30", // Rouge pour l'étape actuelle
                      ["get", "isCompleted"],
                      "#34C759", // Vert pour les étapes complétées
                      "#007AFF", // Bleu pour les étapes futures
                    ],
                    ["==", ["get", "type"], "sharp-turn"],
                    "#FF9500", // Orange pour les virages serrés
                    "#007AFF", // Défaut
                  ],
                  circleStrokeColor: "#FFFFFF",
                  circleStrokeWidth: 2,
                  circleOpacity: [
                    "case",
                    ["==", ["get", "type"], "sharp-turn"],
                    0.7, // Moins opaque pour les virages
                    0.9, // Pleine opacité pour les étapes
                  ],
                }}
              />
            </ShapeSource>
          )}

          {/* Affichage des instructions aux intersections et virages */}
          {isMapReady &&
            isNavigating &&
            navigationSteps.map((step, index) => {
              // Ne pas rendre les étapes déjà effectuées
              if (index < currentStepIndex) return null;

              // Calculer l'orientation de la flèche : vers la prochaine étape si disponible
              const coord = step.coordinates as [number, number]; // [lon, lat]
              if (!isValidCoordArray(coord)) return null;
              const nextCoord =
                navigationSteps[index + 1]?.coordinates ||
                (destination
                  ? [destination.longitude, destination.latitude]
                  : null);
              let bearing = 0;
              if (nextCoord) {
                // calculateBearing(lat1, lon1, lat2, lon2)
                if (isValidCoordArray(nextCoord)) {
                  bearing = calculateBearing(
                    coord[1],
                    coord[0],
                    nextCoord[1],
                    nextCoord[0]
                  );
                }
              }

              return (
                <PointAnnotation
                  key={`step-${index}`}
                  id={`navigation-step-${index}`}
                  coordinate={coord}
                  onSelected={() => {
                    if (onNavigationStepPress) {
                      onNavigationStepPress(index, step);
                    }
                  }}
                >
                  <View
                    collapsable={false}
                    style={[
                      styles.navigationStepWrapper,
                      index === currentStepIndex && styles.currentStepWrapper,
                    ]}
                  >
                    {/* Arrow marker rotated to follow the path */}
                    <View
                      collapsable={false}
                      style={{
                        width: 28,
                        height: 28,
                        justifyContent: "center",
                        alignItems: "center",
                        transform: [{ rotate: `${bearing}deg` }],
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor:
                            index === currentStepIndex ? "#FF3B30" : "#007AFF",
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: 2,
                          borderColor: "#FFFFFF",
                        }}
                      >
                        <MaterialIcons
                          name="navigation"
                          size={14}
                          color="white"
                        />
                      </View>
                    </View>

                    {/* Instruction visible uniquement pour l'étape actuelle */}
                    {index === currentStepIndex && (
                      <View style={styles.instructionBubble}>
                        <Text style={styles.instructionText} numberOfLines={2}>
                          {step.instruction}
                        </Text>
                      </View>
                    )}
                  </View>
                </PointAnnotation>
              );
            })}

          {/* Affichage des virages serrés sur la route */}
          {isMapReady &&
            !isNavigating &&
            routeCoords.length > 0 &&
            detectSharpTurnsInRoute(routeCoords).map((turn, index) => {
              const coordArr = [
                turn.coordinate.longitude,
                turn.coordinate.latitude,
              ];
              if (!isValidCoordArray(coordArr)) return null;
              return (
                <PointAnnotation
                  key={`turn-${index}`}
                  id={`sharp-turn-${index}`}
                  coordinate={coordArr}
                >
                  <View collapsable={false} style={styles.sharpTurnMarker}>
                    <MaterialIcons name="warning" size={12} color="white" />
                  </View>
                </PointAnnotation>
              );
            })}
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  navigationArrowContainer: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)", // Fond plus opaque
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#FFFFFF", // Bordure blanche plus visible
    elevation: 8, // Android
    shadowColor: "#000", // iOS
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  navigationArrowBackground: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3, // Android
    shadowColor: "#000", // iOS
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.35,
    shadowRadius: 3.84,
  },
  userLocationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 122, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  userLocationDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    // Améliorer la visibilité de la flèche
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  accuracyCircle: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 122, 255, 0.3)",
    top: -10,
    left: -10,
    zIndex: -1,
  },
  destinationMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  selectedLocationMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  poiMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  selectedPoiMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    borderWidth: 2,
    borderColor: "#FF3B30",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  navigationStepMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  currentStepMarker: {
    backgroundColor: "#FF3B30",
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  completedStepMarker: {
    backgroundColor: "#34C759",
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  sharpTurnMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FF9500",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  instructionBubble: {
    position: "absolute",
    top: -50,
    left: -75,
    width: 150,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 8,
    padding: 8,
  },
  instructionText: {
    color: "white",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  parkingMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9500",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  navigationStepWrapper: {
    position: "relative",
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  currentStepWrapper: {
    // Effet visuel pour l'étape actuelle
    transform: [{ scale: 1.2 }],
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  overlayMarkerContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -20 }, { translateY: -20 }],
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    elevation: 20,
    pointerEvents: "none",
  },
});
