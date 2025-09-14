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
  const lastIntersectionDistance = useRef<number>(1000);
  const recenterTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastMapInteraction = useRef<number>(0);

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
      distanceToNextStep?: number,
      headingOverride?: number
    ) => {
      if (!isNavigating) return;

      let pitch = 0;
      let zoom = 16;
  let animationDuration = navigationMode === "driving" ? 250 : 400;

      let cameraConfig: any = {
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        pitch: pitch,
        zoomLevel: zoom,
        animationDuration: animationDuration,
      };

      if (navigationMode === "driving") {
        pitch = 45;

        if (distanceToNextStep) {
          if (distanceToNextStep > 1000) {
            zoom = 14;
            pitch = 35;
          } else if (distanceToNextStep > 500) {
            zoom = 15;
            pitch = 40;
          } else if (distanceToNextStep > 200) {
            zoom = 16;
            pitch = 45;
          } else if (distanceToNextStep > 50) {
            zoom = 17;
            pitch = 50;
          } else {
            zoom = 18;
            pitch = 30;
          }
        } else {
          zoom = 16;
          pitch = 45;
        }
      } else if (navigationMode === "walking") {
        pitch = 60;
        zoom = 18;

        if (distanceToNextStep && distanceToNextStep < 50) {
          pitch = 0;
          zoom = Math.max(19, 22 - distanceToNextStep / 10);
        }
      }

      cameraConfig.pitch = pitch;
      cameraConfig.zoomLevel = zoom;

      if (typeof headingOverride === "number" && !isNaN(headingOverride)) {
        const normalize = (a: number) => ((a % 360) + 360) % 360;
        cameraConfig.heading = normalize(headingOverride);
      } else {
        if (compassMode === "north") {
          cameraConfig.heading = 0;
        }
      }

  setCameraConfig(cameraConfig, true, CONTROLLER_ID);

      lastIntersectionDistance.current = distanceToNextStep || 1000;
    },
    [isNavigating, navigationMode, compassMode, setCameraConfig]
  );

  const startWalkingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("walking");
  }, []);

  const startDrivingNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationMode("driving");
  }, []);

  const startNavigationForMode = useCallback((mode: "driving" | "walking") => {
    setIsNavigating(true);
    setNavigationMode(mode);
    setIsFollowingUser(true);
    setShowRecenterPrompt(false);
  }, []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setShowRecenterPrompt(false);

    if (recenterTimeout.current) {
      clearTimeout(recenterTimeout.current);
      recenterTimeout.current = null;
    }

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
        const newFollowMode = !isFollowingUser;
        setIsFollowingUser(newFollowMode);

        if (newFollowMode) {
          const zoom = await NominatimService.getZoomForLocation(
            location.latitude,
            location.longitude
          );

          animateToLocation(location.latitude, location.longitude, zoom);
          lastFollowPosition.current = null;
        } else {
          lastFollowPosition.current = null;
        }
      } catch (error) {
      }
    }
  };

  const followUserLocation = useCallback(
    (location: Location.LocationObjectCoords) => {
      if (isFollowingUser) {
        const now = Date.now();
        const timeDiff = now - lastUpdateTime.current;

        const lastPos = lastFollowPosition.current;
        if (lastPos) {
          const distanceThreshold =
            isNavigating && navigationMode === "driving"
              ? 0.00002
              : 0.00005;

          const latDiff = Math.abs(location.latitude - lastPos.latitude);
          const lonDiff = Math.abs(location.longitude - lastPos.longitude);

          const minUpdateInterval =
            isNavigating && navigationMode === "driving" ? 200 : 500;

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

        const animationDuration =
          isNavigating && navigationMode === "driving" ? 400 : 800;

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
    lastMapInteraction.current = Date.now();

    if (isNavigating) {
      setShowRecenterPrompt(true);
      setIsFollowingUser(false);

      if (recenterTimeout.current) {
        clearTimeout(recenterTimeout.current);
      }

      recenterTimeout.current = setTimeout(() => {
        if (Date.now() - lastMapInteraction.current >= 5000) {
          setIsFollowingUser(true);
          setShowRecenterPrompt(false);
          const lastPos = lastFollowPosition.current;
          if (lastPos) {
            try {
              animateToLocationLocked(lastPos.latitude, lastPos.longitude, 17, 300);
            } catch (err) {
            }
          }
        }
      }, 5000);
    } else {
      if (isFollowingUser) {
        setIsFollowingUser(false);
        lastFollowPosition.current = null;
      }
    }
  };

  const manualRecenter = () => {
    setIsFollowingUser(true);
    setShowRecenterPrompt(false);

    if (recenterTimeout.current) {
      clearTimeout(recenterTimeout.current);
      recenterTimeout.current = null;
    }

    const lastPos = lastFollowPosition.current;
    if (lastPos) {
      try {
        animateToLocationLocked(lastPos.latitude, lastPos.longitude, 17, 300);
      } catch (err) {
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
    animateToLocationLocked(
      coordinate.latitude,
      coordinate.longitude,
      zoomLevel,
      500,
      pitch
    );
  };

  const animateToCoordinateLocked = (
    coordinate: {
      latitude: number;
      longitude: number;
    },
    zoomLevel: number = 15,
    pitch?: number,
    duration: number = 1000
  ) => {
    animateToLocationLocked(
      coordinate.latitude,
      coordinate.longitude,
      zoomLevel,
      duration,
      pitch
    );
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
      viewportPadding = { ...currentViewportPadding, bottom: 400 };
    }

    if (!coordinates || coordinates.length === 0) return;

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

  const ZOOM_BOOST = 1.2;
  zoom = Math.min(20, zoom + ZOOM_BOOST);

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

  const setDrawerPadding = useCallback(
    (drawerHeight: number) => {
      setViewportPadding({ bottom: drawerHeight });
    },
    [setViewportPadding]
  );
  const drawerPadding = currentViewportPadding.bottom || 0;

  const clearDrawerPadding = useCallback(() => {
     setViewportPadding({});
   }, [setViewportPadding]);

  const toggleCompassMode = () => {
    const newMode = compassMode === "north" ? "heading" : "north";
    setCompassMode(newMode);

    if (newMode === "north") {
      setCameraConfig({ heading: 0 }, false, CONTROLLER_ID);
    }
   };

  const updateMapHeading = useCallback(
    (heading: number) => {
      if (!isNavigating && compassMode !== "heading") return;

      const now = Date.now();
      const timeDiff = now - lastUpdateTime.current;

      const throttleDelay =
        isNavigating && navigationMode === "driving" ? 50 : 100;
      if (timeDiff < throttleDelay) return;

      const threshold = isNavigating && navigationMode === "driving" ? 1 : 2;
      const headingDiff = Math.abs(heading - lastHeading.current);
      if (headingDiff < threshold && headingDiff > 0) return;

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

      const animationDuration =
        isNavigating && navigationMode === "driving" ? 300 : 500;

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
    isNavigating,
    navigationMode,
    startWalkingNavigation,
    startDrivingNavigation,
    startNavigationForMode,
    stopNavigation,
    adjustNavigationCamera,
    calculateDistance,
    showRecenterPrompt,
    manualRecenter,
  };
}

