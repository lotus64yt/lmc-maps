import { useRef, useState, useCallback } from "react";
import { MapView } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { NominatimService } from "../services/NominatimService";
import { useMapView } from "../contexts/MapViewContext";

export function useMapControls() {
  const {
    animateToLocation,
    setCameraConfig,
    fitToCoordinates,
    setViewportPadding,
    currentViewportPadding,
  } = useMapView();
  const [compassMode, setCompassMode] = useState<"north" | "heading">("north");
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationMode, setNavigationMode] = useState<"driving" | "walking">(
    "driving"
  );
  const lastUpdateTime = useRef(0);
  const lastHeading = useRef(0);
  const lastFollowPosition = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastIntersectionDistance = useRef<number>(1000);

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371e3;
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

  const adjustNavigationCamera = useCallback(
    (
      userLocation: Location.LocationObjectCoords,
      nextStepLocation?: { latitude: number; longitude: number },
      distanceToNextStep?: number
    ) => {
      if (!isNavigating || navigationMode !== "walking") return;

      let pitch = 60;
      let zoom = 18;

      if (distanceToNextStep && distanceToNextStep < 50) {
        pitch = 0;
        zoom = Math.max(19, 22 - distanceToNextStep / 10);

        setCameraConfig({
          centerCoordinate: [userLocation.longitude, userLocation.latitude],
          pitch: pitch,
          zoomLevel: zoom,
          animationDuration: 800,
        });

        lastIntersectionDistance.current = distanceToNextStep || 1000;
      }
    },
    [isNavigating, navigationMode, setCameraConfig]
  );

  const startWalkingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("walking");
  }, []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setCameraConfig({
      pitch: 0,
      zoomLevel: 16,
      animationDuration: 1000,
    });
  }, [setCameraConfig]);

  const recenterMap = async (location: Location.LocationObjectCoords) => {
    if (location) {
      try {
        const newFollowMode = !isFollowingUser;
        setIsFollowingUser(newFollowMode);

        if (newFollowMode) {
          const zoom = await NominatimService.getZoomForLocation(
            location.latitude,
            location.longitude
          );

          animateToLocation(location.latitude, location.longitude, zoom);
          lastFollowPosition.current = null;
        }
      } catch (error) {}
    }
  };

  const followUserLocation = useCallback(
    (location: Location.LocationObjectCoords) => {
      if (isFollowingUser) {
        const now = Date.now();
        const timeDiff = now - lastUpdateTime.current;

        const lastPos = lastFollowPosition.current;
        if (lastPos) {
          const distanceThreshold = 0.00005;
          const latDiff = Math.abs(location.latitude - lastPos.latitude);
          const lonDiff = Math.abs(location.longitude - lastPos.longitude);

          if (
            latDiff < distanceThreshold &&
            lonDiff < distanceThreshold &&
            timeDiff < 2000
          ) {
            return;
          }
        }

        if (timeDiff < 500) return;

        lastUpdateTime.current = now;
        lastFollowPosition.current = {
          latitude: location.latitude,
          longitude: location.longitude,
        };

        setCameraConfig({
          centerCoordinate: [location.longitude, location.latitude],
          animationDuration: 1000,
        });
      }
    },
    [isFollowingUser]
  );

  const disableFollowModeTemporarily = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      lastFollowPosition.current = null;
      return true;
    }
    return false;
  };

  const reactivateFollowMode = () => {
    setIsFollowingUser(true);
    lastFollowPosition.current = null;
  };

  const handleMapPanDrag = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      lastFollowPosition.current = null;
    }
  };

  const animateToCoordinate = (
    coordinate: {
      latitude: number;
      longitude: number;
    },
    zoomLevel: number = 15
  ) => {
    animateToLocation(coordinate.latitude, coordinate.longitude, zoomLevel);
  };

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

    let viewportPadding = currentViewportPadding;
    if (drawerVisible) {
      viewportPadding = { ...currentViewportPadding, bottom: 300 };
    }

    fitToCoordinates(coordinates, 80, 1500, viewportPadding);

    const setDrawerPadding = useCallback(
      (drawerHeight: number) => {
        setViewportPadding({ bottom: drawerHeight });
      },
      [setViewportPadding]
    );

    const clearDrawerPadding = useCallback(() => {
      setViewportPadding({});
    }, [setViewportPadding]);

    const toggleCompassMode = () => {
      const newMode = compassMode === "north" ? "heading" : "north";
      setCompassMode(newMode);

      if (newMode === "north") {
        setCameraConfig({ heading: 0 });
      }
    };

    const updateMapHeading = useCallback(
      (heading: number) => {
        if (compassMode !== "heading") return;

        const now = Date.now();
        const timeDiff = now - lastUpdateTime.current;

        if (timeDiff < 200) return;

        const headingDiff = Math.abs(heading - lastHeading.current);
        if (headingDiff < 3 && headingDiff > 0) return;

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

        setCameraConfig({ heading: normalizedHeading });
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
      isNavigating,
      navigationMode,
      startWalkingNavigation,
      stopNavigation,
      adjustNavigationCamera,
      calculateDistance,
    };
  };
}
