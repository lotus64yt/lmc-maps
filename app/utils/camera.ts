import { Dimensions } from "react-native";

export type Coordinate = { latitude: number; longitude: number };

export function getAdjustedCoordinate(
  coordinate: Coordinate,
  zoomLevel?: number,
  pitch?: number,
  drawerHeight: number = 0,
  marginPx: number = 80
) {
  const screenHeight = Dimensions.get("window").height;
  if (!drawerHeight || drawerHeight <= 0) {
    return { latitude: coordinate.latitude, longitude: coordinate.longitude, pitch: pitch || 0 } as any;
  }
  const margin = marginPx;
  let desiredY = screenHeight - drawerHeight - margin;
  const minY = 40;
  const maxY = screenHeight - drawerHeight - 10;
  if (desiredY < minY) desiredY = minY;
  if (desiredY > maxY) desiredY = maxY;
  const screenCenterY = screenHeight / 2;
  const pixelOffset = desiredY - screenCenterY;
  const usedZoom = zoomLevel || 13;
  const latRad = (coordinate.latitude * Math.PI) / 180;
  const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, usedZoom);
  const metersPerDegreeLat = 111320;
  const offsetMeters = pixelOffset * metersPerPixel;
  const offsetLat = offsetMeters / metersPerDegreeLat;
  const DAMPING = 0.01;
  const MAX_OFFSET_DEG = 0.001;
  const raw = offsetLat * DAMPING;
  const clamped = Math.sign(raw) * Math.min(Math.abs(raw), MAX_OFFSET_DEG);
  return { latitude: coordinate.latitude + clamped, longitude: coordinate.longitude, pitch: pitch || 0 } as any;
}
