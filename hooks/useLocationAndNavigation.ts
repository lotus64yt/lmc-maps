import { useEffect } from "react";
import { useLocationService } from "../services/LocationService";
import { useRouteService, Coordinate } from "../services/RouteService";

export function useLocationAndNavigation() {
  // Utiliser le service de localisation
  const locationService = useLocationService();
  
  // Utiliser le service de routes
  const routeService = useRouteService();

  // Démarrer automatiquement le suivi de localisation
  useEffect(() => {
    locationService.startLocationTracking();
    
    // Nettoyage lors du démontage
    return () => {
      locationService.stopLocationTracking();
    };
  }, []);

  // Fonction pour gérer les long press sur la carte
  const handleLongPress = async (coordinate: Coordinate) => {
    if (locationService.location) {
      const start: Coordinate = {
        latitude: locationService.location.latitude,
        longitude: locationService.location.longitude
      };
      
      // Utiliser la route hybride pour tous les modes
      await routeService.getHybridRoute(start, coordinate, 'driving');
    }
  };

  // Fonction wrapper pour getHybridRoute qui utilise la position actuelle
  const getHybridRouteFromCurrentLocation = async (
    destination: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (!locationService.location) {
      console.warn("Position actuelle non disponible");
      return false;
    }

    const start: Coordinate = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    return await routeService.getHybridRoute(start, destination, mode);
  };

  // Fonction wrapper pour getRoute qui utilise la position actuelle
  const getRouteFromCurrentLocation = async (
    destination: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (!locationService.location) {
      console.warn("Position actuelle non disponible");
      return false;
    }

    const start: Coordinate = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    return await routeService.getRoute(start, destination, mode);
  };

  // Fonction de compatibilité pour l'ancienne signature
  const getRouteLegacy = async (
    start: [number, number], 
    end: [number, number], 
    mode: string = 'driving'
  ): Promise<void> => {
    const startCoord: Coordinate = {
      latitude: start[1],
      longitude: start[0]
    };
    const endCoord: Coordinate = {
      latitude: end[1],
      longitude: end[0]
    };
    
    await routeService.getRoute(startCoord, endCoord, mode);
  };

  return {
    // Services de localisation
    location: locationService.location,
    heading: locationService.heading,
    headingAnim: locationService.headingAnim,
    currentHeading: locationService.currentHeading,
    
    // Services de routes
    routeCoords: routeService.routeCoords,
    destination: routeService.destination,
    routeInfo: routeService.routeInfo,
    isCalculatingRoute: routeService.isCalculating,
    
    // Nouvelles propriétés pour le tracé hybride
    directLineCoords: routeService.directLineCoords,
    nearestRoadPoint: routeService.nearestRoadPoint,
    hasDirectLineSegment: routeService.hasDirectLineSegment,
    
    // Méthodes
    handleLongPress,
    setDestination: routeService.setDestination,
    getRoute: getRouteLegacy, // Pour la compatibilité avec l'ancienne signature
    getRouteNew: routeService.getRoute, // Nouvelle signature
    getHybridRoute: routeService.getHybridRoute, // Nouvelle fonction hybride
    getMultiStepRoute: routeService.getMultiStepRoute,
    getRouteFromCurrentLocation,
    getHybridRouteFromCurrentLocation, // Nouvelle fonction wrapper
    clearRoute: routeService.clearRoute,
    clearRouteKeepDestination: routeService.clearRouteKeepDestination,
    
    // Nouvelles méthodes de surveillance de route
    isOnRoute: routeService.isOnRoute,
    recalculateIfOffRoute: routeService.recalculateIfOffRoute,
    
    // Service de route pour passer à NavigationService
    routeService,
    
    // Méthodes de localisation
    startLocationTracking: locationService.startLocationTracking,
    stopLocationTracking: locationService.stopLocationTracking,
    requestLocationPermission: locationService.requestLocationPermission,
  };
}
