import { useEffect, useState, useRef } from "react";
import { useLocationService } from "../services/LocationService";
import { useRouteService, Coordinate } from "../services/RouteService";
import { RouteDirectionService, RouteDirectionCalculation } from "../services/RouteDirectionService";

export function useLocationAndNavigation() {
  const locationService = useLocationService();
  
  const routeService = useRouteService();

  const [routeDirection, setRouteDirection] = useState<RouteDirectionCalculation>({
    bearing: 0,
    isOnRoute: false
  });
  
  const previousLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    locationService.startLocationTracking();
    
    return () => {
      locationService.stopLocationTracking();
    };
  }, []);

  useEffect(() => {
    if (locationService.location && routeService.routeCoords.length > 0) {
      const currentLocation = {
        latitude: locationService.location.latitude,
        longitude: locationService.location.longitude
      };

      if (previousLocationRef.current) {
        const distance = RouteDirectionService.calculateDistance(
          previousLocationRef.current,
          currentLocation
        );
        
        if (distance < 5) {
          return;
        }
      }

      const newRouteDirection = RouteDirectionService.calculateSmoothedRouteDirection(
        currentLocation,
        routeService.routeCoords,
        30
      );

      setRouteDirection(newRouteDirection);
      previousLocationRef.current = currentLocation;
    } else if (routeService.routeCoords.length === 0) {
      setRouteDirection({
        bearing: 0,
        isOnRoute: false
      });
      previousLocationRef.current = null;
    }
  }, [locationService.location, routeService.routeCoords]);

  useEffect(() => {
    if (routeService.routeCoords.length > 0) {
    }
  }, [routeService.routeCoords]);

  const handleLongPress = async (coordinate: Coordinate) => {
    if (locationService.location) {
      const start: Coordinate = {
        latitude: locationService.location.latitude,
        longitude: locationService.location.longitude
      };
      
      await routeService.getHybridRoute(start, coordinate, 'driving');
    }
  };

  const getHybridRouteFromCurrentLocation = async (
    destination: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (!locationService.location) {
      return false;
    }

    const start: Coordinate = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    return await routeService.getHybridRoute(start, destination, mode);
  };

  const getRouteFromCurrentLocation = async (
    destination: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (!locationService.location) {
      return false;
    }

    const start: Coordinate = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    return await routeService.getRoute(start, destination, mode);
  };

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
  location: locationService.location,
  heading: locationService.heading,
  headingAnim: locationService.headingAnim,
  currentHeading: locationService.currentHeading,
  error: locationService.error,
    
    routeCoords: routeService.routeCoords,
    destination: routeService.destination,
    routeInfo: routeService.routeInfo,
    isCalculatingRoute: routeService.isCalculating,
    
    directLineCoords: routeService.directLineCoords,
    nearestRoadPoint: routeService.nearestRoadPoint,
    hasDirectLineSegment: routeService.hasDirectLineSegment,
    
    routeDirection: routeDirection,
    
    handleLongPress,
    setDestination: routeService.setDestination,
    getRoute: getRouteLegacy,
    getRouteNew: routeService.getRoute,
    getHybridRoute: routeService.getHybridRoute,
    getMultiStepRoute: routeService.getMultiStepRoute,
    getRouteFromCurrentLocation,
    getHybridRouteFromCurrentLocation,
    clearRoute: routeService.clearRoute,
    clearRouteKeepDestination: routeService.clearRouteKeepDestination,
    
    isOnRoute: routeService.isOnRoute,
    recalculateIfOffRoute: async (loc: { latitude: number; longitude: number }) => {
      const res = await routeService.recalculateIfOffRoute(loc);
      return !!res;
    },
    recalculateIfOffRouteStart: routeService.recalculateIfOffRoute,
    
    routeService,
    
    startLocationTracking: locationService.startLocationTracking,
    stopLocationTracking: locationService.stopLocationTracking,
    requestLocationPermission: locationService.requestLocationPermission,
  };
}

