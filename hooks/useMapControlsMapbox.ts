import { useRef, useState, useCallback } from "react";
import { MapView } from "@rnmapbox/maps";
import * as Location from "expo-location";

export function useMapControls() {
  const mapRef = useRef<MapView>(null);
  const [compassMode, setCompassMode] = useState<"north" | "heading">("north");
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const lastUpdateTime = useRef(0);
  const lastHeading = useRef(0);

  const recenterMap = async (location: Location.LocationObjectCoords) => {
    if (location && mapRef.current) {
      setIsFollowingUser(true);
      const heading = compassMode === "heading" ? lastHeading.current : 0;
      (mapRef.current as any)?.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 16,
        heading,
        animationDuration: 600,
      });
    }
  };

  const animateToCoordinate = useCallback((coordinate: { latitude: number; longitude: number }) => {
    if (mapRef.current) {
      (mapRef.current as any)?.setCamera({
        centerCoordinate: [coordinate.longitude, coordinate.latitude],
        animationDuration: 600,
      });
    }
  }, []);

  const toggleCompassMode = () => {
    setCompassMode(prev => {
      const newMode = prev === "north" ? "heading" : "north";
      const heading = newMode === "heading" ? lastHeading.current : 0;
      (mapRef.current as any)?.setCamera({ heading, animationDuration: 0 });
      return newMode;
    });
  };

  const updateMapHeading = useCallback((heading: number) => {
    if (mapRef.current && compassMode === "heading") {
      const now = Date.now();
      if (now - lastUpdateTime.current > 500) {
        lastUpdateTime.current = now;
        lastHeading.current = heading;
        (mapRef.current as any)?.setCamera({ heading, animationDuration: 200 });
      }
    }
  }, [compassMode]);

  const followUserLocation = useCallback((location: Location.LocationObjectCoords) => {
    if (mapRef.current && isFollowingUser) {
      (mapRef.current as any)?.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        animationDuration: 500,
      });
    }
  }, [isFollowingUser]);

  const handleMapPanDrag = () => {
    setIsFollowingUser(false);
  };

  return {
    mapRef,
    recenterMap,
    animateToCoordinate,
    compassMode,
    toggleCompassMode,
    updateMapHeading,
    isFollowingUser,
    followUserLocation,
    handleMapPanDrag,
  };
}
