import * as React from 'react';
import { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { MapView } from '@rnmapbox/maps';

export interface CameraConfig {
  centerCoordinate?: [number, number];
  zoomLevel?: number;
  pitch?: number;
  heading?: number;
  animationDuration?: number;
}

export interface ViewportPadding {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface MapViewContextType {
  mapRef: React.RefObject<MapView>;
  centerCoordinate: [number, number] | null;
  zoomLevel: number;
  pitch: number;
  heading: number;
  setCameraConfig: (config: CameraConfig, forced?: boolean, controllerId?: string) => void;
  animateToLocation: (latitude: number, longitude: number, zoom?: number, duration?: number, pitch?: number) => void;
  animateToLocationLocked: (latitude: number, longitude: number, zoom?: number, duration?: number, pitch?: number) => void;
  setDrawerCameraControl: (drawerId: string) => void;
  releaseDrawerCameraControl: (drawerId?: string) => void;
  setZoom: (zoom: number, duration?: number) => void;
  setPitch: (pitch: number, duration?: number) => void;
  setHeading: (heading: number, duration?: number) => void;
  resetCamera: (duration?: number) => void;
  fitToCoordinates: (coordinates: [number, number][], padding?: number, duration?: number, viewportPadding?: ViewportPadding) => void;
  setViewportPadding: (padding: ViewportPadding) => void;
  currentViewportPadding: ViewportPadding;
  notifyMapReady?: () => void;
}

const MapViewContext = createContext<MapViewContextType | undefined>(undefined);

interface MapViewProviderProps {
  children: ReactNode;
  initialCenter?: [number, number];
  initialZoom?: number;
  initialPitch?: number;
  initialHeading?: number;
}

export function MapViewProvider({ 
  children, 
  initialCenter = [2.3522, 48.8566],
  initialZoom = 13,
  initialPitch = 0,
  initialHeading = 0
}: MapViewProviderProps) {
  const mapRef = useRef<MapView>(null);
  
  const [centerCoordinate, setCenterCoordinate] = useState<[number, number] | null>(initialCenter);
  const [zoomLevel, setZoomLevel] = useState<number>(initialZoom);
  const [pitch, setPitchState] = useState<number>(initialPitch);
  const [heading, setHeadingState] = useState<number>(initialHeading);
  
  const [currentViewportPadding, setCurrentViewportPadding] = useState<ViewportPadding>({});

  const [isAnimationLocked, setIsAnimationLocked] = useState<boolean>(false);

  const [activeDrawerController, setActiveDrawerController] = useState<string | null>(null);

  const pendingCameraConfigs = React.useRef<
    Array<{ config: CameraConfig; forced?: boolean; controllerId?: string }>
  >([]);

  React.useEffect(() => {
    return () => {
      try {
        if (mapRef && mapRef.current) {
          mapRef.current = null;
        }
      } catch (e) {
      }
    };
  }, []);

  const setCameraConfig = (config: CameraConfig, forced: boolean = false, controllerId?: string) => {
    if (isAnimationLocked && !forced) {
      return;
    }

    if (activeDrawerController && controllerId !== activeDrawerController && !forced) {
      return;
    }

    let hasChanged = false;
    
    if (config.centerCoordinate && 
       (!centerCoordinate || 
        Math.abs(config.centerCoordinate[0] - centerCoordinate[0]) > 0.0001 ||
        Math.abs(config.centerCoordinate[1] - centerCoordinate[1]) > 0.0001)) {
      setCenterCoordinate(config.centerCoordinate);
      hasChanged = true;
    }
    if (config.zoomLevel !== undefined && Math.abs(config.zoomLevel - zoomLevel) > 0.1) {
      setZoomLevel(config.zoomLevel);
      hasChanged = true;
    }
    if (config.pitch !== undefined && Math.abs(config.pitch - pitch) > 0.1) {
      setPitchState(config.pitch);
      hasChanged = true;
    }
    if (config.heading !== undefined && Math.abs(config.heading - heading) > 1) {
      setHeadingState(config.heading);
      hasChanged = true;
    }

    if (mapRef.current && hasChanged) {
      const cameraUpdate: any = {};
      if (config.centerCoordinate) cameraUpdate.centerCoordinate = config.centerCoordinate;
      if (config.zoomLevel !== undefined) cameraUpdate.zoomLevel = config.zoomLevel;
      if (config.pitch !== undefined) cameraUpdate.pitch = config.pitch;
      if (config.heading !== undefined) cameraUpdate.heading = config.heading;
      if (config.animationDuration !== undefined) cameraUpdate.animationDuration = config.animationDuration;
      (mapRef.current as any).setCamera(cameraUpdate);
    }
  };

  const animateToLocation = (
    latitude: number, 
    longitude: number, 
    zoom: number = zoomLevel, 
    duration: number = 1000,
    pitch ?: number
  ) => {
    const config: CameraConfig = {
      centerCoordinate: [longitude, latitude],
      zoomLevel: zoom,
      animationDuration: duration,
      pitch: pitch !== undefined ? pitch : undefined,
    };

    if (!mapRef.current) {
      pendingCameraConfigs.current.push({ config, forced: false });
      return;
    }

    setCameraConfig(config);
  };

  const animateToLocationLocked = (
    latitude: number, 
    longitude: number, 
    zoom: number = zoomLevel, 
    duration: number = 1000,
    pitch?: number
  ) => {
    const config: CameraConfig = {
      centerCoordinate: [longitude, latitude],
      zoomLevel: zoom,
      animationDuration: duration,
      pitch: pitch !== undefined ? pitch : undefined,
    };

    if (!mapRef.current) {
      pendingCameraConfigs.current.push({ config, forced: true });
      return;
    }

    setIsAnimationLocked(true);

    setCameraConfig(config, true);

    setTimeout(() => {
      setIsAnimationLocked(false);
    }, duration + 1000);
  };

  const notifyMapReady = () => {
    if (!pendingCameraConfigs.current || pendingCameraConfigs.current.length === 0) return;
    pendingCameraConfigs.current.forEach((entry, idx) => {
      setTimeout(() => {
        setCameraConfig(entry.config, !!entry.forced, entry.controllerId);
      }, idx * 150);
    });
    pendingCameraConfigs.current = [];
  };

  const setDrawerCameraControl = (drawerId: string) => {
    setActiveDrawerController(drawerId);
};

  const releaseDrawerCameraControl = (drawerId?: string) => {
    if (!drawerId || activeDrawerController === drawerId) {
      setActiveDrawerController(null);
}
  };

  const setZoom = (zoom: number, duration: number = 1000) => {
    setCameraConfig({
      zoomLevel: zoom,
      animationDuration: duration
    });
  };

  const setPitch = (newPitch: number, duration: number = 1000) => {
    setCameraConfig({
      pitch: newPitch,
      animationDuration: duration
    });
  };

  const setHeading = (newHeading: number, duration: number = 1000) => {
    setCameraConfig({
      heading: newHeading,
      animationDuration: duration
    });
  };

  const resetCamera = (duration: number = 1000) => {
    setCameraConfig({
      centerCoordinate: initialCenter,
      zoomLevel: initialZoom,
      pitch: initialPitch,
      heading: initialHeading,
      animationDuration: duration
    });
  };

  const fitToCoordinates = (
    coordinates: [number, number][], 
    padding: number = 50, 
    duration: number = 1000,
    viewportPadding: ViewportPadding = {}
  ) => {
    if (coordinates.length === 0) return;

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
    
    const bottomPadding = viewportPadding.bottom || 0;
    const topPadding = viewportPadding.top || 0;
    const leftPadding = viewportPadding.left || 0;
    const rightPadding = viewportPadding.right || 0;
    
    const verticalPaddingFactor = 1 + (bottomPadding + topPadding) / 400;
    const horizontalPaddingFactor = 1 + (leftPadding + rightPadding) / 400;
    
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

    let adjustedCenterLat = centerLat;
    let adjustedCenterLon = centerLon;
    
    if (bottomPadding > 0) {
      const latShift = (adjustedLatDiff * bottomPadding) / 800;
      adjustedCenterLat += latShift;
    }

    setCameraConfig({
      centerCoordinate: [adjustedCenterLon, adjustedCenterLat],
      zoomLevel: zoom,
      animationDuration: duration
    });
  };

  const setViewportPadding = useCallback((padding: ViewportPadding) => {
    setCurrentViewportPadding(prevPadding => {
      if (JSON.stringify(prevPadding) === JSON.stringify(padding)) {
        return prevPadding;
      }
return padding;
    });
  }, []);

  const contextValue: MapViewContextType = {
    mapRef,
    centerCoordinate,
    zoomLevel,
    pitch,
    heading,
    setCameraConfig,
    animateToLocation,
    animateToLocationLocked,
    setDrawerCameraControl,
    releaseDrawerCameraControl,
    setZoom,
    setPitch,
    setHeading,
    resetCamera,
    fitToCoordinates,
    setViewportPadding,
    currentViewportPadding,
    notifyMapReady,
  };

  return (
    <MapViewContext.Provider value={contextValue}>
      {children}
    </MapViewContext.Provider>
  );
}

export function useMapView(): MapViewContextType {
  const context = useContext(MapViewContext);
  if (context === undefined) {
    throw new Error('useMapView must be used within a MapViewProvider');
  }
  return context;
}

