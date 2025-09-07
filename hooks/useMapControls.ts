import { useRef, useState, useCallback } from "react";
import { MapView } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { NominatimService } from "../services/NominatimService";
import { useMapView } from "../contexts/MapViewContext";

export function useMapControls() {
  const {
    animateToLocation,
    animateToLocationLocked,
    setCameraConfig,
    fitToCoordinates,
    setViewportPadding,
    currentViewportPadding,
    setDrawerCameraControl,
    releaseDrawerCameraControl,
  } = useMapView();
  const CONTROLLER_ID = 'useMapControls';
  const [compassMode, setCompassMode] = useState<"north" | "heading">("north");
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationMode, setNavigationMode] = useState<"driving" | "walking">(
    "driving"
  );
  const [showRecenterPrompt, setShowRecenterPrompt] = useState(false);
  const lastUpdateTime = useRef(0);
  const lastHeading = useRef(0);
  const lastFollowPosition = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastIntersectionDistance = useRef<number>(1000); // Distance à la dernière intersection connue
  const recenterTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastMapInteraction = useRef<number>(0);

  // Fonction utilitaire pour calculer la distance entre deux points (en mètres)
  const calculateDistance = (
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

  // Fonction pour ajuster la caméra en mode navigation
  const adjustNavigationCamera = useCallback(
    (
      userLocation: Location.LocationObjectCoords,
      nextStepLocation?: { latitude: number; longitude: number },
      distanceToNextStep?: number,
      headingOverride?: number
    ) => {
      if (!isNavigating) return;

      let pitch = 0;
      let zoom = 16;
  // Animation plus fluide et plus réactive pour la navigation
  // Durées réduites pour avoir un rendu plus fluide sans latence perceptible
  let animationDuration = navigationMode === "driving" ? 250 : 400;

      let cameraConfig: any = {
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        pitch: pitch,
        zoomLevel: zoom,
        animationDuration: animationDuration,
      };

      if (navigationMode === "driving") {
        // Mode voiture : inclinaison plus importante et zoom adaptatif
        pitch = 45; // Inclinaison pour vue de conduite

        // Zoom dynamique basé sur la distance à la prochaine étape
        if (distanceToNextStep) {
          if (distanceToNextStep > 1000) {
            // Loin de l'étape : zoom arrière pour voir plus de contexte
            zoom = 14;
            pitch = 35; // Moins incliné pour voir plus large
          } else if (distanceToNextStep > 500) {
            // Distance moyenne : zoom équilibré
            zoom = 15;
            pitch = 40;
          } else if (distanceToNextStep > 200) {
            // Proche : zoom plus serré
            zoom = 16;
            pitch = 45;
          } else if (distanceToNextStep > 50) {
            // Très proche : zoom serré avec inclinaison
            zoom = 17;
            pitch = 50;
          } else {
            // À l'intersection : vue plus droite pour mieux voir
            zoom = 18;
            pitch = 30;
          }
        } else {
          // Pas d'étape suivante connue : paramètres par défaut
          zoom = 16;
          pitch = 45;
        }
      } else if (navigationMode === "walking") {
        // Mode piéton : logique existante
        pitch = 60; // Inclinaison par défaut pour voir plus de route
        zoom = 18; // Zoom par défaut pour la marche

        // Si on approche d'une intersection (moins de 50m)
        if (distanceToNextStep && distanceToNextStep < 50) {
          pitch = 0; // Remettre la caméra droite
          zoom = Math.max(19, 22 - distanceToNextStep / 10); // Zoomer au fur et à mesure qu'on approche
        }
      }

      // Mettre à jour les valeurs dans la config
      cameraConfig.pitch = pitch;
      cameraConfig.zoomLevel = zoom;

      // Si un headingOverride est fourni (par ex. bearing de la route), l'utiliser
      if (typeof headingOverride === "number" && !isNaN(headingOverride)) {
        // Normaliser l'angle
        const normalize = (a: number) => ((a % 360) + 360) % 360;
        cameraConfig.heading = normalize(headingOverride);
      } else {
        // Seulement définir le heading si on n'est PAS en mode boussole
        // Car updateMapHeading se charge déjà de ça
        if (compassMode === "north") {
          cameraConfig.heading = 0; // Nord en haut en mode normal
        }
        // Si compassMode === "heading", on laisse updateMapHeading gérer le heading
      }

  // Forcer la mise à jour quand on est en navigation pour s'assurer que la map suit
  // Use controller id so drawer/other controllers don't block navigation updates
  setCameraConfig(cameraConfig, true, CONTROLLER_ID);

      lastIntersectionDistance.current = distanceToNextStep || 1000;
    },
    [isNavigating, navigationMode, compassMode, setCameraConfig]
  );

  // Fonction pour démarrer la navigation piétonne
  const startWalkingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("walking");
  }, []);

  // Fonction pour démarrer la navigation en voiture
  const startDrivingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("driving");
  }, []);

  // Fonction pour démarrer la navigation selon le mode de transport
  const startNavigationForMode = useCallback((mode: "driving" | "walking") => {
    setIsNavigating(true);
    setNavigationMode(mode);
    setIsFollowingUser(true); // Démarrer en mode suivi
    setShowRecenterPrompt(false);
  }, []);

  // Fonction pour arrêter la navigation
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setShowRecenterPrompt(false);

    // Nettoyer le timer de recentrage
    if (recenterTimeout.current) {
      clearTimeout(recenterTimeout.current);
      recenterTimeout.current = null;
    }

    // Remettre la caméra en vue normale
    setCameraConfig(
      {
        pitch: 0,
        zoomLevel: 16,
        animationDuration: 1000,
      },
      false,
      CONTROLLER_ID
    );
  }, [setCameraConfig]);

  const recenterMap = async (location: Location.LocationObjectCoords) => {
    if (location) {
      try {
        // Basculer le mode suivi automatique
        const newFollowMode = !isFollowingUser;
        setIsFollowingUser(newFollowMode);

        if (newFollowMode) {
          // Si on active le mode suivi, centrer immédiatement sur l'utilisateur
          const zoom = await NominatimService.getZoomForLocation(
            location.latitude,
            location.longitude
          );

          animateToLocation(location.latitude, location.longitude, zoom);
          lastFollowPosition.current = null; // Réinitialiser pour permettre le suivi immédiat
        } else {
          lastFollowPosition.current = null; // Réinitialiser quand on désactive aussi
        }
      } catch (error) {
        console.error("❌ Error toggling follow mode:", error);
      }
    }
  };

  // Nouvelle fonction pour suivre automatiquement la position utilisateur
  const followUserLocation = useCallback(
    (location: Location.LocationObjectCoords) => {
      if (isFollowingUser) {
        const now = Date.now();
        const timeDiff = now - lastUpdateTime.current;

        // Vérifier si la position a suffisamment changé
        const lastPos = lastFollowPosition.current;
        if (lastPos) {
          // Seuils adaptatifs selon le mode de navigation
          const distanceThreshold =
            isNavigating && navigationMode === "driving"
              ? 0.00002 // ~2 mètres pour la conduite (plus sensible)
              : 0.00005; // ~5 mètres pour la marche ou mode normal

          const latDiff = Math.abs(location.latitude - lastPos.latitude);
          const lonDiff = Math.abs(location.longitude - lastPos.longitude);

          // Throttling adaptatif : plus fréquent en navigation
          const minUpdateInterval =
            isNavigating && navigationMode === "driving" ? 200 : 500;

          // Si le déplacement est trop petit ET que le dernier update était récent, ignorer
          if (
            latDiff < distanceThreshold &&
            lonDiff < distanceThreshold &&
            timeDiff < minUpdateInterval
          ) {
            return;
          }
        }

        lastUpdateTime.current = now;
        lastFollowPosition.current = {
          latitude: location.latitude,
          longitude: location.longitude,
        };

        // Animation plus rapide et fluide en mode navigation
        const animationDuration =
          isNavigating && navigationMode === "driving" ? 400 : 800;

        // Mettre à jour la caméra pour suivre l'utilisateur
        setCameraConfig(
          {
            centerCoordinate: [location.longitude, location.latitude],
            animationDuration: animationDuration,
          },
          true,
          CONTROLLER_ID
        );
      }
    },
    [isFollowingUser, isNavigating, navigationMode, setCameraConfig]
  );

  // Fonction pour désactiver temporairement le mode suivi sans interaction utilisateur
  const disableFollowModeTemporarily = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      lastFollowPosition.current = null;
      return true; // Retourner true si le mode était actif
    }
    return false; // Retourner false si le mode n'était pas actif
  };

  // Fonction pour réactiver le mode suivi
  const reactivateFollowMode = () => {
    setIsFollowingUser(true);
    lastFollowPosition.current = null; // Réinitialiser pour permettre le suivi immédiat
  };

  // Fonction appelée quand l'utilisateur bouge manuellement la carte
  const handleMapPanDrag = () => {
    lastMapInteraction.current = Date.now();

    if (isNavigating) {
      // En mode navigation, afficher le prompt de recentrage et désactiver le suivi
      setShowRecenterPrompt(true);
      setIsFollowingUser(false);

      // Démarrer le timer de recentrage automatique (5 secondes)
      if (recenterTimeout.current) {
        clearTimeout(recenterTimeout.current);
      }

      recenterTimeout.current = setTimeout(() => {
        // Si l'utilisateur n'a pas interagi avec la carte pendant 5 secondes
        if (Date.now() - lastMapInteraction.current >= 5000) {
          setIsFollowingUser(true);
          setShowRecenterPrompt(false);
          // If we have a last known follow position, animate back to it quickly
          const lastPos = lastFollowPosition.current;
          if (lastPos) {
            // Quick animation to recenter
            try {
              animateToLocationLocked(lastPos.latitude, lastPos.longitude, 17, 300);
            } catch (err) {
              // ignore animation errors
            }
          }
        }
      }, 5000);
    } else {
      // Comportement normal hors navigation
      if (isFollowingUser) {
        setIsFollowingUser(false);
        lastFollowPosition.current = null; // Réinitialiser la position de référence
      }
    }
  };

  // Fonction pour recentrer manuellement
  const manualRecenter = () => {
    setIsFollowingUser(true);
    setShowRecenterPrompt(false);

    // Cancel any pending auto-recenter
    if (recenterTimeout.current) {
      clearTimeout(recenterTimeout.current);
      recenterTimeout.current = null;
    }

    // Animate immediately to the last known follow position if available
    const lastPos = lastFollowPosition.current;
    if (lastPos) {
      try {
        animateToLocationLocked(lastPos.latitude, lastPos.longitude, 17, 300);
      } catch (err) {
        // ignore
      }
    }
  };

  const animateToCoordinate = (
    coordinate: {
      latitude: number;
      longitude: number;
    },
    zoomLevel: number = 15,
    pitch?: number
  ) => {
    // Use the locked variant to ensure the camera change is honored even when
    // drawers or animation locks are active. This keeps behaviour consistent
    // when callers expect the map to move after a user action.
    animateToLocationLocked(
      coordinate.latitude,
      coordinate.longitude,
      zoomLevel,
      500,
      pitch
    );
  };

  // Version verrouillée pour les animations critiques (parking, etc.)
  const animateToCoordinateLocked = (
    coordinate: {
      latitude: number;
      longitude: number;
    },
    zoomLevel: number = 15,
    pitch?: number,
    duration: number = 1000
  ) => {
    // Déléguer à animateToLocationLocked (gère le verrouillage interne)
    animateToLocationLocked(
      coordinate.latitude,
      coordinate.longitude,
      zoomLevel,
      duration,
      pitch
    );
  };

  // Nouvelle fonction pour ajuster la vue à un trajet complet
  const fitToRoute = (
    startCoordinate: { latitude: number; longitude: number },
    endCoordinate: { latitude: number; longitude: number },
    routeCoords: { latitude: number; longitude: number }[] = [],
    drawerVisible: boolean = false
  ) => {
    const coordinates: [number, number][] = [
      [startCoordinate.longitude, startCoordinate.latitude],
      [endCoordinate.longitude, endCoordinate.latitude],
      ...routeCoords.map(
        (coord) => [coord.longitude, coord.latitude] as [number, number]
      ),
    ];

    // Utiliser le padding actuel ou celui spécifié pour le drawer
    let viewportPadding = currentViewportPadding;
    if (drawerVisible) {
      viewportPadding = { ...currentViewportPadding, bottom: 400 }; // 300px pour la hauteur approximative du RouteDrawer
    }

    // Compute bounds and choose zoom similar to MapViewContext.fitToCoordinates,
    // but apply the camera change as forced with this controller id so it is
    // honored even when other controllers have claimed the camera.
    if (!coordinates || coordinates.length === 0) return;

    // Calculate bounds
    let minLat = coordinates[0][1];
    let maxLat = coordinates[0][1];
    let minLon = coordinates[0][0];
    let maxLon = coordinates[0][0];
    coordinates.forEach(([lon, lat]) => {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    });

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const latDiff = maxLat - minLat;
    const lonDiff = maxLon - minLon;
    const verticalPaddingFactor = 1 + (viewportPadding.bottom || 0) / 400;
    const horizontalPaddingFactor = 1 + (viewportPadding.left || 0) / 400;

    const adjustedLatDiff = latDiff * verticalPaddingFactor;
    const adjustedLonDiff = lonDiff * horizontalPaddingFactor;
    const maxDiff = Math.max(adjustedLatDiff, adjustedLonDiff);

    let zoom = 10;
    if (maxDiff < 0.001) zoom = 16;
    else if (maxDiff < 0.005) zoom = 14;
    else if (maxDiff < 0.01) zoom = 13;
    else if (maxDiff < 0.05) zoom = 11;
    else if (maxDiff < 0.1) zoom = 10;
    else if (maxDiff < 0.5) zoom = 8;
    else if (maxDiff < 1) zoom = 7;
    else zoom = 6;

  // Apply a small zoom boost so the fitted route appears a bit closer
  const ZOOM_BOOST = 1.2;
  zoom = Math.min(20, zoom + ZOOM_BOOST);

    // Apply camera change forced by this controller so it's not blocked
    setCameraConfig(
      {
        centerCoordinate: [centerLon, centerLat],
        zoomLevel: zoom,
        animationDuration: 1500,
      },
      true,
      CONTROLLER_ID
    );
  };

  // Fonction pour définir le padding du drawer
  const setDrawerPadding = useCallback(
    (drawerHeight: number) => {
      setViewportPadding({ bottom: drawerHeight });
    },
    [setViewportPadding]
  );
  const drawerPadding = currentViewportPadding.bottom || 0;

  // Fonction pour effacer le padding du drawer
  const clearDrawerPadding = useCallback(() => {
     setViewportPadding({});
   }, [setViewportPadding]);

  const toggleCompassMode = () => {
    const newMode = compassMode === "north" ? "heading" : "north";
    setCompassMode(newMode);

    if (newMode === "north") {
      // Pointer vers le nord (heading = 0)
      setCameraConfig({ heading: 0 }, false, CONTROLLER_ID);
    }
     // En mode heading, on laisse updateMapHeading gérer la rotation
   };

  // Optimisation avec throttling et seuil de différence
  const updateMapHeading = useCallback(
    (heading: number) => {
      // Si on n'est pas en navigation et qu'on n'est pas en mode 'heading', ne rien faire
      if (!isNavigating && compassMode !== "heading") return;

      const now = Date.now();
      const timeDiff = now - lastUpdateTime.current;

      // Throttling réduit pour un suivi plus réactif en navigation
      const throttleDelay =
        isNavigating && navigationMode === "driving" ? 50 : 100; // Plus réactif
      if (timeDiff < throttleDelay) return;

      // Seuil de différence réduit pour un suivi plus précis
      const threshold = isNavigating && navigationMode === "driving" ? 1 : 2; // Plus sensible
      const headingDiff = Math.abs(heading - lastHeading.current);
      if (headingDiff < threshold && headingDiff > 0) return;

      // Gestion du passage 360°/0°
      let normalizedHeading = heading;
      if (headingDiff > 180) {
        if (heading > lastHeading.current) {
          normalizedHeading = heading - 360;
        } else {
          normalizedHeading = heading + 360;
        }
      }

      lastUpdateTime.current = now;
      lastHeading.current = heading;

      // Durée d'animation plus courte pour une réactivité maximale en navigation
      const animationDuration =
        isNavigating && navigationMode === "driving" ? 300 : 500;

      // Mettre à jour l'orientation via le contexte avec animation plus fluide
      // En navigation, forcer la mise à jour de la caméra même si un autre contrôleur est actif
      const forced = isNavigating;
      setCameraConfig(
        {
          heading: normalizedHeading,
          animationDuration: animationDuration,
        },
        forced,
        CONTROLLER_ID
      );
    },
    [compassMode, setCameraConfig, isNavigating, navigationMode]
  );

  return {
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
    // Fonctions pour la navigation
    isNavigating,
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
  };
}
