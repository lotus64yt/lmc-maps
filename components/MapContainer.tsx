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
} from "@rnmapbox/maps";
import * as Location from "expo-location";
import { Animated } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { OverpassPOI } from "../services/OverpassService";
import { MapStorageService } from "../services/MapStorageService";
import { useMapView } from "../contexts/MapViewContext";
import { NavigationStep } from "../types/RouteTypes";
import { useLocationService } from "@/services/LocationService";

Mapbox.setAccessToken("");

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
  showDirectLine?: boolean; // Pour afficher la ligne à vol d'oiseau
  navigationSteps?: NavigationStep[]; // Étapes de navigation
  currentStepIndex?: number; // Index de l'étape actuelle
  onNavigationStepPress?: (stepIndex: number, step: NavigationStep) => void; // Callback pour clic sur étape
  // Nouvelles props pour le tracé hybride
  directLineCoords?: Coordinate[];
  nearestRoadPoint?: Coordinate | null;
  hasDirectLineSegment?: boolean;
  // Props pour le point de location sélectionné
  showLocationPoint?: boolean;
  selectedLocationCoordinate?: Coordinate | null;
  // Props pour le parking sélectionné
  selectedParking?: {
    coordinate: Coordinate;
    name: string;
  } | null;
}

interface SavedMapState {
  latitude: number;
  longitude: number;
  zoomLevel: number;
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
  // Nouvelles props pour le tracé hybride
  directLineCoords = [],
  nearestRoadPoint,
  hasDirectLineSegment = false,
  // Props pour le point de location sélectionné
  showLocationPoint = false,
  selectedLocationCoordinate,
  // Props pour le parking sélectionné
  selectedParking,
}: MapContainerProps) {
  // Utiliser le contexte MapView
  const {
    mapRef,
    centerCoordinate,
    zoomLevel,
    pitch,
    setPitch,
    setCameraConfig,
  } = useMapView();

  const { heading } = useLocationService();

  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(
    null
  );
  const [initialZoom, setInitialZoom] = useState<number>(13);
  const [hasZoomedToUser, setHasZoomedToUser] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const [isMapReady, setIsMapReady] = useState(false);

  const [mapBearing, setMapBearing] = useState(0);console.log(heading !== 0 ? heading : currentHeading || 0)

  // Debug log pour le heading
  useEffect(() => {}, [heading, currentHeading, compassMode, mapBearing]);

  // Fonction pour gérer les changements de la caméra
  const onCameraChanged = (state) => {
    setMapBearing(state.properties.bearing || 0);
    setPitch(state.properties.pitch || 0);
  };

  // Handler pour quand la map est prête
  const handleMapReady = () => {
    setIsMapReady(true);};

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

      setHasInitialized(true);};

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
      setHasZoomedToUser(true);}
  }, [location, hasZoomedToUser, initialCenter]);

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
      : null; // Retourner null si pas de données valides

  // Debug log pour voir les données hybrides
  if (hasDirectLineSegment || (isNavigating && navigationMode === "walking")) {}

  // Créer les données GeoJSON pour les intersections/étapes de navigation et virages serrés
  const intersectionsGeoJSON = {
    type: "FeatureCollection" as const,
    features:
      (isNavigating && navigationSteps.length > 0) || routeCoords.length > 0
        ? [
            // Étapes de navigation existantes
            ...navigationSteps.map((step, index) => ({
              type: "Feature" as const,
              properties: {
                stepIndex: index,
                isCurrent: index === currentStepIndex,
                isCompleted: index < currentStepIndex,
                instruction: step.instruction,
                maneuver: step.maneuver,
                type: "navigation-step",
              },
              geometry: {
                type: "Point" as const,
                coordinates: step.coordinates,
              },
            })),
            // Virages serrés détectés dans la route
            ...detectSharpTurnsInRoute(routeCoords).map((turn, index) => ({
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
                coordinates: [
                  turn.coordinate.longitude,
                  turn.coordinate.latitude,
                ],
              },
            })),
          ]
        : [], // Retourner un tableau vide au lieu de null
  };

  // Générer des IDs uniques pour les sources pour éviter les conflits Mapbox
  const currentTimestamp = Date.now();
  const routeSourceId = `route-source-${currentTimestamp}`;
  const directLineSourceId = `direct-line-source-${currentTimestamp}`;
  const intersectionsSourceId = `intersections-source-${currentTimestamp}`;

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
  const handleMapPress = (feature: any) => {
    if (feature.geometry && feature.geometry.coordinates) {
      const [longitude, latitude] = feature.geometry.coordinates;
      onLongPress({ latitude, longitude });
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
          styleURL="https://tiles.openfreemap.org/styles/liberty"
          onPress={handleMapPress}
          onTouchStart={onMapPanDrag}
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
              heading={compassMode === "heading" ? (heading !== 0 ? heading : currentHeading || 0) : 0}
              animationDuration={1000}
            />
          )}

          {/* Marqueur de position utilisateur avec flèche MaterialIcons */}
          {isMapReady && location && (
            <>
              {/* Cercle de précision et point central avec ShapeSource pour la 3D */}
              <ShapeSource
                id="user-location-base"
                shape={{
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "Point",
                    coordinates: [location.longitude, location.latitude],
                  },
                }}
              >
                {/* Cercle de précision */}
                <CircleLayer
                  id="user-accuracy-circle"
                  style={{
                    circleRadius: location.accuracy
                      ? Math.max(location.accuracy / 2, 10)
                      : 20,
                    circleColor: "rgba(0, 122, 255, 0.1)",
                    circleStrokeColor: "rgba(0, 122, 255, 0.3)",
                    circleStrokeWidth: 1,
                    circlePitchAlignment: "map", // S'adapte à l'inclinaison 3D
                  }}
                />

                {/* Point de position */}
                <CircleLayer
                  id="user-location-dot"
                  style={{
                    circleRadius: 8,
                    circleColor: "#007AFF",
                    circleStrokeColor: "white",
                    circleStrokeWidth: 2,
                    circlePitchAlignment: "map", // S'adapte à l'inclinaison 3D
                  }}
                />
              </ShapeSource>

              {/* Flèche de navigation */}
              <PointAnnotation
                id="user-navigation-arrow"
                coordinate={[location.longitude, location.latitude]}
              >
                <Animated.View
                  style={[
                    styles.navigationArrowContainer,
                    {
                      transform: [
                        {
                          rotate: `${
                            compassMode === "heading"
                              ? 0 // En mode heading, la carte tourne avec le téléphone, la flèche reste pointée vers le nord
                              : (heading !== 0 ? heading : currentHeading || 0) // En mode normal, seule la flèche tourne selon l'orientation
                          }deg`,
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.navigationArrowBackground}>
                    <MaterialIcons
                      name="navigation"
                      size={22}
                      color="white"
                      style={styles.navigationIcon}
                    />
                  </View>
                </Animated.View>
              </PointAnnotation>
            </>
          )}

          {isMapReady && destination && (
            <PointAnnotation
              id="destination"
              coordinate={[destination.longitude, destination.latitude]}
            >
              <View style={styles.destinationMarker}>
                <MaterialIcons name="place" size={30} color="#34C759" />
              </View>
            </PointAnnotation>
          )}

          {/* Point de location sélectionné */}
          {isMapReady && showLocationPoint && selectedLocationCoordinate && (
            <PointAnnotation
              id="selected-location"
              coordinate={[
                selectedLocationCoordinate.longitude,
                selectedLocationCoordinate.latitude,
              ]}
            >
              <View style={styles.selectedLocationMarker}>
                <MaterialIcons name="location-on" size={30} color="#007AFF" />
              </View>
            </PointAnnotation>
          )}

          {/* Point de transition vers la route (si tracé hybride) */}
          {isMapReady && nearestRoadPoint && hasDirectLineSegment && (
            <PointAnnotation
              id="road-transition"
              coordinate={[
                nearestRoadPoint.longitude,
                nearestRoadPoint.latitude,
              ]}
            >
              <View style={styles.destinationMarker}>
                <MaterialIcons
                  name="compare-arrows"
                  size={24}
                  color="#FF9500"
                />
              </View>
            </PointAnnotation>
          )}

          {/* Parking sélectionné */}
          {isMapReady &&
            selectedParking &&
            selectedParking.coordinate &&
            (() => {
              const lat = selectedParking.coordinate.latitude;
              const lon = selectedParking.coordinate.longitude;

              const isValid =
                typeof lat === "number" &&
                typeof lon === "number" &&
                !isNaN(lat) &&
                !isNaN(lon) &&
                isFinite(lat) &&
                isFinite(lon) &&
                lat >= -90 &&
                lat <= 90 &&
                lon >= -180 &&
                lon <= 180;

              return isValid;
            })() && (
              <PointAnnotation
                id="selected-parking"
                coordinate={[
                  selectedParking.coordinate.longitude,
                  selectedParking.coordinate.latitude,
                ]}
              >
                <View style={styles.parkingMarker}>
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
                  <View style={styles.poiMarker}>
                    <MaterialIcons
                      name="place"
                      size={selectedPOI?.id === poi.id ? 30 : 24}
                      color={selectedPOI?.id === poi.id ? "#FF0000" : "#007AFF"}
                    />
                  </View>
                </PointAnnotation>
              ))}

          {/* Ligne de route ou ligne à vol d'oiseau */}
          {isMapReady && routeCoords.length > 0 && (
            <ShapeSource id={routeSourceId} shape={routeGeoJSON}>
              <LineLayer
                id={`route-layer-${currentTimestamp}`}
                style={{
                  lineColor: "#007AFF",
                  lineWidth: 4,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
          )}

          {/* Ligne à vol d'oiseau (en plus de la route normale si besoin) */}
          {isMapReady && directLineGeoJSON && (
            <ShapeSource id={directLineSourceId} shape={directLineGeoJSON}>
              <LineLayer
                id={`direct-line-layer-${currentTimestamp}`}
                style={{
                  lineColor: "#FF9500",
                  lineWidth: 3,
                  lineCap: "round",
                  lineJoin: "round",
                  lineDasharray: [5, 5], // Ligne pointillée
                  lineOpacity: 0.8,
                }}
              />
            </ShapeSource>
          )}

          {/* Intersections et étapes de navigation */}
          {isMapReady && intersectionsGeoJSON.features.length > 0 && (
            <ShapeSource
              id={intersectionsSourceId}
              shape={intersectionsGeoJSON}
            >
              <CircleLayer
                id={`intersections-layer-${currentTimestamp}`}
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
          {isNavigating &&
            navigationSteps.map((step, index) => (
              <PointAnnotation
                key={`step-${index}`}
                id={`navigation-step-${index}`}
                coordinate={step.coordinates}
                onSelected={() => {
                  if (onNavigationStepPress) {
                    onNavigationStepPress(index, step);
                  }
                }}
              >
                <View
                  style={[
                    styles.navigationStepMarker,
                    index === currentStepIndex && styles.currentStepMarker,
                    index < currentStepIndex && styles.completedStepMarker,
                  ]}
                >
                  <MaterialIcons
                    name={getManeuverIcon(step.maneuver)}
                    size={16}
                    color="white"
                  />
                  {index === currentStepIndex && (
                    <View style={styles.instructionBubble}>
                      <Text style={styles.instructionText} numberOfLines={2}>
                        {step.instruction}
                      </Text>
                    </View>
                  )}
                </View>
              </PointAnnotation>
            ))}

          {/* Affichage des virages serrés sur la route */}
          {!isNavigating &&
            routeCoords.length > 0 &&
            detectSharpTurnsInRoute(routeCoords).map((turn, index) => (
              <PointAnnotation
                key={`turn-${index}`}
                id={`sharp-turn-${index}`}
                coordinate={[
                  turn.coordinate.longitude,
                  turn.coordinate.latitude,
                ]}
              >
                <View style={styles.sharpTurnMarker}>
                  <MaterialIcons name="warning" size={12} color="white" />
                </View>
              </PointAnnotation>
            ))}
        </MapView>
      )}
    </View>
  );

  // Fonction pour obtenir l'icône du maneuver
  function getManeuverIcon(
    maneuver: string
  ): keyof typeof MaterialIcons.glyphMap {
    switch (maneuver) {
      case "turn-left":
        return "turn-left";
      case "turn-right":
        return "turn-right";
      case "turn-sharp-left":
        return "turn-sharp-left";
      case "turn-sharp-right":
        return "turn-sharp-right";
      case "turn-slight-left":
        return "turn-slight-left";
      case "turn-slight-right":
        return "turn-slight-right";
      case "straight":
        return "straight";
      case "roundabout":
        return "roundabout-left";
      case "merge":
        return "merge";
      default:
        return "navigation";
    }
  }
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
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
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
  navigationIcon: {
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
});
