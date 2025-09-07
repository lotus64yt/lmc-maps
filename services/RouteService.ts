import { useState } from 'react';

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

export interface RouteService {
  routeCoords: Coordinate[];
  destination: Coordinate | null;
  routeInfo: RouteInfo | null;
  isCalculating: boolean;
  isOsrmAvailable: boolean;
  lastOsrmCheck?: number;
  routingHost: string;
  getRoute: (start: Coordinate, end: Coordinate, mode?: string) => Promise<boolean>;
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
}

export type TransportMode = 'driving' | 'walking' | 'bicycling';

const DEFAULT_OSRM_HOSTS = ['https://routing.openstreetmap.de/routed-car', 'https://routing.openstreetmap.de'];

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

  const [directLineCoords, setDirectLineCoords] = useState<Coordinate[]>([]);
  const [nearestRoadPoint, setNearestRoadPoint] = useState<Coordinate | null>(null);
  const [hasDirectLineSegment, setHasDirectLineSegment] = useState(false);

  const ORS_API_KEY = (global as any)?.OPENROUTESERVICE_API_KEY || process?.env?.OPENROUTESERVICE_API_KEY || process?.env?.ORS_API_KEY || getORSKey();
  const isOpenRouteService = (host: string) => host.includes('openrouteservice.org');
  const getRoutingHosts = (): string[] => {
    const hosts = [...DEFAULT_OSRM_HOSTS];
    if (ORS_API_KEY) hosts.push('https://api.openrouteservice.org');
    return hosts;
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
    return d === Infinity ? false : d > tolerance;
  };

  const isOnRoute = (currentLocation: Coordinate, tolerance = 50) => {
    if (!routeCoords || routeCoords.length < 2) return false;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      if (calculateDistanceToLineSegment(currentLocation, a, b) <= tolerance) return true;
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

  const getRoute = async (start: Coordinate, end: Coordinate, mode = 'driving') => {
    setIsCalculating(true);
    setLastRequestTimings([]);
    try {
      const osrmMode = mode === 'bicycling' ? 'bike' : mode;
      for (const host of getRoutingHosts()) {
        const startTs = Date.now();
        try {
          if (isOpenRouteService(host)) {
            if (!ORS_API_KEY) { setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); continue; }
            const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
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
              setRouteCoords(coords); setDestination(end);
              setRouteInfo({ duration: Math.round((route.properties?.summary?.duration ?? 0) / 60), distance: Math.round(route.properties?.summary?.distance ?? 0), instruction: 'Suivre l\'itinéraire' });
              return true;
            }
          } else {
            const url = `${host}/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
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
              setRouteCoords(coords); setDestination(end);
              setRouteInfo({ duration: Math.round(route.duration / 60), distance: Math.round(route.distance), instruction: 'Suivre l\'itinéraire' });
              return true;
            }
          }
        } catch (err) {
          const duration = Date.now() - startTs;
          setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
          console.warn('getRoute host failed', { host, duration, err });
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

  const getHybridRoute = async (start: Coordinate, end: Coordinate, mode = 'driving') => {
    setIsCalculating(true);
    setLastRequestTimings([]);
    try {
      const correctedStart = await correctPositionToRoad(start, mode);
      const nearestStart = await findNearestRoadPoint(correctedStart, mode);
      if (!nearestStart) return false;
      const distanceToRoad = calculateDistance(correctedStart, nearestStart);

      let finalRouteCoords: Coordinate[] = [];
      let hasDirectLine = false;

      if (distanceToRoad > 100) {
        hasDirectLine = true;
        setDirectLineCoords([correctedStart, nearestStart]);
        setNearestRoadPoint(nearestStart);
        // request route from nearestStart to end
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        for (const host of getRoutingHosts()) {
          const startTs = Date.now();
          try {
            if (isOpenRouteService(host)) {
              if (!ORS_API_KEY) { setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); continue; }
              const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
              const url = `${host}/v2/directions/${profile}?start=${nearestStart.longitude},${nearestStart.latitude}&end=${end.longitude},${end.latitude}`;
              const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', Authorization: ORS_API_KEY } });
              const duration = Date.now() - startTs;
              const ok = res.ok;
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'directions' }]);
              if (!ok) continue;
              if (data?.features?.length) { finalRouteCoords = data.features[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })); break; }
            } else {
              const url = `${host}/route/v1/${osrmMode}/${nearestStart.longitude},${nearestStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
              const res = await fetchWithTimeout(url);
              const duration = Date.now() - startTs;
              const ok = res.ok;
              let data: any = null;
              try { data = await res.json(); } catch { /* ignore */ }
              setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: ok, endpoint: 'route' }]);
              if (!ok) continue;
              if (data?.routes?.length) { finalRouteCoords = data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })); break; }
            }
          } catch (err) {
            const duration = Date.now() - startTs;
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
            continue;
          }
        }
      } else {
        // close to road: request full route from correctedStart
        const osrmMode = mode === 'bicycling' ? 'bike' : mode;
        for (const host of getRoutingHosts()) {
          const startTs = Date.now();
          try {
            if (isOpenRouteService(host)) {
              if (!ORS_API_KEY) { setLastRequestTimings(prev => [...prev, { host, durationMs: 0, success: false, endpoint: 'directions' }]); continue; }
              const profile = osrmMode === 'bike' ? 'cycling-regular' : osrmMode === 'walking' ? 'foot-walking' : 'driving-car';
              const url = `${host}/v2/directions/${profile}?start=${correctedStart.longitude},${correctedStart.latitude}&end=${end.longitude},${end.latitude}`;
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
                const routeCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }));
                setLastRawRouteData(data); setRouteCoords(routeCoords);
                setRouteInfo({ duration: Math.round((route.properties?.summary?.duration ?? 0) / 60), distance: Math.round(route.properties?.summary?.distance ?? 0), instruction: 'Suivre l\'itinéraire' });
                setDirectLineCoords([]); setNearestRoadPoint(null);
                break;
              }
            } else {
              const url = `${host}/route/v1/${osrmMode}/${correctedStart.longitude},${correctedStart.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
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
                const routeCoords = route.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }));
                setLastRawRouteData(data); setRouteCoords(routeCoords);
                setRouteInfo({ duration: Math.round(route.duration / 60), distance: Math.round(route.distance), instruction: 'Suivre l\'itinéraire' });
                setDirectLineCoords([]); setNearestRoadPoint(null);
                break;
              }
            }
          } catch (err) {
            const duration = Date.now() - startTs;
            setLastRequestTimings(prev => [...prev, { host, durationMs: duration, success: false }]);
            continue;
          }
        }
      }

      if (finalRouteCoords && finalRouteCoords.length) {
        setLastRawRouteData(null);
        setRouteCoords(finalRouteCoords);
        setDestination(end);
        setHasDirectLineSegment(hasDirectLine);
        return true;
      }

      return false;
    } catch (err) {
      setIsOsrmAvailable(false);
      return false;
    } finally {
      setIsCalculating(false);
    }
  };

  const recalculateIfOffRoute = async (currentLocation: Coordinate, mode: string = 'driving') => {
    if (!destination) return false;
  // Use a default 20m tolerance for off-route detection to match requested behavior.
  const OFF_ROUTE_TOLERANCE = 20;
    const onRoute = isOnRoute(currentLocation, OFF_ROUTE_TOLERANCE);
    if (!onRoute) {
      const nearestOnRoute = getNearestPointOnRoute(currentLocation);
      const startForRecalc = nearestOnRoute || currentLocation;
      const ok = await getHybridRoute(startForRecalc, destination, mode);
      return ok ? startForRecalc : false;
    }
    return false;
  };

  const clearRoute = () => {
    setRouteCoords([]); setDestination(null); setRouteInfo(null); setDirectLineCoords([]); setNearestRoadPoint(null); setHasDirectLineSegment(false);
  };

  const clearRouteKeepDestination = () => {
    setRouteCoords([]); setRouteInfo(null); setDirectLineCoords([]); setNearestRoadPoint(null); setHasDirectLineSegment(false);
  };

  const handleDestinationChange = (d: Coordinate | null) => setDestination(d);

  return {
    routeCoords,
    destination,
    routeInfo,
    isCalculating,
    isOsrmAvailable,
    lastOsrmCheck,
    routingHost,
    lastRequestTimings,
    lastRawRouteData,
    getRoute,
    getMultiStepRoute,
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
  };
}