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
      // Activer le mode suivi automatique
      setIsFollowingUser(true);
      
      // TODO: Implémenter le centrage de caméra pour Mapbox}
  };

  const animateToCoordinate = useCallback((coordinate: { latitude: number; longitude: number }) => {
    if (mapRef.current) {
      // TODO: Implémenter l'animation vers une coordonnée}
  }, []);

  const toggleCompassMode = () => {
    setCompassMode(prev => {
      const newMode = prev === "north" ? "heading" : "north";
      
      // TODO: Implémenter la rotation de cartereturn newMode;
    });
  };

  const updateMapHeading = useCallback((heading: number) => {
    if (mapRef.current && compassMode === "heading") {
      const now = Date.now();
      if (now - lastUpdateTime.current > 500) { // Throttle à 500ms
        lastUpdateTime.current = now;
        lastHeading.current = heading;
        
        // TODO: Implémenter la rotation de la carte selon le heading}
    }
  }, [compassMode]);

  const followUserLocation = useCallback((location: Location.LocationObjectCoords) => {
    if (mapRef.current && isFollowingUser) {
      // TODO: Implémenter le suivi de position}
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
