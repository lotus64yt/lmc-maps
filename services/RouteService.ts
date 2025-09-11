import { useState, useEffect } from 'react';

// Clean, minimal RouteService implementation with per-host fetch timeouts.

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  duration: number; // minutes
  distance: number; // meters
  instruction: string;
}

export interface NavigationData {
  routeData: any;
  totalDuration: number; // seconds
  totalDistance: number; // meters
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
    coordinates?: [number, number][];
  }>;
}

export interface RouteService {
  routeCoords: Coordinate[];
  destination: Coordinate | null;
  routeInfo: RouteInfo | null;
  isCalculating: boolean;
  isOsrmAvailable: boolean;
  lastOsrmCheck?: number;
  routingHost: string;
  routingErrorMessage: string | null;
  getRoute: (start: Coordinate, end: Coordinate, mode?: string) => Promise<boolean>;
  getRoutes: (start: Coordinate, end: Coordinate, mode?: string, options?: { alternatives?: number; avoidTolls?: boolean; avoidHighways?: boolean }) => Promise<Array<{ coords: Coordinate[]; duration: number; distance: number }>>;
  getMultiStepRoute: (waypoints: Coordinate[], mode?: string) => Promise<boolean>;
  clearRoute: () => void;
  clearRouteKeepDestination: () => void;
  setDestination: (d: Coordinate | null) => void;
  directLineCoords: Coordinate[];
  nearestRoadPoint: Coordinate | null;
  hasDirectLineSegment: boolean;
  getHybridRoute: (start: Coordinate, end: Coordinate, mode?: string) => Promise<boolean>;
  getDistanceToRoute: (location: Coordinate) => number;
  detectOffRoute: (location: Coordinate, tolerance?: number) => boolean;
  isOnRoute: (currentLocation: Coordinate, tolerance?: number) => boolean;
  recalculateIfOffRoute: (currentLocation: Coordinate, mode?: string) => Promise<Coordinate | false>;
  lastRequestTimings: { host: string; durationMs: number; success: boolean; endpoint?: string }[];
  lastRawRouteData?: any | null;
  lastAlternatives?: Array<{ coords: Coordinate[]; duration: number; distance: number }>;
  selectAlternative?: (index: number) => boolean;
  getNavigationData: () => NavigationData | null;
  isOffRoute: boolean;
  updateRouteData: (newRouteData: any) => void;
}

export type TransportMode = 'driving' | 'walking' | 'bicycling';

const DEFAULT_OSRM_HOSTS = [
  'https://routing.openstreetmap.de/routed-car', 
  'https://valhalla1.openstreetmap.de/route',
];

function getORSKey(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants');
    return Constants?.manifest?.extra?.OPENROUTESERVICE_API_KEY || Constants?.expoConfig?.extra?.OPENROUTESERVICE_API_KEY;
  } catch {
    return undefined;
  }
}

export function useRouteService(): RouteService {
  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isOsrmAvailable, setIsOsrmAvailable] = useState(true);
  const [lastOsrmCheck, setLastOsrmCheck] = useState<number | undefined>(undefined);
  const [routingHost, setRoutingHost] = useState<string>(DEFAULT_OSRM_HOSTS[0]);
  const [lastRequestTimings, setLastRequestTimings] = useState<{ host: string; durationMs: number; success: boolean; endpoint?: string }[]>([]);
  const [lastRawRouteData, setLastRawRouteData] = useState<any | null>(null);
  const [lastAlternatives, setLastAlternatives] = useState<Array<{ coords: Coordinate[]; duration: number; distance: number }>>([]);

  // Temporary notification system for routing errors
  const [routingErrorMessage, setRoutingErrorMessage] = useState<string | null>(null);
  const [routingErrorTimeout, setRoutingErrorTimeout] = useState<NodeJS.Timeout | null>(null);

  const [directLineCoords, setDirectLineCoords] = useState<Coordinate[]>([]);
  const [nearestRoadPoint, setNearestRoadPoint] = useState<Coordinate | null>(null);
  const [hasDirectLineSegment, setHasDirectLineSegment] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (routingErrorTimeout) {
        clearTimeout(routingErrorTimeout);
      }
    };
  }, [routingErrorTimeout]);

  const ORS_API_KEY = (global as any)?.OPENROUTESERVICE_API_KEY || process?.env?.OPENROUTESERVICE_API_KEY || process?.env?.ORS_API_KEY || getORSKey();
  const isOpenRouteService = (host: string) => host.includes('openrouteservice.org');
  const isValhalla = (host: string) => host.includes('valhalla');
  
  const getRoutingHosts = (): string[] => {
    const hosts = [...DEFAULT_OSRM_HOSTS];
    if (ORS_API_KEY) hosts.push('https://api.openrouteservice.org');
    return hosts;
  };

  // Show temporary error message for routing failures
  const showRoutingError = (message: string, durationMs: number = 4000) => {
    // Clear existing timeout
    if (routingErrorTimeout) {
      clearTimeout(routingErrorTimeout);
    }
    
    setRoutingErrorMessage(message);
    
    const timeout = setTimeout(() => {
      setRoutingErrorMessage(null);
      setRoutingErrorTimeout(null);
    }, durationMs);
    
    setRoutingErrorTimeout(timeout);
  };

  // Build Valhalla request JSON
  const buildValhallaRequest = (start: Coordinate, end: Coordinate, mode: string, options: any = {}) => {
    const costing = mode === 'walking' ? 'pedestrian' : mode === 'bicycling' ? 'bicycle' : 'auto';
    
    return {
      costing,
      costing_options: {
        [costing]: {
          maneuver_penalty: 5,
          country_crossing_penalty: 0,
          country_crossing_cost: 600,
          use_highways: options.avoidHighways ? 0 : 1,
          use_tolls: options.avoidTolls ? 0 : 1,
          use_ferry: 1,
          ferry_cost: 300,
          shortest: false,
          top_speed: 140,
        }
      },
      exclude_polygons: [],
      locations: [
        { lon: start.longitude, lat: start.latitude, type: "break" },
        { lon: end.longitude, lat: end.latitude, type: "break" }
      ],
      units: "kilometers",
      alternates: options.alternatives || 0,
      id: "valhalla_directions"
    };
  };

  // Parse Valhalla response to OSRM-like format
  const parseValhallaResponse = (data: any) => {
    if (!data.trip || !data.trip.legs || !data.trip.legs[0]) {
      return null;
    }

    const leg = data.trip.legs[0];
    const shape = data.trip.legs[0].shape;
    
    // Decode Valhalla polyline (similar to Google's polyline encoding)
    const decodePolyline = (encoded: string) => {
      const coords: [number, number][] = [];
      let index = 0, lat = 0, lng = 0;
      
      while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        
        shift = 0;
        result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        
        coords.push([lng / 1e6, lat / 1e6]);
      }
      
      return coords;
    };

    const coordinates = shape ? decodePolyline(shape) : [];
    
    return {
      routes: [{
        geometry: {
          coordinates,
          type: "LineString"
        },
        duration: leg.time || 0,
        distance: (leg.length || 0) * 1000, // Convert km to meters
        legs: [{
          steps: leg.maneuvers?.map((maneuver: any) => ({
            instruction: maneuver.instruction || "",
            distance: (maneuver.length || 0) * 1000,
            duration: maneuver.time || 0,
            maneuver: {
              type: maneuver.type === 1 ? "depart" : maneuver.type === 4 ? "arrive" : "continue"
            }
          })) || []
        }]
      }]
    };
  };

  const REQUEST_TIMEOUT = 10000; // ms
  const fetchWithTimeout = async (url: RequestInfo, init?: RequestInit, timeout = REQUEST_TIMEOUT) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...(init || {}), signal: controller.signal } as RequestInit);
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  const toRadians = (d: number) => d * (Math.PI / 180);
  const calculateDistance = (a: Coordinate, b: Coordinate) => {
    const R = 6371000;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const sinDlat = Math.sin(dLat / 2);
    const sinDlon = Math.sin(dLon / 2);
    const c = sinDlat * sinDlat + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinDlon * sinDlon;
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  };

  const calculateDistanceToLineSegment = (point: Coordinate, a: Coordinate, b: Coordinate) => {
  // Use the central projection helper to compute the closest point, then compute haversine distance.
  if (!a || !b) return calculateDistance(point, a);
  const proj = getClosestPointOnSegment(point, a, b);
  return calculateDistance(point, proj);
  };

  // Project a point onto a segment and return the projected Coordinate
  const getClosestPointOnSegment = (point: Coordinate, a: Coordinate, b: Coordinate): Coordinate => {
    // Project using a simple equirectangular approximation in meter-space for better accuracy
    // Compute vector AB and AP in meters (using mean latitude for longitude scaling), then
    // compute parameter along AB and interpolate back to lat/lon.
    const R = 6371000; // earth radius meters
    const toRad = toRadians;
    const latMean = toRad((a.latitude + b.latitude) / 2);

    const ax = 0; // origin at point a
    const ay = 0;

    const bx = (toRad(b.longitude - a.longitude)) * Math.cos(latMean) * R;
    const by = (toRad(b.latitude - a.latitude)) * R;

    const px = (toRad(point.longitude - a.longitude)) * Math.cos(latMean) * R;
    const py = (toRad(point.latitude - a.latitude)) * R;

    const dot = px * bx + py * by;
    const lenSq = bx * bx + by * by;
    if (lenSq === 0) return a;
    let param = dot / lenSq;
    if (param <= 0) return { latitude: a.latitude, longitude: a.longitude };
    if (param >= 1) return { latitude: b.latitude, longitude: b.longitude };

    // Interpolate by param in degree-space (param is unitless along the segment)
    const lon = a.longitude + param * (b.longitude - a.longitude);
    const lat = a.latitude + param * (b.latitude - a.latitude);
    return { latitude: lat, longitude: lon };
  };

  // Find the nearest point on the current route polyline to the given location.
  // Returns a Coordinate on the route (projected) or null if route is not available.
  const getNearestPointOnRoute = (location: Coordinate): Coordinate | null => {
    if (!routeCoords || routeCoords.length < 2) return null;
    let bestPoint: Coordinate | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      const proj = getClosestPointOnSegment(location, a, b);
      const d = calculateDistance(location, proj);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = proj;
      }
    }
    return bestPoint;
  };

  // Compute minimal distance (meters) from a location to the current route polyline.
  // Returns Infinity if route isn't available.
  const getDistanceToRoute = (location: Coordinate): number => {
    const routePointCount = routeCoords ? routeCoords.length : 0;
    console.log('[RouteService.getDistanceToRoute]', { lat: location.latitude, lon: location.longitude, routePointCount });
    if (!routeCoords || routeCoords.length < 2) {
      console.log('[RouteService.getDistanceToRoute] no route available');
      return Infinity;
    }
    let bestDist = Infinity;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      const d = calculateDistanceToLineSegment(location, a, b);
      if (d < bestDist) bestDist = d;
    }
    console.log('[RouteService.getDistanceToRoute.result]', { bestDist });
    return bestDist;
  };

  // Detect if a location is off-route based on a tolerance (meters).
  // Returns true when the minimal distance to the route exceeds the tolerance.
  const detectOffRoute = (location: Coordinate, tolerance: number = 20): boolean => {
    const d = getDistanceToRoute(location);
    const currentlyOffRoute = d === Infinity ? false : d > tolerance;
    
    if (isOffRoute && !currentlyOffRoute) {
      setIsOffRoute(false);
    } else if (!isOffRoute && currentlyOffRoute) {
      setIsOffRoute(true);
    }
    
    return currentlyOffRoute;
  };

  const isOnRoute = (currentLocation: Coordinate, tolerance = 50) => {
    if (!routeCoords || routeCoords.length < 2) return false;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      if (calculateDistanceToLineSegment(currentLocation, a, b) <= tolerance) {
        if (isOffRoute) {
          setIsOffRoute(false);
        }
        return true;
      }
    }
    return false;
  };

  const findNearestRoadPoint = async (location: Coordinate, mode = 'driving'): Promise<Coordinate | null> => {
    setLastRequestTimings([]);
    const osrmMode = mode === 'bicycling' ? 'bike' : mode;
    for (const host of getRoutingHosts()) {
      const startTs = Date.now();
      try {
        if (isOpenRouteService(host)) {
          if (!ORS_API_KEY) {
            setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'nearest' }]);
            continue;
          }
          const url = `${host}/v2/nearest?point=${location.latitude},${location.longitude}`;
          const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
          const duration = Date.now() - startTs;
          const ok = res.ok;
          let data: any = null;
          try { data = await res.json(); } catch (e) { /* ignore parse */ }
          setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'nearest' }]);
          if (!ok) continue;
          if (data?.features?.length) {
            setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
            const coords = data.features[0].geometry.coordinates;
            return { latitude: coords[1], longitude: coords[0] };
          }
        } else {
          const url = `${host}/nearest/v1/${osrmMode}/${location.longitude},${location.latitude}?number=1`;
          const res = await fetchWithTimeout(url);
          const duration = Date.now() - startTs;
          const ok = res.ok;
          let data: any = null;
          try { data = await res.json(); } catch (e) { /* ignore parse */ }
          setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'nearest' }]);
          if (!ok) continue;
          if (data?.waypoints?.length) {
            setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
            const nearest = data.waypoints[0];
            return { latitude: nearest.location[1], longitude: nearest.location[0] };
          }
        }
      } catch (err) {
        const duration = Date.now() - startTs;
        setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false, endpoint: 'nearest' }]);
        console.warn('findNearestRoadPoint failed', { host, duration, err });
        continue;
      }
    }
    return null;
  };

  const correctPositionToRoad = async (location: Coordinate, mode = 'driving') => {
    try {
      const nearest = await findNearestRoadPoint(location, mode);
      if (!nearest) return location;
      return calculateDistance(location, nearest) <= 20 ? nearest : location;
    } catch {
      return location;
    }
  };

  // Fonction pour faire des requêtes parallèles par paires et retourner la première réponse
  const fetchParallelRoutes = async (
    start: Coordinate, 
    end: Coordinate, 
    mode = 'driving'
  ): Promise<{ success: boolean; data?: any; host?: string; timings: { host: string; durationMs: number; success: boolean; endpoint?: string }[] }> => {
    const osrmMode = mode === 'bicycling' ? 'bike' : mode;
    const hosts = getRoutingHosts();
    const timings: { host: string; durationMs: number; success: boolean; endpoint?: string }[] = [];
    
    // Créer des paires de hosts pour les requêtes parallèles
    const hostPairs: string[][] = [];
    for (let i = 0; i < hosts.length; i += 2) {
      if (i + 1 < hosts.length) {
        hostPairs.push([hosts[i], hosts[i + 1]]);
      } else {
        hostPairs.push([hosts[i]]);
      }
    }

    // Fonction pour faire une requête vers un host
    const tryHost = async (host: string): Promise<{ success: boolean; data?: any; host: string; timing: { host: string; durationMs: number; success: boolean; endpoint?: string } }> => {
      const startTs = Date.now();
      try {
        if (isValhalla(host)) {
          const requestBody = buildValhallaRequest(start, end, mode);
          const url = `${host}?json=${encodeURIComponent(JSON.stringify(requestBody))}`;
          const res = await fetchWithTimeout(url, { method: 'GET' });
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'route' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const valhallaData = await res.json();
          // Parse Valhalla response to OSRM format
          const osrmData = parseValhallaResponse(valhallaData);
          if (osrmData?.routes?.length) {
            return { success: true, data: osrmData, host, timing };
          }
          return { success: false, host, timing };
        } else if (isOpenRouteService(host)) {
          if (!ORS_API_KEY) {
            const timing = { host, durationMs: 0, success: false, endpoint: 'directions' as const };
            return { success: false, host, timing };
          }
          const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
          const url = `${host}/v2/directions/${profile}?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
          const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'directions' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const data = await res.json();
          if (data?.features?.length) {
            return { success: true, data, host, timing };
          }
          return { success: false, host, timing };
        } else {
          const url = `${host}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
          const res = await fetchWithTimeout(url);
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'route' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const data = await res.json();
          if (data?.routes?.length) {
            return { success: true, data, host, timing };
          }
          return { success: false, host, timing };
        }
      } catch (err) {
        const duration = Date.now() - startTs;
        const timing = { host, durationMs: duration, success: false };
        console.warn('fetchParallelRoutes host failed', { host, duration, err });
        return { success: false, host, timing };
      }
    };

    // Tester les paires de hosts en parallèle
    for (const pair of hostPairs) {
      try {
        const promises = pair.map(host => tryHost(host));
        const results = await Promise.allSettled(promises);
        
        // Collecter tous les timings de cette paire
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            timings.push(result.value.timing);
          }
        });

        // Chercher la première réponse réussie
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            return { 
              success: true, 
              data: result.value.data, 
              host: result.value.host, 
              timings 
            };
          }
        }
      } catch (err) {
        console.warn('Error in parallel requests for pair:', pair, err);
      }
    }

    console.warn('❌ All routing hosts failed');
    showRoutingError('Service de calcul d\'itinéraire temporairement indisponible');
    return { success: false, timings };
  };

  // Fonction parallèle pour les alternatives de routes
  const fetchParallelAlternatives = async (
    start: Coordinate, 
    end: Coordinate, 
    mode = 'driving',
    options: { alternatives?: number; avoidTolls?: boolean; avoidHighways?: boolean } = {}
  ): Promise<{ success: boolean; routes?: Array<{ coords: Coordinate[]; duration: number; distance: number }>; host?: string; timings: { host: string; durationMs: number; success: boolean; endpoint?: string }[] }> => {
    const osrmMode = mode === 'bicycling' ? 'bike' : mode;
    const altCount = Math.max(1, Math.min(3, options.alternatives || 1));
    const hosts = getRoutingHosts();
    const timings: { host: string; durationMs: number; success: boolean; endpoint?: string }[] = [];
    
    // Créer des paires de hosts
    const hostPairs: string[][] = [];
    for (let i = 0; i < hosts.length; i += 2) {
      if (i + 1 < hosts.length) {
        hostPairs.push([hosts[i], hosts[i + 1]]);
      } else {
        hostPairs.push([hosts[i]]);
      }
    }

    // Fonction pour faire une requête alternatives vers un host
    const tryHostAlternatives = async (host: string): Promise<{ success: boolean; routes?: Array<{ coords: Coordinate[]; duration: number; distance: number }>; host: string; timing: { host: string; durationMs: number; success: boolean; endpoint?: string } }> => {
      const startTs = Date.now();
      try {
        if (isValhalla(host)) {
          const requestBody = buildValhallaRequest(start, end, mode, { ...options, alternatives: altCount - 1 });
          const url = `${host}?json=${encodeURIComponent(JSON.stringify(requestBody))}`;
          const res = await fetchWithTimeout(url, { method: 'GET' });
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'route' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const valhallaData = await res.json();
          const osrmData = parseValhallaResponse(valhallaData);
          if (osrmData?.routes?.length) {
            const routes = osrmData.routes.slice(0, altCount).map((route: any) => ({
              coords: (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
              duration: Math.round(route.duration / 60),
              distance: Math.round(route.distance),
            }));
            return { success: true, routes, host, timing };
          }
          return { success: false, host, timing };
        } else if (isOpenRouteService(host)) {
          if (!ORS_API_KEY) {
            const timing = { host, durationMs: 0, success: false, endpoint: 'directions' as const };
            return { success: false, host, timing };
          }
          const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
          const url = `${host}/v2/directions/${profile}?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
          const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'directions' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const data = await res.json();
          if (data?.features?.length) {
            const routes = data.features.slice(0, altCount).map((route: any) => {
              const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
              const duration = Math.round((route.properties?.summary?.duration ?? 0) / 60);
              const distance = Math.round(route.properties?.summary?.distance ?? 0);
              return { coords, duration, distance };
            });
            return { success: true, routes, host, timing };
          }
          return { success: false, host, timing };
        } else {
          // OSRM-style hosts
          const excludes: string[] = [];
          if (options.avoidHighways) excludes.push('motorway');
          if (options.avoidTolls) excludes.push('toll');
          const excludeParam = excludes.length ? `&exclude=${excludes.join(',')}` : '';
          const url = `${host}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true&alternatives=true${excludeParam}`;
          const res = await fetchWithTimeout(url);
          const duration = Date.now() - startTs;
          const timing = { host, durationMs: duration, success: res.ok, endpoint: 'route' as const };
          
          if (!res.ok) return { success: false, host, timing };
          
          const data = await res.json();
          if (data?.routes?.length) {
            const routes = (data.routes as any[]).slice(0, altCount).map(route => ({
              coords: (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
              duration: Math.round(route.duration / 60),
              distance: Math.round(route.distance),
            }));
            return { success: true, routes, host, timing };
          }
          return { success: false, host, timing };
        }
      } catch (err) {
        const duration = Date.now() - startTs;
        const timing = { host, durationMs: duration, success: false };
        console.warn('fetchParallelAlternatives host failed', { host, duration, err });
        return { success: false, host, timing };
      }
    };

    // Tester les paires de hosts en parallèle
    for (const pair of hostPairs) {
      try {
        const promises = pair.map(host => tryHostAlternatives(host));
        const results = await Promise.allSettled(promises);
        
        // Collecter tous les timings de cette paire
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            timings.push(result.value.timing);
          }
        });

        // Chercher la première réponse réussie
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            return { 
              success: true, 
              routes: result.value.routes, 
              host: result.value.host, 
              timings 
            };
          }
        }
      } catch (err) {
        console.warn('Error in parallel alternatives requests for pair:', pair, err);
      }
    }

    console.warn('❌ All alternatives routing hosts failed');
    showRoutingError('Service de calcul d\'itinéraire temporairement indisponible');
    return { success: false, timings };
  };

  const getRoute = async (start: Coordinate, end: Coordinate, mode = 'driving') => {
    setIsCalculating(true);
    setLastRequestTimings([]);
    
    try {
      console.log('🚀 Starting parallel route requests...');
      const result = await fetchParallelRoutes(start, end, mode);
      setLastRequestTimings(result.timings);
      
      if (!result.success || !result.data || !result.host) {
        console.warn('❌ All route requests failed');
        setIsOsrmAvailable(false);
        return false;
      }

      console.log(`✅ Route found from ${result.host} in ${result.timings.find(t => t.host === result.host)?.durationMs}ms`);
      setIsOsrmAvailable(true);
      setLastOsrmCheck(Date.now());
      setRoutingHost(result.host);
      setLastRawRouteData(result.data);

      // Traiter la réponse selon le type de service
      if (isOpenRouteService(result.host)) {
        const route = result.data.features[0];
        const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        setRouteCoords(coords);
        setDestination(end);
        setRouteInfo({ 
          duration: Math.round((route.properties?.summary?.duration ?? 0) / 60), 
          distance: Math.round(route.properties?.summary?.distance ?? 0), 
          instruction: 'Suivre l\'itinéraire' 
        });
      } else {
        const route = result.data.routes[0];
        const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
        setRouteCoords(coords);
        setDestination(end);
        setRouteInfo({ 
          duration: Math.round(route.duration / 60), 
          distance: Math.round(route.distance), 
          instruction: 'Suivre l\'itinéraire' 
        });
      }

      return true;
    } catch (err) {
      console.error('💥 Error in getRoute:', err);
      setIsOsrmAvailable(false);
      return false;
    } finally {
      setIsCalculating(false);
    }
  };

  const getMultiStepRoute = async (waypoints: Coordinate[], mode = 'driving') => {
    if (!waypoints || waypoints.length < 2) return false;
    setIsCalculating(true);
    setLastRequestTimings([]);
    try {
      const osrmMode = mode === 'bicycling' ? 'bike' : mode;
      const coordsQuery = waypoints.map(wp => `${wp.longitude},${wp.latitude}`).join(';');
      for (const host of getRoutingHosts()) {
        const startTs = Date.now();
        try {
          if (isOpenRouteService(host)) {
            if (!ORS_API_KEY) { setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); continue; }
            const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
            const start = waypoints[0];
            const end = waypoints[waypoints.length - 1];
            const url = `${host}/v2/directions/${profile}?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
            const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
            const duration = Date.now() - startTs;
            const ok = res.ok;
            let data: any = null;
            try { data = await res.json(); } catch { /* ignore */ }
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'directions' }]);
            if (!ok) continue;
            if (data?.features?.length) {
              setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
              const route = data.features[0];
              const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
              setLastRawRouteData(data);
              setRouteCoords(coords); setDestination(waypoints[waypoints.length - 1]);
              setRouteInfo({ duration: Math.round((route.properties?.summary?.duration ?? 0) / 60), distance: Math.round(route.properties?.summary?.distance ?? 0), instruction: 'Suivre l\'itinéraire' });
              return true;
            }
          } else {
            const url = `${host}/route/v1/${osrmMode}/${coordsQuery}?overview=full&geometries=geojson&steps=true`;
            const res = await fetchWithTimeout(url);
            const duration = Date.now() - startTs;
            const ok = res.ok;
            let data: any = null;
            try { data = await res.json(); } catch { /* ignore */ }
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'route' }]);
            if (!ok) continue;
            if (data?.routes?.length) {
              setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
              const route = data.routes[0];
              const coords = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
              setLastRawRouteData(data);
              setRouteCoords(coords); setDestination(waypoints[waypoints.length - 1]);
              setRouteInfo({ duration: Math.round(route.duration / 60), distance: Math.round(route.distance), instruction: 'Suivre l\'itinéraire' });
              return true;
            }
          }
        } catch (err) {
          const duration = Date.now() - startTs;
          setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
          console.warn('getMultiStepRoute host failed', { host, duration, err });
          continue;
        }
      }
      return false;
    } catch (err) {
      setIsOsrmAvailable(false);
      return false;
    } finally {
      setIsCalculating(false);
    }
  };

  // Fetch multiple alternative routes (up to 3) and support simple avoid options
  const getRoutes = async (
    start: Coordinate,
    end: Coordinate,
    mode: string = 'driving',
    options: { alternatives?: number; avoidTolls?: boolean; avoidHighways?: boolean } = {}
  ): Promise<Array<{ coords: Coordinate[]; duration: number; distance: number }>> => {
    setIsCalculating(true);
    setLastRequestTimings([]);
    
    try {
      console.log('🚀 Starting parallel alternatives requests...');
      const result = await fetchParallelAlternatives(start, end, mode, options);
      setLastRequestTimings(result.timings);
      
      if (!result.success || !result.routes || !result.host) {
        console.warn('❌ All alternatives requests failed');
        setIsOsrmAvailable(false);
        setLastAlternatives([]);
        return [];
      }

      console.log(`✅ Alternatives found from ${result.host} in ${result.timings.find(t => t.host === result.host)?.durationMs}ms`);
      setIsOsrmAvailable(true);
      setLastOsrmCheck(Date.now());
      setRoutingHost(result.host);
      
      // Set the primary route into service state for compatibility
      if (result.routes.length > 0) {
        setRouteCoords(result.routes[0].coords);
        setDestination(end);
        setRouteInfo({ 
          duration: result.routes[0].duration, 
          distance: result.routes[0].distance, 
          instruction: "Suivre l'itinéraire" 
        });
        setLastAlternatives(result.routes);
      } else {
        setLastAlternatives([]);
      }
      
      return result.routes;
    } catch (err) {
      console.error('💥 Error in getRoutes:', err);
      setIsOsrmAvailable(false);
      setLastAlternatives([]);
      return [];
    } finally {
      setIsCalculating(false);
    }
  };

  const selectAlternative = (index: number) => {
    if (!lastAlternatives || lastAlternatives.length === 0) return false;
    const clamped = Math.max(0, Math.min(lastAlternatives.length - 1, index));
    const alt = lastAlternatives[clamped];
    if (!alt) return false;
    setRouteCoords(alt.coords);
    // destination stays the same
    setRouteInfo({ duration: alt.duration, distance: alt.distance, instruction: "Suivre l'itinéraire" });
    return true;
  };

  const getHybridRoute = async (start: Coordinate, end: Coordinate, mode = 'driving') => {
    console.log('[getHybridRoute] Starting hybrid route calculation', { start, end, mode });
    setIsCalculating(true);
    setLastRequestTimings([]);
    try {
      console.log('[getHybridRoute] Correcting position to road...');
      const correctedStart = await correctPositionToRoad(start, mode);
      console.log('[getHybridRoute] Corrected start position:', correctedStart);
      
      console.log('[getHybridRoute] Finding nearest road point...');
      const nearestStart = await findNearestRoadPoint(correctedStart, mode);
      console.log('[getHybridRoute] Nearest road point:', nearestStart);
      
      if (!nearestStart) {
        console.log('[getHybridRoute] No nearest road point found, aborting');
        return false;
      }
      
      const distanceToRoad = calculateDistance(correctedStart, nearestStart);
      console.log('[getHybridRoute] Distance to road:', distanceToRoad, 'meters');

      let finalRouteCoords: Coordinate[] = [];
      let hasDirectLine = false;

      if (distanceToRoad > 100) {
        console.log('[getHybridRoute] Distance > 100m, using hybrid approach with direct line');
        console.log('[getHybridRoute] Distance > 100m, using hybrid approach with direct line');
        hasDirectLine = true;
        setDirectLineCoords([correctedStart, nearestStart]);
        setNearestRoadPoint(nearestStart);
        console.log('[getHybridRoute] Set direct line coords and nearest road point');
        
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        console.log('[getHybridRoute] Starting route requests from nearest road point to destination');
        
        for (const host of getRoutingHosts()) {
          console.log('[getHybridRoute] Trying host:', host);
          const startTs = Date.now();
          try {
            if (isOpenRouteService(host)) {
              console.log('[getHybridRoute] Using OpenRouteService for host:', host);
              if (!ORS_API_KEY) { 
                console.log('[getHybridRoute] No ORS API key, skipping host:', host);
                setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); 
                continue; 
              }
              const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
              const url = `${host}/v2/directions/${profile}?start=${nearestStart.longitude},${nearestStart.latitude}&end=${end.longitude},${end.latitude}`;
              console.log('[getHybridRoute] ORS request URL:', url);
              const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
              const duration = Date.now() - startTs;
              const ok = res.ok;
              console.log('[getHybridRoute] ORS response status:', ok, 'duration:', duration);
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'directions' }]);
              if (!ok) {
                console.log('[getHybridRoute] ORS request failed for host:', host);
                continue;
              }
              if (data?.features?.length) { 
                console.log('[getHybridRoute] Got route data from ORS, coords count:', data.features[0].geometry.coordinates.length);
                finalRouteCoords = data.features[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })); 
                break; 
              }
            } else {
              console.log('[getHybridRoute] Using OSRM-style for host:', host);
              const url = `${host}/route/v1/${osrmMode}/${nearestStart.longitude},${nearestStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
              console.log('[getHybridRoute] OSRM request URL:', url);
              const res = await fetchWithTimeout(url);
              const duration = Date.now() - startTs;
              const ok = res.ok;
              console.log('[getHybridRoute] OSRM response status:', ok, 'duration:', duration);
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'route' }]);
              if (!ok) {
                console.log('[getHybridRoute] OSRM request failed for host:', host);
                continue;
              }
              if (data?.routes?.length) { 
                console.log('[getHybridRoute] Got route data from OSRM, coords count:', data.routes[0].geometry.coordinates.length);
                finalRouteCoords = data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })); 
                break; 
              }
            }
          } catch (err) {
            const duration = Date.now() - startTs;
            console.log('[getHybridRoute] Request failed for host:', host, 'error:', err);
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
            continue;
          }
        }
      } else {
        console.log('[getHybridRoute] Distance <= 100m, requesting full route from corrected start');
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        for (const host of getRoutingHosts()) {
          console.log('[getHybridRoute] Trying host for full route:', host);
          const startTs = Date.now();
          try {
            if (isOpenRouteService(host)) {
              console.log('[getHybridRoute] Using OpenRouteService for full route, host:', host);
              if (!ORS_API_KEY) { 
                console.log('[getHybridRoute] No ORS API key for full route, skipping host:', host);
                setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); 
                continue; 
              }
              const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
              const url = `${host}/v2/directions/${profile}?start=${correctedStart.longitude},${correctedStart.latitude}&end=${end.longitude},${end.latitude}`;
              console.log('[getHybridRoute] ORS full route request URL:', url);
              const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
              const duration = Date.now() - startTs;
              const ok = res.ok;
              console.log('[getHybridRoute] ORS full route response status:', ok, 'duration:', duration);
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'directions' }]);
              if (!ok) {
                console.log('[getHybridRoute] ORS full route request failed for host:', host);
                continue;
              }
              if (data?.features?.length) {
                console.log('[getHybridRoute] Got full route from ORS, setting route data');
                setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
                const route = data.features[0];
                const routeCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }));
                setLastRawRouteData(data); setRouteCoords(routeCoords);
                setRouteInfo({ duration: Math.round((route.properties?.summary?.duration ?? 0) / 60), distance: Math.round(route.properties?.summary?.distance ?? 0), instruction: 'Suivre l\'itinéraire' });
                setDirectLineCoords([]); setNearestRoadPoint(null);
                console.log('[getHybridRoute] Successfully set full route from ORS');
                break;
              }
            } else {
              console.log('[getHybridRoute] Using OSRM-style for full route, host:', host);
              const url = `${host}/route/v1/${osrmMode}/${correctedStart.longitude},${correctedStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
              console.log('[getHybridRoute] OSRM full route request URL:', url);
              const res = await fetchWithTimeout(url);
              const duration = Date.now() - startTs;
              const ok = res.ok;
              console.log('[getHybridRoute] OSRM full route response status:', ok, 'duration:', duration);
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'route' }]);
              if (!ok) {
                console.log('[getHybridRoute] OSRM full route request failed for host:', host);
                continue;
              }
              if (data?.routes?.length) {
                console.log('[getHybridRoute] Got full route from OSRM, setting route data');
                setIsOsrmAvailable(true); setLastOsrmCheck(Date.now()); setRoutingHost(host);
                const route = data.routes[0];
                const routeCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }));
                setLastRawRouteData(data); setRouteCoords(routeCoords);
                setRouteInfo({ duration: Math.round(route.duration / 60), distance: Math.round(route.distance), instruction: 'Suivre l\'itinéraire' });
                setDirectLineCoords([]); setNearestRoadPoint(null);
                console.log('[getHybridRoute] Successfully set full route from OSRM');
                break;
              }
            }
          } catch (err) {
            const duration = Date.now() - startTs;
            console.log('[getHybridRoute] Full route request failed for host:', host, 'error:', err);
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
            continue;
          }
        }
      }

      console.log('[getHybridRoute] Checking final route coords length:', finalRouteCoords.length);
      if (finalRouteCoords && finalRouteCoords.length) {
        console.log('[getHybridRoute] Setting final route with', finalRouteCoords.length, 'coordinates, hasDirectLine:', hasDirectLine);
        setLastRawRouteData(null);
        setRouteCoords(finalRouteCoords);
        setDestination(end);
        setHasDirectLineSegment(hasDirectLine);
        console.log('[getHybridRoute] Successfully completed hybrid route calculation');
        return true;
      }

      console.log('[getHybridRoute] No route coords found, returning false');
      return false;
    } catch (err) {
      console.error('[getHybridRoute] Error in hybrid route calculation:', err);
      setIsOsrmAvailable(false);
      return false;
    } finally {
      console.log('[getHybridRoute] Finishing hybrid route calculation');
      setIsCalculating(false);
    }
  };

  const recalculateIfOffRoute = async (currentLocation: Coordinate, mode: string = 'driving') => {
    if (!destination) return false;
    const OFF_ROUTE_TOLERANCE = 20;
    const onRoute = isOnRoute(currentLocation, OFF_ROUTE_TOLERANCE);
    if (!onRoute) {
      const nearestOnRoute = getNearestPointOnRoute(currentLocation);
      const startForRecalc = nearestOnRoute || currentLocation;
      const ok = await getHybridRoute(startForRecalc, destination, mode);
      if (ok) {
        setIsOffRoute(false);
        return startForRecalc;
      }
      return false;
    }
    return false;
  };

  const clearRoute = () => {
    setRouteCoords([]);
    setDestination(null);
    setRouteInfo(null);
    setDirectLineCoords([]);
    setNearestRoadPoint(null);
    setHasDirectLineSegment(false);
    setLastAlternatives([]);
    setIsOffRoute(false);
    if (routingErrorTimeout) {
      clearTimeout(routingErrorTimeout);
      setRoutingErrorTimeout(null);
    }
    setRoutingErrorMessage(null);
  };

  const clearRouteKeepDestination = () => {
  setRouteCoords([]);
  setRouteInfo(null);
  setDirectLineCoords([]);
  setNearestRoadPoint(null);
  setHasDirectLineSegment(false);
  setLastAlternatives([]);
  setIsOffRoute(false);
  if (routingErrorTimeout) {
    clearTimeout(routingErrorTimeout);
    setRoutingErrorTimeout(null);
  }
  setRoutingErrorMessage(null);
  };

  const getNavigationData = (): NavigationData | null => {
    if (!lastRawRouteData) return null;
    
    try {
      // Extract from OSRM format
      if (lastRawRouteData.routes && lastRawRouteData.routes[0]) {
        const route = lastRawRouteData.routes[0];
        const steps = route.legs?.[0]?.steps || [];
        
        return {
          routeData: lastRawRouteData,
          totalDuration: route.duration || 0, // seconds
          totalDistance: route.distance || 0, // meters
          steps: steps.map((step: any) => ({
            instruction: step.maneuver?.instruction || step.name || '',
            distance: step.distance || 0,
            duration: step.duration || 0,
            coordinates: step.geometry?.coordinates
          }))
        };
      }
      
      // Extract from ORS format
      if (lastRawRouteData.features && lastRawRouteData.features[0]) {
        const feature = lastRawRouteData.features[0];
        const segments = feature.properties?.segments || [];
        const steps = segments.flatMap((seg: any) => seg.steps || []);
        
        return {
          routeData: lastRawRouteData,
          totalDuration: feature.properties?.summary?.duration || 0,
          totalDistance: feature.properties?.summary?.distance || 0,
          steps: steps.map((step: any) => ({
            instruction: step.instruction || '',
            distance: step.distance || 0,
            duration: step.duration || 0,
            coordinates: step.way_points ? [step.way_points] : undefined
          }))
        };
      }
      
      // Extract from Valhalla format
      if (lastRawRouteData.trip && lastRawRouteData.trip.legs) {
        const legs = lastRawRouteData.trip.legs;
        const allManeuvers = legs.flatMap((leg: any) => leg.maneuvers || []);
        
        return {
          routeData: lastRawRouteData,
          totalDuration: lastRawRouteData.trip.summary?.time || 0,
          totalDistance: lastRawRouteData.trip.summary?.length || 0,
          steps: allManeuvers.map((maneuver: any) => ({
            instruction: maneuver.instruction || '',
            distance: maneuver.length || 0,
            duration: maneuver.time || 0,
            coordinates: undefined
          }))
        };
      }
      
    } catch (e) {
      console.warn('Error extracting navigation data:', e);
    }
    
    return null;
  };

  const handleDestinationChange = (d: Coordinate | null) => setDestination(d);

  // Méthode pour mettre à jour les données de route depuis l'extérieur
  const updateRouteData = (newRouteData: any) => {
    console.log('[RouteService] updateRouteData appelé avec:', newRouteData);
    
    if (!newRouteData) return;
    
    // Mettre à jour les données brutes
    setLastRawRouteData(newRouteData);
    
    // Extraire les coordonnées selon le format
    let newRouteCoords: Coordinate[] = [];
    
    if (newRouteData.features && newRouteData.features.length > 0) {
      // Format ORS
      const route = newRouteData.features[0];
      newRouteCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ 
        latitude: lat, 
        longitude: lon 
      }));
      console.log('[RouteService] Coordonnées extraites format ORS:', newRouteCoords.length, 'points');
    } else if (newRouteData.routes && newRouteData.routes.length > 0) {
      // Format OSRM
      const route = newRouteData.routes[0];
      newRouteCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ 
        latitude: lat, 
        longitude: lon 
      }));
      console.log('[RouteService] Coordonnées extraites format OSRM:', newRouteCoords.length, 'points');
    }
    
    if (newRouteCoords.length > 0) {
      setRouteCoords(newRouteCoords);
      console.log('[RouteService] ✅ RouteCoords mis à jour avec', newRouteCoords.length, 'points');
    }
  };

  return {
    routeCoords,
    destination,
    routeInfo,
    isCalculating,
    isOsrmAvailable,
    lastOsrmCheck,
    routingHost,
    routingErrorMessage,
    lastRequestTimings,
    lastRawRouteData,
    getRoute,
    getMultiStepRoute,
  getRoutes,
    getHybridRoute,
    clearRoute,
    clearRouteKeepDestination,
    setDestination: handleDestinationChange,
    directLineCoords,
    nearestRoadPoint,
    hasDirectLineSegment,
  isOnRoute,
  detectOffRoute,
  recalculateIfOffRoute,
  getDistanceToRoute,
  lastAlternatives,
  selectAlternative,
  getNavigationData,
  isOffRoute,
  updateRouteData,
  };
}

// Fonction utilitaire pour les requêtes parallèles de routing (utilisée dans App.tsx)
export async function fetchParallelRouting(
  start: Coordinate,
  end: Coordinate,
  mode: string = 'driving',
  options: { alternatives?: boolean; waypoints?: Coordinate[] } = {}
): Promise<{ success: boolean; data?: any; host?: string }> {
  const DEFAULT_HOSTS = [
    'https://routing.openstreetmap.de/routed-car', 
    'https://routing.openstreetmap.de',
    'https://router.project-osrm.org',
    'https://osrm.openstreetmap.fr',
    'https://valhalla1.openstreetmap.de/route',
  ];
  
  const REQUEST_TIMEOUT = 10000;
  
  const fetchWithTimeout = async (url: RequestInfo, init?: RequestInit, timeout = REQUEST_TIMEOUT) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...(init || {}), signal: controller.signal } as RequestInit);
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  const isValhalla = (host: string) => host.includes('valhalla');
  
  // Build Valhalla request JSON
  const buildValhallaRequest = (start: Coordinate, end: Coordinate, mode: string, waypoints?: Coordinate[]) => {
    const costing = mode === 'walking' ? 'pedestrian' : mode === 'bicycling' ? 'bicycle' : 'auto';
    
    const locations = [
      { lon: start.longitude, lat: start.latitude, type: "break" }
    ];
    
    if (waypoints) {
      waypoints.forEach(wp => {
        locations.push({ lon: wp.longitude, lat: wp.latitude, type: "break" });
      });
    }
    
    locations.push({ lon: end.longitude, lat: end.latitude, type: "break" });
    
    return {
      costing,
      costing_options: {
        [costing]: {
          maneuver_penalty: 5,
          country_crossing_penalty: 0,
          country_crossing_cost: 600,
          use_highways: 1,
          use_tolls: 1,
          use_ferry: 1,
          ferry_cost: 300,
          shortest: false,
          top_speed: 140,
        }
      },
      exclude_polygons: [],
      locations,
      units: "kilometers",
      alternates: options.alternatives ? 1 : 0,
      id: "valhalla_directions"
    };
  };

  // Parse Valhalla response to OSRM-like format
  const parseValhallaResponse = (data: any) => {
    if (!data.trip || !data.trip.legs || !data.trip.legs[0]) {
      return null;
    }

    const leg = data.trip.legs[0];
    const shape = data.trip.legs[0].shape;
    
    // Decode Valhalla polyline
    const decodePolyline = (encoded: string) => {
      const coords: [number, number][] = [];
      let index = 0, lat = 0, lng = 0;
      
      while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        
        shift = 0;
        result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        
        coords.push([lng / 1e6, lat / 1e6]);
      }
      
      return coords;
    };

    const coordinates = shape ? decodePolyline(shape) : [];
    
    return {
      routes: [{
        geometry: {
          coordinates,
          type: "LineString"
        },
        duration: leg.time || 0,
        distance: (leg.length || 0) * 1000,
        legs: [{
          steps: leg.maneuvers?.map((maneuver: any) => ({
            instruction: maneuver.instruction || "",
            distance: (maneuver.length || 0) * 1000,
            duration: maneuver.time || 0,
            maneuver: {
              type: maneuver.type === 1 ? "depart" : maneuver.type === 4 ? "arrive" : "continue"
            }
          })) || []
        }]
      }]
    };
  };

  // Créer des paires de hosts pour les requêtes parallèles
  const hostPairs: string[][] = [];
  for (let i = 0; i < DEFAULT_HOSTS.length; i += 2) {
    if (i + 1 < DEFAULT_HOSTS.length) {
      hostPairs.push([DEFAULT_HOSTS[i], DEFAULT_HOSTS[i + 1]]);
    } else {
      hostPairs.push([DEFAULT_HOSTS[i]]);
    }
  }

  // Fonction pour faire une requête vers un host
  const tryHost = async (host: string): Promise<{ success: boolean; data?: any; host: string }> => {
    try {
      if (isValhalla(host)) {
        const requestBody = buildValhallaRequest(start, end, mode, options.waypoints);
        const url = `${host}?json=${encodeURIComponent(JSON.stringify(requestBody))}`;
        const res = await fetchWithTimeout(url, { method: 'GET' });
        
        if (!res.ok) return { success: false, host };
        
        const valhallaData = await res.json();
        const osrmData = parseValhallaResponse(valhallaData);
        if (osrmData?.routes?.length) {
          return { success: true, data: osrmData, host };
        }
        return { success: false, host };
      } else {
        // OSRM-style hosts
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        let coordinates: string;
        
        if (options.waypoints && options.waypoints.length > 0) {
          // Multi-waypoint route
          const allPoints = [start, ...options.waypoints, end];
          coordinates = allPoints.map(point => `${point.longitude},${point.latitude}`).join(';');
        } else {
          coordinates = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
        }
        
        const alternativesParam = options.alternatives ? '&alternatives=true' : '';
        const url = `${host}/route/v1/${osrmMode}/${coordinates}?overview=full&geometries=geojson&steps=true${alternativesParam}`;
        const res = await fetchWithTimeout(url);
        
        if (!res.ok) return { success: false, host };
        
        const data = await res.json();
        if (data?.routes?.length) {
          return { success: true, data, host };
        }
        return { success: false, host };
      }
    } catch (err) {
      console.warn('fetchParallelRouting host failed', { host, err });
      return { success: false, host };
    }
  };

  // Tester les paires de hosts en parallèle
  for (const pair of hostPairs) {
    try {
      const promises = pair.map(host => tryHost(host));
      const results = await Promise.allSettled(promises);

      // Chercher la première réponse réussie
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          return { 
            success: true, 
            data: result.value.data, 
            host: result.value.host 
          };
        }
      }
    } catch (err) {
      console.warn('Error in parallel requests for pair:', pair, err);
    }
  }

  console.warn('❌ All routing hosts failed in fetchParallelRouting');
  return { success: false };
}