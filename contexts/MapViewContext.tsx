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
  // Notifier que la Map native est prête afin de vider les configs en attente
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
  initialCenter = [2.3522, 48.8566], // Paris par défaut
  initialZoom = 13,
  initialPitch = 0,
  initialHeading = 0
}: MapViewProviderProps) {
  const mapRef = useRef<MapView>(null);
  const CAMERA_DEBUG = false;
  
  // États de la caméra
  const [centerCoordinate, setCenterCoordinate] = useState<[number, number] | null>(initialCenter);
  const [zoomLevel, setZoomLevel] = useState<number>(initialZoom);
  const [pitch, setPitchState] = useState<number>(initialPitch);
  const [heading, setHeadingState] = useState<number>(initialHeading);
  
  // État pour le padding du viewport (pour les drawers, etc.)
  const [currentViewportPadding, setCurrentViewportPadding] = useState<ViewportPadding>({});

  // État pour verrouiller les animations automatiques (utile pour les sélections de parking)
  const [isAnimationLocked, setIsAnimationLocked] = useState<boolean>(false);

  // État pour suivre quel drawer contrôle actuellement la caméra (priorité exclusive)
  const [activeDrawerController, setActiveDrawerController] = useState<string | null>(null);

  // Cleanup effect pour éviter les ViewTagResolver errors
  React.useEffect(() => {
    return () => {
      // During unmount, ensure the ref is cleared so native views are not referenced
      try {
        if (mapRef && mapRef.current) {
          // @ts-ignore - ensure we don't hold onto native view tag
          mapRef.current = null;
        }
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Fonction principale pour configurer la caméra
  const setCameraConfig = (config: CameraConfig, forced: boolean = false, controllerId?: string) => {
  const prevCamera = { centerCoordinate, zoomLevel, pitch, heading };
    // Si les animations sont verrouillées et que ce n'est pas forcé, ignorer
    if (isAnimationLocked && !forced) {
return;
    }

    // Si un drawer contrôle la caméra et que cette demande ne vient pas du contrôleur actuel, ignorer
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
    
    if (hasChanged) {
      if (CAMERA_DEBUG) {
        try {
          console.log('[MapViewContext.setCameraConfig]', new Date().toISOString(), {
            controllerId,
            forced: !!forced,
            config,
            prev: prevCamera,
          });
        } catch (e) {
          // ignore logging errors
        }
      }
    }
  };

  // Animer vers une location spécifique avec validation du ref
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
      // Queue the request until the native MapView is ready to avoid ViewTagResolver errors
      pendingCameraConfigs.current.push({ config, forced: false });
      console.warn('⚠️ MapView not ready yet - queuing camera request');
      return;
    }

    setCameraConfig(config);
  };

  // Version verrouillée de animateToLocation pour les animations critiques (parking, etc.)
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
      console.warn('⚠️ MapView not ready yet - queuing locked camera request');
      return;
    }

    // Verrouiller les animations automatiques uniquement lorsque la map est prête
    setIsAnimationLocked(true);

    // Forcer la configuration de la caméra même si les animations sont verrouillées
    setCameraConfig(config, true);

    // Déverrouiller après la fin de l'animation
    setTimeout(() => {
      setIsAnimationLocked(false);
    }, duration + 1000); // Ajouter 1 seconde de marge de sécurité
  };

  // Queue pour stocker les demandes de caméra avant que la MapView native soit prête
  const pendingCameraConfigs = React.useRef<
    Array<{ config: CameraConfig; forced?: boolean; controllerId?: string }>
  >([]);

  // Fonction pour vider la file d'attente lorsque la map native est prête
  const notifyMapReady = () => {
    if (!pendingCameraConfigs.current || pendingCameraConfigs.current.length === 0) return;
    pendingCameraConfigs.current.forEach((entry, idx) => {
      setTimeout(() => {
        setCameraConfig(entry.config, !!entry.forced, entry.controllerId);
      }, idx * 150);
    });
    pendingCameraConfigs.current = [];
  };

  // Fonctions pour gérer le contrôle exclusif des drawers
  const setDrawerCameraControl = (drawerId: string) => {
    setActiveDrawerController(drawerId);
};

  const releaseDrawerCameraControl = (drawerId?: string) => {
    if (!drawerId || activeDrawerController === drawerId) {
      setActiveDrawerController(null);
}
  };

  // Définir le niveau de zoom
  const setZoom = (zoom: number, duration: number = 1000) => {
    setCameraConfig({
      zoomLevel: zoom,
      animationDuration: duration
    });
  };

  // Définir l'inclinaison
  const setPitch = (newPitch: number, duration: number = 1000) => {
    setCameraConfig({
      pitch: newPitch,
      animationDuration: duration
    });
  };

  // Définir l'orientation
  const setHeading = (newHeading: number, duration: number = 1000) => {
    setCameraConfig({
      heading: newHeading,
      animationDuration: duration
    });
  };

  // Réinitialiser la caméra
  const resetCamera = (duration: number = 1000) => {
    setCameraConfig({
      centerCoordinate: initialCenter,
      zoomLevel: initialZoom,
      pitch: initialPitch,
      heading: initialHeading,
      animationDuration: duration
    });
  };

  // Ajuster la caméra pour afficher toutes les coordonnées données
  const fitToCoordinates = (
    coordinates: [number, number][], 
    padding: number = 50, 
    duration: number = 1000,
    viewportPadding: ViewportPadding = {}
  ) => {
    if (coordinates.length === 0) return;

    // Calculer les bounds (limites géographiques)
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

    // Calculer le centre géographique
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    // Calculer le niveau de zoom approprié en tenant compte du viewport padding
    const latDiff = maxLat - minLat;
    const lonDiff = maxLon - minLon;
    
    // Ajuster les différences pour tenir compte du padding du viewport
    const bottomPadding = viewportPadding.bottom || 0;
    const topPadding = viewportPadding.top || 0;
    const leftPadding = viewportPadding.left || 0;
    const rightPadding = viewportPadding.right || 0;
    
    // Calculer le facteur d'ajustement pour le viewport réduit
    // Plus il y a de padding, plus on doit dézoomer
    const verticalPaddingFactor = 1 + (bottomPadding + topPadding) / 400; // 400px = hauteur de référence
    const horizontalPaddingFactor = 1 + (leftPadding + rightPadding) / 400;
    
    const adjustedLatDiff = latDiff * verticalPaddingFactor;
    const adjustedLonDiff = lonDiff * horizontalPaddingFactor;
    const maxDiff = Math.max(adjustedLatDiff, adjustedLonDiff);
    
    // Formule pour calculer le zoom basé sur la différence géographique ajustée
    let zoom = 10;
    if (maxDiff < 0.001) zoom = 16;
    else if (maxDiff < 0.005) zoom = 14;
    else if (maxDiff < 0.01) zoom = 13;
    else if (maxDiff < 0.05) zoom = 11;
    else if (maxDiff < 0.1) zoom = 10;
    else if (maxDiff < 0.5) zoom = 8;
    else if (maxDiff < 1) zoom = 7;
    else zoom = 6;

    // Ajuster le centre pour tenir compte du padding asymétrique
    let adjustedCenterLat = centerLat;
    let adjustedCenterLon = centerLon;
    
    if (bottomPadding > 0) {
      // Décaler le centre vers le nord pour compenser le drawer en bas
      const latShift = (adjustedLatDiff * bottomPadding) / 800; // 800px = hauteur d'écran de référence
      adjustedCenterLat += latShift;
    }

    // Appliquer la configuration de caméra
    setCameraConfig({
      centerCoordinate: [adjustedCenterLon, adjustedCenterLat],
      zoomLevel: zoom,
      animationDuration: duration
    });
  };

  // Fonction pour définir le padding du viewport
  const setViewportPadding = useCallback((padding: ViewportPadding) => {
    setCurrentViewportPadding(prevPadding => {
      // Éviter les mises à jour inutiles si le padding n'a pas changé
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
  };

  return (
    <MapViewContext.Provider value={contextValue}>
      {children}
    </MapViewContext.Provider>
  );
}

// Hook pour utiliser le contexte MapView
export function useMapView(): MapViewContextType {
  const context = useContext(MapViewContext);
  if (context === undefined) {
    throw new Error('useMapView must be used within a MapViewProvider');
  }
  return context;
}
