import { useState, useCallback } from "react";

export type LatLng = { latitude: number; longitude: number };

type CacheShape = {
  routeData: any | null;
  navigationSteps: any[] | null;
  cacheKey: string | null;
};

function generateRouteCacheKey(
  start: LatLng,
  end: LatLng,
  mode: string,
  waypoints?: Array<LatLng>
): string {
  const startKey = `${start.latitude.toFixed(6)},${start.longitude.toFixed(6)}`;
  const endKey = `${end.latitude.toFixed(6)},${end.longitude.toFixed(6)}`;
  const waypointsKey = waypoints
    ? waypoints
        .map((wp) => `${wp.latitude.toFixed(6)},${wp.longitude.toFixed(6)}`)
        .join(";")
    : "";
  return `${startKey}-${endKey}-${mode}-${waypointsKey}`;
}

export function extractTotalDuration(routeData: any): number {
  try {
    if (routeData?.routes?.[0]) return routeData.routes[0].duration || 0;
    if (routeData?.features?.[0])
      return routeData.features[0].properties?.summary?.duration || 0;
    if (routeData?.trip?.summary) return routeData.trip.summary.time || 0;
  } catch {}
  return 0;
}

export function extractTotalDistance(routeData: any): number {
  try {
    if (routeData?.routes?.[0]) return routeData.routes[0].distance || 0;
    if (routeData?.features?.[0])
      return routeData.features[0].properties?.summary?.distance || 0;
    if (routeData?.trip?.summary) return routeData.trip.summary.length || 0;
  } catch {}
  return 0;
}

export function useRoutingCache() {
  const [cached, setCached] = useState<CacheShape>({
    routeData: null,
    navigationSteps: null,
    cacheKey: null,
  });

  const cacheNavigationData = useCallback(
    (
      start: LatLng,
      end: LatLng,
      mode: string,
      routeData: any,
      navigationSteps: any[],
      waypoints?: Array<LatLng>
    ) => {
      const cacheKey = generateRouteCacheKey(start, end, mode, waypoints);
      setCached({ routeData, navigationSteps, cacheKey });
    },
    []
  );

  const getCachedNavigationData = useCallback(
    (start: LatLng, end: LatLng, mode: string, waypoints?: Array<LatLng>) => {
      const cacheKey = generateRouteCacheKey(start, end, mode, waypoints);
      if (cached.cacheKey === cacheKey) return cached;
      return null;
    },
    [cached]
  );

  const clearNavigationCache = useCallback(() => {
    setCached({ routeData: null, navigationSteps: null, cacheKey: null });
  }, []);

  return {
    cacheNavigationData,
    getCachedNavigationData,
    clearNavigationCache,
    extractTotalDuration,
    extractTotalDistance,
  };
}
