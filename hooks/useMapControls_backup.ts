import { useRef, useState, useCallback } from "react";
import { MapView } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { NominatimService } from "../services/NominatimService";
import { useMapView } from "../contexts/MapViewContext";

export function useMapControls() {
  const { animateToLocation, setCameraConfig, fitToCoordinates, setViewportPadding, currentViewportPadding } = useMapView();
  const [compassMode, setCompassMode] = useState<"north" | "heading">("north");
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationMode, setNavigationMode] = useState<"driving" | "walking">("driving");
  const lastUpdateTime = useRef(0);
  const lastHeading = useRef(0);
  const lastFollowPosition = useRef<{latitude: number, longitude: number} | null>(null);
  const lastIntersectionDistance = useRef<number>(1000); // Distance à la dernière intersection connue

  // Fonction utilitaire pour calculer la distance entre deux points (en mètres)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  // Fonction pour ajuster la caméra en mode navigation piétonne
  const adjustNavigationCamera = useCallback((
    userLocation: Location.LocationObjectCoords,
    nextStepLocation?: { latitude: number; longitude: number },
    distanceToNextStep?: number
  ) => {
    if (!isNavigating || navigationMode !== "walking") return;

    let pitch = 60; // Inclinaison par défaut pour voir plus de route
    let zoom = 18; // Zoom par défaut pour la marche

    // Si on approche d'une intersection (moins de 50m)
    if (distanceToNextStep && distanceToNextStep < 50) {
      pitch = 0; // Remettre la caméra droite
      zoom = Math.max(19, 22 - (distanceToNextStep / 10)); // Zoomer au fur et à mesure qu'on approche
      console.log(`🚶 Approaching intersection: ${distanceToNextStep}m, adjusting camera - pitch: ${pitch}, zoom: ${zoom}`);
    }

    // Mettre à jour la caméra avec les nouveaux paramètres
    setCameraConfig({
      centerCoordinate: [userLocation.longitude, userLocation.latitude],
      pitch: pitch,
      zoomLevel: zoom,
      animationDuration: 800
    });

    lastIntersectionDistance.current = distanceToNextStep || 1000;
  }, [isNavigating, navigationMode, setCameraConfig]);

  // Fonction pour démarrer la navigation piétonne
  const startWalkingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("walking");
    console.log('🚶 Started walking navigation mode');
  }, []);

  // Fonction pour arrêter la navigation
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    // Remettre la caméra en vue normale
    setCameraConfig({
      pitch: 0,
      zoomLevel: 16,
      animationDuration: 1000
    });
    console.log('🛑 Stopped navigation, camera reset');
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
          
          console.log('✅ Follow mode activated, centering on user:', location);
        } else {
          lastFollowPosition.current = null; // Réinitialiser quand on désactive aussi
          console.log('🚫 Follow mode deactivated');
        }
        
      } catch (error) {
        console.error('❌ Error toggling follow mode:', error);
      }
    }
  };

  // Nouvelle fonction pour suivre automatiquement la position utilisateur
  const followUserLocation = useCallback((location: Location.LocationObjectCoords) => {
    if (isFollowingUser) {
      const now = Date.now();
      const timeDiff = now - lastUpdateTime.current;
      
      // Vérifier si la position a suffisamment changé (seuil de 5 mètres environ)
      const lastPos = lastFollowPosition.current;
      if (lastPos) {
        const distanceThreshold = 0.00005; // ~5 mètres en degrés
        const latDiff = Math.abs(location.latitude - lastPos.latitude);
        const lonDiff = Math.abs(location.longitude - lastPos.longitude);
        
        // Si le déplacement est trop petit ET que le dernier update était récent, ignorer
        if (latDiff < distanceThreshold && lonDiff < distanceThreshold && timeDiff < 2000) {
          return;
        }
      }
      
      // Throttling : maximum une mise à jour toutes les 500ms pour éviter la boucle
      if (timeDiff < 500) return;
      
      lastUpdateTime.current = now;
      lastFollowPosition.current = { latitude: location.latitude, longitude: location.longitude };
      
      // Mettre à jour la caméra pour suivre l'utilisateur avec animation
      setCameraConfig({
        centerCoordinate: [location.longitude, location.latitude],
        animationDuration: 1000
      });
      console.log('🎯 Following user location:', location);
    }
  }, [isFollowingUser]);

  // Fonction pour désactiver temporairement le mode suivi sans interaction utilisateur
  const disableFollowModeTemporarily = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      lastFollowPosition.current = null;
      console.log('🚫 Follow mode temporarily disabled for route calculation');
      return true; // Retourner true si le mode était actif
    }
    return false; // Retourner false si le mode n'était pas actif
  };

  // Fonction pour réactiver le mode suivi
  const reactivateFollowMode = () => {
    setIsFollowingUser(true);
    lastFollowPosition.current = null; // Réinitialiser pour permettre le suivi immédiat
    console.log('✅ Follow mode reactivated');
  };

  // Fonction appelée quand l'utilisateur bouge manuellement la carte
  const handleMapPanDrag = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      lastFollowPosition.current = null; // Réinitialiser la position de référence
      console.log('🚫 User panned map, disabling follow mode');
    }
  };

  const animateToCoordinate = (coordinate: {
    latitude: number;
    longitude: number;
  }, zoomLevel: number = 15) => {
    animateToLocation(coordinate.latitude, coordinate.longitude, zoomLevel);
    console.log('Animating to coordinate:', coordinate, 'zoom:', zoomLevel);
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
      ...routeCoords.map(coord => [coord.longitude, coord.latitude] as [number, number])
    ];
    
    // Utiliser le padding actuel ou celui spécifié pour le drawer
    let viewportPadding = currentViewportPadding;
    if (drawerVisible) {
      viewportPadding = { ...currentViewportPadding, bottom: 300 }; // 300px pour la hauteur approximative du RouteDrawer
    }
    
    fitToCoordinates(coordinates, 80, 1500, viewportPadding); // Plus de padding et animation plus lente pour les routes
    console.log('Fitting map to route with', coordinates.length, 'coordinates', drawerVisible ? 'with drawer padding' : '');
  };

  // Fonction pour définir le padding du drawer
  const setDrawerPadding = useCallback((drawerHeight: number) => {
    setViewportPadding({ bottom: drawerHeight });
  }, [setViewportPadding]);

  // Fonction pour effacer le padding du drawer  
  const clearDrawerPadding = useCallback(() => {
    setViewportPadding({});
  }, [setViewportPadding]);

  const toggleCompassMode = () => {
    const newMode = compassMode === "north" ? "heading" : "north";
    setCompassMode(newMode);

    if (newMode === "north") {
      // Pointer vers le nord (heading = 0)
      setCameraConfig({ heading: 0 });
      console.log('Setting compass mode to north');
    }
    // En mode heading, on laisse updateMapHeading gérer la rotation
  };

  // Optimisation avec throttling et seuil de différence
  const updateMapHeading = useCallback(
    (heading: number) => {
      if (compassMode !== "heading") return;

      const now = Date.now();
      const timeDiff = now - lastUpdateTime.current;

      // Throttling : maximum une mise à jour toutes les 200ms
      if (timeDiff < 200) return;

      // Seuil de différence : ne pas animer pour des changements < 3 degrés
      const headingDiff = Math.abs(heading - lastHeading.current);
      if (headingDiff < 3 && headingDiff > 0) return;

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

      // Mettre à jour l'orientation via le contexte
      setCameraConfig({ heading: normalizedHeading });
      console.log('Updating map heading to:', normalizedHeading);
    },
    [compassMode, setCameraConfig]
  );

  return {
    recenterMap,
    animateToCoordinate,
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
    clearDrawerPadding,
    // Nouvelles fonctions pour la navigation piétonne
    isNavigating,
    navigationMode,
    startWalkingNavigation,
    stopNavigation,
    adjustNavigationCamera,
    calculateDistance,
  };
}
