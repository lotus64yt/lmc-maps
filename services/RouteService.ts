import { useState, useEffect } from "react";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  duration: number; // en minutes
  distance: number; // en mètres
  instruction: string;
}

export interface RouteService {
  routeCoords: Coordinate[];
  destination: Coordinate | null;
  routeInfo: RouteInfo | null;
  isCalculating: boolean;
  isOsrmAvailable: boolean;
  lastOsrmCheck?: number;
  getRoute: (start: Coordinate, end: Coordinate, mode?: string) => Promise<boolean>;
  getMultiStepRoute: (waypoints: Coordinate[], mode?: string) => Promise<boolean>;
  clearRoute: () => void;
  clearRouteKeepDestination: () => void;
  setDestination: (destination: Coordinate | null) => void;
  // Nouvelles propriétés pour le tracé hybride
  directLineCoords: Coordinate[];
  nearestRoadPoint: Coordinate | null;
  hasDirectLineSegment: boolean;
  getHybridRoute: (start: Coordinate, end: Coordinate, mode?: string) => Promise<boolean>;
  // Nouvelle fonction pour vérifier si on est sur la route
  isOnRoute: (currentLocation: Coordinate, tolerance?: number) => boolean;
  recalculateIfOffRoute: (currentLocation: Coordinate, mode?: string) => Promise<boolean>;
}

export type TransportMode = 'driving' | 'walking' | 'bicycling';

export function useRouteService(): RouteService {
  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [isOsrmAvailable, setIsOsrmAvailable] = useState<boolean>(true);
  const [lastOsrmCheck, setLastOsrmCheck] = useState<number | undefined>(undefined);
  // Routing hosts: primary OSRM and a free fallback (no API key required)
  const ROUTING_HOSTS = [
  'https://router.project-osrm.org',
  'https://api.openrouteservice.org'
  ];
  const [routingHost, setRoutingHost] = useState<string>(ROUTING_HOSTS[0]);
  // Optional OpenRouteService API key (set globally or via environment)
  const ORS_API_KEY: string | undefined =
    (global as any)?.ORS_API_KEY ||
    (global as any)?.OPENROUTESERVICE_API_KEY ||
    (typeof process !== 'undefined' ? (process.env?.OPENROUTESERVICE_API_KEY as string | undefined) || (process.env?.ORS_API_KEY as string | undefined) : undefined);

  const isOpenRouteService = (host: string) => host.includes('openrouteservice.org');
  
  // Nouveaux états pour le tracé hybride
  const [directLineCoords, setDirectLineCoords] = useState<Coordinate[]>([]);
  const [nearestRoadPoint, setNearestRoadPoint] = useState<Coordinate | null>(null);
  const [hasDirectLineSegment, setHasDirectLineSegment] = useState<boolean>(false);

  // Nouvelle fonction pour trouver le point le plus proche sur une route existante
  const findNearestRoadPoint = async (
    location: Coordinate,
    mode: string = 'driving'
  ): Promise<Coordinate | null> => {
    try {
      const osrmMode = mode === 'bicycling' ? 'bike' : mode;

      // Try each routing host in order until one returns a nearest point
      for (const host of ROUTING_HOSTS) {
        try {
          if (isOpenRouteService(host)) {
            const url = `${host}/v2/nearest?point=${location.latitude},${location.longitude}`;
            console.log('ORS nearest url', url);
            const headers: Record<string,string> = {};
            if (ORS_API_KEY) headers['Authorization'] = ORS_API_KEY;
            const response = await fetch(url, { headers });
            if (!response.ok) {
              // try next host
              continue;
            }
            const data = await response.json();
            if (data && data.features && data.features.length > 0) {
              setIsOsrmAvailable(true);
              setLastOsrmCheck(Date.now());
              setRoutingHost(host);
              const coords = data.features[0].geometry.coordinates;
              return { latitude: coords[1], longitude: coords[0] };
            }
          } else {
            const url = `${host}/nearest/v1/${osrmMode}/${location.longitude},${location.latitude}?number=1`;
            console.log(url);
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (data.waypoints && data.waypoints.length > 0) {
              setIsOsrmAvailable(true);
              setLastOsrmCheck(Date.now());
              setRoutingHost(host);
              const nearest = data.waypoints[0];
              return {
                latitude: nearest.location[1],
                longitude: nearest.location[0]
              };
            }
          }
        } catch (e) {
          // ignore and try next host
          console.warn(`Nearest point failed on ${host}:`, e?.message || e);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error("Erreur lors de la recherche du point le plus proche:", error);
      return null;
    }
  };

  // Check routing provider availability by probing known hosts in order.
  const checkOsrmAvailable = async (timeoutMs = 4000): Promise<boolean> => {
    const hostsToCheck = ROUTING_HOSTS
    if (hostsToCheck.length === 0) {
      console.warn('No routing hosts available (ORS present but ORS_API_KEY missing)');
      setIsOsrmAvailable(false);
      setLastOsrmCheck(Date.now());
      return false;
    }
    for (const host of hostsToCheck) {
      console.log(`Checking OSRM availability for ${host}`);
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        const healthUrl = host.includes("project-osrm") ? `${host}/route/v1/driving/2.3522,48.8566;2.3522,48.8566?overview=false` : `${host}/v2/directions/driving-car?start=2.3522,48.8566&end=2.3522,48.8566`;
        let headers: Record<string, string> = {};
  // health-check: add Authorization header for ORS only when key available
  if (isOpenRouteService(host) && ORS_API_KEY) {
          headers['Authorization'] = ORS_API_KEY;
        }
        const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal, headers });
        
        clearTimeout(id)
        console.log(ORS_API_KEY)
        if (res && res.ok) {
          setIsOsrmAvailable(true);
          setLastOsrmCheck(Date.now());
          setRoutingHost(host);
          console.log(`OSRM health check succeeded for ${host}`);
          return true;
        }
      } catch (e) {
  console.warn(`OSRM health check failed for ${host}:`, e?.message || e);
  // try next host
      }
    }
    setIsOsrmAvailable(false);
    setLastOsrmCheck(Date.now());
    return false;
  };

  // Poll OSRM health periodically
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Do an initial quick check
      if (!mounted) return;
      await checkOsrmAvailable();
    })();
    const interval = setInterval(() => {
      checkOsrmAvailable();
    }, 30000); // every 30s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Fonction modifiée pour créer un tracé hybride (vol d'oiseau + route)
  const getHybridRoute = async (
    start: Coordinate, 
    end: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    setIsCalculating(true);
    
    try {
  // quick preflight: check available hosts but continue even if the initial host is down
  await checkOsrmAvailable();
      // 1. Corriger la position de départ si on est très proche d'une route
      const correctedStart = await correctPositionToRoad(start, mode);
      
      // 2. Trouver le point le plus proche sur le réseau routier depuis la position corrigée
      const nearestStart = await findNearestRoadPoint(correctedStart, mode);
      
      if (!nearestStart) {
        console.warn("Impossible de trouver un point proche sur le réseau routier");
        return false;
      }
      
      // 3. Calculer la distance jusqu'au point le plus proche (seuil de 100m)
      const distanceToRoad = calculateDistance(correctedStart, nearestStart);
      
      let finalRouteCoords: Coordinate[] = [];
      let hasDirectLine = false;
      let directLineCoords: Coordinate[] = [];
      
      if (distanceToRoad > 100) { // Si on est à plus de 100m d'une route
        // 4. Créer une ligne directe jusqu'au point le plus proche
        directLineCoords = [correctedStart, nearestStart];
        setDirectLineCoords(directLineCoords);
        setNearestRoadPoint(nearestStart);
        hasDirectLine = true;
        
        // 5. Calculer la route depuis le point le plus proche jusqu'à la destination
    const osrmMode = mode === 'bicycling' ? 'bike' : mode;
    if (isOpenRouteService(routingHost)) {
      const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
      const url = `${routingHost}/v2/directions/${profile}?start=${nearestStart.longitude},${nearestStart.latitude}&end=${end.longitude},${end.latitude}`;
      console.log('ORS route url', url);
      const headers: Record<string,string> = { 'Accept': 'application/json' };
      if (ORS_API_KEY) headers['Authorization'] = ORS_API_KEY;
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        setIsOsrmAvailable(true);
        setLastOsrmCheck(Date.now());
        setRoutingHost(routingHost);
        const route = data.features[0];
        const routeCoords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        finalRouteCoords = routeCoords;
        const directLineDistance = distanceToRoad;
        const routeDistance = Math.round(route.properties?.summary?.distance ?? 0);
        const totalDistance = directLineDistance + routeDistance;
        const directLineTime = Math.round(directLineDistance / (mode === 'walking' ? 80 : mode === 'bicycling' ? 250 : 500));
        const routeTime = Math.round((route.properties?.summary?.duration ?? 0) / 60);
        const totalTime = directLineTime + routeTime;
        const firstStep = route.properties?.segments?.[0]?.steps?.[0];
        const roadName = firstStep?.name || firstStep?.instruction || 'la route';
        setRouteInfo({ duration: totalTime, distance: totalDistance, instruction: `Rejoignez ${roadName} (${Math.round(directLineDistance)}m à vol d'oiseau)` });
      }
    } else {
      const url = `${routingHost}/route/v1/${osrmMode}/${nearestStart.longitude},${nearestStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
      console.log(url);
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        // mark OSRM available on successful response
        setIsOsrmAvailable(true);
        setLastOsrmCheck(Date.now());
        setRoutingHost(routingHost);
        const route = data.routes[0];
        const routeCoords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        finalRouteCoords = routeCoords;
        const directLineDistance = distanceToRoad;
        const routeDistance = Math.round(route.distance);
        const totalDistance = directLineDistance + routeDistance;
        const directLineTime = Math.round(directLineDistance / (mode === 'walking' ? 80 : mode === 'bicycling' ? 250 : 500));
        const routeTime = Math.round(route.duration / 60);
        const totalTime = directLineTime + routeTime;
        const firstStep = route.legs[0]?.steps[0];
        const roadName = firstStep?.name || 'la route';
        setRouteInfo({ duration: totalTime, distance: totalDistance, instruction: `Rejoignez ${roadName} (${Math.round(directLineDistance)}m à vol d'oiseau)` });
      }
    }
      } else {
        // Si on est déjà proche d'une route, utiliser la route normale depuis la position corrigée
    const osrmMode = mode === 'bicycling' ? 'bike' : mode;
    if (isOpenRouteService(routingHost)) {
      const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
      const url = `${routingHost}/v2/directions/${profile}?start=${correctedStart.longitude},${correctedStart.latitude}&end=${end.longitude},${end.latitude}`;
      const headers: Record<string,string> = { 'Accept': 'application/json' };
      if (ORS_API_KEY) headers['Authorization'] = ORS_API_KEY;
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        setIsOsrmAvailable(true);
        setLastOsrmCheck(Date.now());
        setRoutingHost(routingHost);
        const route = data.features[0];
        finalRouteCoords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        const duration = Math.round((route.properties?.summary?.duration ?? 0) / 60);
        const distance = Math.round(route.properties?.summary?.distance ?? 0);
        const instruction = route.properties?.segments?.[0]?.steps?.[0]?.instruction ?? "Suivre l'itinéraire";
        setRouteInfo({ duration, distance, instruction });
        setDirectLineCoords([]);
        setNearestRoadPoint(null);
      }
    } else {
      const url = `${routingHost}/route/v1/${osrmMode}/${correctedStart.longitude},${correctedStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        setIsOsrmAvailable(true);
        setLastOsrmCheck(Date.now());
        setRoutingHost(routingHost);
        const route = data.routes[0];
        finalRouteCoords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        const sharpTurns = detectSharpTurns(finalRouteCoords);
        const duration = Math.round(route.duration / 60);
        const distance = Math.round(route.distance);
        const instruction = route.legs[0]?.steps[0]?.maneuver?.instruction ?? "Suivre l'itinéraire";
        setRouteInfo({ duration, distance, instruction });
        setDirectLineCoords([]);
        setNearestRoadPoint(null);
      }
    }
      }
      
      setRouteCoords(finalRouteCoords);
      setDestination(end);
      setHasDirectLineSegment(hasDirectLine);
      
      return true;
      
  } catch (error) {
      console.error("Erreur lors du calcul de l'itinéraire hybride:", error);
  // mark OSRM as down on network errors
  setIsOsrmAvailable(false);
  return false;
    } finally {
      setIsCalculating(false);
    }
  };

  // Fonction pour calculer la distance entre deux points
  const calculateDistance = (point1: Coordinate, point2: Coordinate): number => {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Fonction pour corriger la position si on est très proche d'une route
  const correctPositionToRoad = async (
    location: Coordinate,
    mode: string = 'driving'
  ): Promise<Coordinate> => {
    const nearestPoint = await findNearestRoadPoint(location, mode);
    if (!nearestPoint) return location;
    
    const distanceToRoad = calculateDistance(location, nearestPoint);
    
    // Si on est à moins de 20m d'une route, corriger la position vers la route
    if (distanceToRoad <= 20) {
      return nearestPoint;
    }
    
    return location;
  };

  // Fonction pour détecter les virages serrés (>= 90 degrés) dans un tracé
  const detectSharpTurns = (coordinates: Coordinate[]): number[] => {
    const sharpTurnIndices: number[] = [];
    
    for (let i = 1; i < coordinates.length - 1; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const next = coordinates[i + 1];
      
      // Calculer les vecteurs
      const vec1 = {
        x: curr.longitude - prev.longitude,
        y: curr.latitude - prev.latitude
      };
      const vec2 = {
        x: next.longitude - curr.longitude,
        y: next.latitude - curr.latitude
      };
      
      // Calculer l'angle entre les vecteurs
      const dot = vec1.x * vec2.x + vec1.y * vec2.y;
      const mag1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
      const mag2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);
      
      if (mag1 > 0 && mag2 > 0) {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        const angleDegrees = angle * 180 / Math.PI;
        
        // Si l'angle est >= 90 degrés, c'est un virage serré
        if (angleDegrees >= 90) {
          sharpTurnIndices.push(i);
        }
      }
    }
    
    return sharpTurnIndices;
  };

  const getRoute = async (
    start: Coordinate, 
    end: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    setIsCalculating(true);
    
    try {
      const ok = await checkOsrmAvailable();
      if (!ok) {
        console.warn('OSRM appears to be unavailable, skipping route calculation');
        // return false;
      }
        // Convertir le mode si nécessaire
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        if (isOpenRouteService(routingHost)) {
          const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
          const url = `${routingHost}/v2/directions/${profile}?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
          console.log('Fetching route from ORS:', url);
          const headers: Record<string,string> = { 'Accept': 'application/json' };
          if (ORS_API_KEY) headers['Authorization'] = ORS_API_KEY;
          const response = await fetch(url, { headers });
          const data = await response.json();
          if (data && data.features && data.features.length > 0) {
            setIsOsrmAvailable(true);
            setLastOsrmCheck(Date.now());
            setRoutingHost(routingHost);
            const route = data.features[0];
            const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
            setRouteCoords(coords);
            setDestination(end);
            const duration = Math.round((route.properties?.summary?.duration ?? 0) / 60);
            const distance = Math.round(route.properties?.summary?.distance ?? 0);
            const instruction = route.properties?.segments?.[0]?.steps?.[0]?.instruction ?? "Suivre l'itinéraire";
            setRouteInfo({ duration, distance, instruction });
            return true;
          }
          console.warn("Aucun itinéraire trouvé (ORS)");
          return false;
        } else {
          const url = `${routingHost}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
          console.log("Fetching route from OSRM:", url);
          const response = await fetch(url);
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            // mark OSRM available on successful response
            setIsOsrmAvailable(true);
            setLastOsrmCheck(Date.now());
            setRoutingHost(routingHost);
            const route = data.routes[0];
            const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
            setRouteCoords(coords);
            setDestination(end);
            const duration = Math.round(route.duration / 60);
            const distance = Math.round(route.distance);
            const instruction = route.legs[0]?.steps[0]?.maneuver?.instruction ?? "Suivre l'itinéraire";
            setRouteInfo({ duration, distance, instruction });
            return true;
          } else {
            console.warn("Aucun itinéraire trouvé");
            return false;
          }
        }
    } catch (error) {
      console.error("Erreur lors du calcul de l'itinéraire:", error);
      setIsOsrmAvailable(false);
      return false;
    } finally {
      setIsCalculating(false);
    }
  };

  const getMultiStepRoute = async (
    waypoints: Coordinate[],
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (waypoints.length < 2) {
      console.warn("Au moins 2 waypoints sont nécessaires pour calculer un itinéraire");
      return false;
    }

    setIsCalculating(true);
    
    try {
      // Instead of bailing early when primary host seems down, try all hosts in order
      const osrmMode = mode === 'bicycling' ? 'bike' : mode;
      const coordsString = waypoints.map(point => `${point.longitude},${point.latitude}`).join(';');

      for (const host of ROUTING_HOSTS) {
        try {
          if (isOpenRouteService(host)) {
            if (!ORS_API_KEY) {
              console.warn('OpenRouteService selected but ORS_API_KEY not provided; skipping');
              continue;
            }
            const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
            const url = `${host}/v2/directions/${profile}`;
            const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': ORS_API_KEY };
            const body = JSON.stringify({ coordinates: waypoints.map(p => [p.longitude, p.latitude]) });
            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) {
              console.warn(`ORS multi-step failed with status ${response.status}`);
              continue;
            }
            const data = await response.json();
            if (data && data.features && data.features.length > 0) {
              setIsOsrmAvailable(true);
              setLastOsrmCheck(Date.now());
              setRoutingHost(host);
              const route = data.features[0];
              const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
              setRouteCoords(coords);
              setDestination(waypoints[waypoints.length - 1]);
              const totalDuration = Math.round((route.properties?.summary?.duration ?? 0) / 60);
              const totalDistance = Math.round(route.properties?.summary?.distance ?? 0);
              const firstInstruction = route.properties?.segments?.[0]?.steps?.[0]?.instruction ?? "Suivre l'itinéraire";
              setRouteInfo({ duration: totalDuration, distance: totalDistance, instruction: firstInstruction });
              return true;
            }
            continue;
          } else {
            const url = `${host}/route/v1/${osrmMode}/${coordsString}?overview=full&geometries=geojson&steps=true`;
            const response = await fetch(url);
            if (!response.ok) {
              continue;
            }
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
              setIsOsrmAvailable(true);
              setLastOsrmCheck(Date.now());
              setRoutingHost(host);
              const route = data.routes[0];
              const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
              setRouteCoords(coords);
              setDestination(waypoints[waypoints.length - 1]);
              const totalDuration = Math.round(route.duration / 60);
              const totalDistance = Math.round(route.distance);
              const firstInstruction = route.legs[0]?.steps[0]?.maneuver?.instruction ?? "Suivre l'itinéraire";
              setRouteInfo({ duration: totalDuration, distance: totalDistance, instruction: firstInstruction });
              return true;
            }
            continue;
          }
        } catch (e) {
          console.warn(`Multi-step route failed on ${host}:`, e?.message || e);
          continue;
        }
      }

      console.warn('Aucun itinéraire multi-étapes trouvé sur tous les hôtes');
      return false;
    } catch (error) {
      console.error("Erreur lors du calcul de l'itinéraire multi-étapes:", error);
      setIsOsrmAvailable(false);
      return false;
    } finally {
      setIsCalculating(false);
    }
  };

  // Fonction pour vérifier si on est sur la route
  const isOnRoute = (currentLocation: Coordinate, tolerance: number = 50): boolean => {
    if (routeCoords.length === 0) return false;
    
    // Vérifier la distance à chaque segment de la route
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const pointA = routeCoords[i];
      const pointB = routeCoords[i + 1];
      
      // Calculer la distance perpendiculaire du point à la ligne
      const distanceToSegment = calculateDistanceToLineSegment(currentLocation, pointA, pointB);
      
      if (distanceToSegment <= tolerance) {
        return true;
      }
    }
    
    return false;
  };

  // Fonction pour recalculer la route si on s'en écarte
  const recalculateIfOffRoute = async (
    currentLocation: Coordinate, 
    mode: string = 'driving'
  ): Promise<boolean> => {
    if (!destination) return false;
    
    // Vérifier si on est encore sur la route
    const onRoute = isOnRoute(currentLocation, 100); // Tolérance de 100m
    
    if (!onRoute) {
// Recalculer la route depuis la position actuelle
      return await getHybridRoute(currentLocation, destination, mode);
    }
    
    return false; // Pas besoin de recalculer
  };

  // Fonction utilitaire pour calculer la distance d'un point à un segment de ligne
  const calculateDistanceToLineSegment = (
    point: Coordinate,
    lineStart: Coordinate,
    lineEnd: Coordinate
  ): number => {
    const A = point.longitude - lineStart.longitude;
    const B = point.latitude - lineStart.latitude;
    const C = lineEnd.longitude - lineStart.longitude;
    const D = lineEnd.latitude - lineStart.latitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Le segment est un point
      return calculateDistance(point, lineStart);
    }
    
    let param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = lineStart.longitude;
      yy = lineStart.latitude;
    } else if (param > 1) {
      xx = lineEnd.longitude;
      yy = lineEnd.latitude;
    } else {
      xx = lineStart.longitude + param * C;
      yy = lineStart.latitude + param * D;
    }

    return calculateDistance(point, { longitude: xx, latitude: yy });
  };

  const clearRoute = (): void => {
    setRouteCoords([]);
    setDestination(null);
    setRouteInfo(null);
    // Nettoyer aussi les nouvelles propriétés
    setDirectLineCoords([]);
    setNearestRoadPoint(null);
    setHasDirectLineSegment(false);
  };

  const clearRouteKeepDestination = (): void => {
    setRouteCoords([]);
    setRouteInfo(null);
    // Nettoyer aussi les nouvelles propriétés
    setDirectLineCoords([]);
    setNearestRoadPoint(null);
    setHasDirectLineSegment(false);
};

  const handleDestinationChange = (newDestination: Coordinate | null): void => {
    setDestination(newDestination);
  };

  return {
    routeCoords,
    destination,
    routeInfo,
    isCalculating,
  isOsrmAvailable,
  lastOsrmCheck,
    getRoute,
    getMultiStepRoute,
    getHybridRoute,
    clearRoute,
    clearRouteKeepDestination,
    setDestination: handleDestinationChange,
    // Nouvelles propriétés pour le tracé hybride
    directLineCoords,
    nearestRoadPoint,
    hasDirectLineSegment,
    // Nouvelles fonctions pour la surveillance de route
    isOnRoute,
    recalculateIfOffRoute,
  };
}

/**
 * Service statique pour les calculs de routes sans état
 */
export class RouteCalculationService {
  
  /**
   * Calcule un itinéraire simple entre deux points
   */
  static async calculateRoute(
    start: Coordinate,
    end: Coordinate,
    mode: TransportMode = 'driving'
  ): Promise<{
    coordinates: Coordinate[];
    duration: number;
    distance: number;
    instructions: string[];
  } | null> {
    try {
      const osrmMode = mode === 'bicycling' ? 'bike' : mode;

      const hosts = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de'];
      let data: any = null;
      for (const host of hosts) {
        try {
          const url = `${host}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
          const response = await fetch(url);
          if (!response.ok) continue;
          data = await response.json();
          break;
        } catch (e) {
          // try next host
        }
      }
      if (!data) return null;
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        
        return {
          coordinates: route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lon,
          })),
          duration: Math.round(route.duration / 60),
          distance: Math.round(route.distance),
          instructions: route.legs[0]?.steps?.map((step: any) => 
            step.maneuver?.instruction || "Continuer"
          ) || []
        };
      }
      
      return null;
    } catch (error) {
      console.error("Erreur lors du calcul de l'itinéraire:", error);
      return null;
    }
  }

  /**
   * Calcule la distance à vol d'oiseau entre deux points
   */
  static calculateDistance(point1: Coordinate, point2: Coordinate): number {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = this.toRadians(point2.latitude - point1.latitude);
    const dLon = this.toRadians(point2.longitude - point1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(point1.latitude)) * 
              Math.cos(this.toRadians(point2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convertit les degrés en radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calcule le bearing (direction) entre deux points
   */
  static calculateBearing(start: Coordinate, end: Coordinate): number {
    const dLon = this.toRadians(end.longitude - start.longitude);
    const lat1 = this.toRadians(start.latitude);
    const lat2 = this.toRadians(end.latitude);
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x);
    return (this.toDegrees(bearing) + 360) % 360;
  }

  /**
   * Convertit les radians en degrés
   */
  private static toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
}
