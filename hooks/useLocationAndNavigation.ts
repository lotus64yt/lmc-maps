import { useEffect, useState, useRef } from "react";
import { useLocationService } from "../services/LocationService";
import { useRouteService, Coordinate } from "../services/RouteService";
import { RouteDirectionService, RouteDirectionCalculation } from "../services/RouteDirectionService";

export function useLocationAndNavigation() {
  // Utiliser le service de localisation
  const locationService = useLocationService();
  
  // Utiliser le service de routes
  const routeService = useRouteService();

  // États pour la direction de la route
  const [routeDirection, setRouteDirection] = useState<RouteDirectionCalculation>({
    bearing: 0,
    isOnRoute: false
  });
  
  // Référence pour la position précédente (pour éviter les calculs trop fréquents)
  const previousLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Démarrer automatiquement le suivi de localisation
  useEffect(() => {
    locationService.startLocationTracking();
    
    // Nettoyage lors du démontage
    return () => {
      locationService.stopLocationTracking();
    };
  }, []);

  // Calculer la direction de la route quand la position ou la route change
  useEffect(() => {
    if (locationService.location && routeService.routeCoords.length > 0) {
      const currentLocation = {
        latitude: locationService.location.latitude,
        longitude: locationService.location.longitude
      };

      // Éviter les calculs trop fréquents en vérifiant si la position a suffisamment changé
      if (previousLocationRef.current) {
        const distance = RouteDirectionService.calculateDistance(
          previousLocationRef.current,
          currentLocation
        );
        
        // Ne recalculer que si l'utilisateur a bougé d'au moins 5 mètres
        if (distance < 5) {
          return;
        }
      }

      // Calculer la nouvelle direction de la route avec lissage
      const newRouteDirection = RouteDirectionService.calculateSmoothedRouteDirection(
        currentLocation,
        routeService.routeCoords,
        30 // Distance de lissage en mètres
      );

      setRouteDirection(newRouteDirection);
      previousLocationRef.current = currentLocation;
    } else if (routeService.routeCoords.length === 0) {
      // Pas de route active, réinitialiser la direction
      setRouteDirection({
        bearing: 0,
        isOnRoute: false
      });
      previousLocationRef.current = null;
    }
  }, [locationService.location, routeService.routeCoords]);

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
  error: locationService.error,
    
    // Services de routes
    routeCoords: routeService.routeCoords,
    destination: routeService.destination,
    routeInfo: routeService.routeInfo,
    isCalculatingRoute: routeService.isCalculating,
    
    // Nouvelles propriétés pour le tracé hybride
    directLineCoords: routeService.directLineCoords,
    nearestRoadPoint: routeService.nearestRoadPoint,
    hasDirectLineSegment: routeService.hasDirectLineSegment,
    
    // Nouvelle propriété pour la direction de la route
    routeDirection: routeDirection,
    
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
