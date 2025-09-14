export type LatLng = { latitude: number; longitude: number };

const toRad = (x: number) => (x * Math.PI) / 180;

export function getDistanceMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const aVal = s1 * s1 + s2 * s2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
}

export function getDistanceBetweenPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeBearingTo(from: LatLng, to: LatLng) {
  const toRadLocal = (d: number) => (d * Math.PI) / 180;
  const toDeg = (d: number) => (d * 180) / Math.PI;
  const lat1 = toRadLocal(from.latitude);
  const lat2 = toRadLocal(to.latitude);
  const dLon = toRadLocal(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return brng;
}
