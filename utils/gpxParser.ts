// Very small GPX parser: extracts waypoints and track points (lat/lon)
export interface GPXPoint {
  latitude: number;
  longitude: number;
  name?: string;
}

export function parseGPX(gpxText: string): { waypoints: GPXPoint[]; track: GPXPoint[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'application/xml');

  const wpts: GPXPoint[] = [];
  const trkpts: GPXPoint[] = [];

  const wptNodes = doc.getElementsByTagName('wpt');
  for (let i = 0; i < wptNodes.length; i++) {
    const n = wptNodes[i];
    const lat = parseFloat(n.getAttribute('lat') || '0');
    const lon = parseFloat(n.getAttribute('lon') || '0');
    const nameNode = n.getElementsByTagName('name')[0];
    wpts.push({ latitude: lat, longitude: lon, name: nameNode ? nameNode.textContent || undefined : undefined });
  }

  const trkptNodes = doc.getElementsByTagName('trkpt');
  for (let i = 0; i < trkptNodes.length; i++) {
    const n = trkptNodes[i];
    const lat = parseFloat(n.getAttribute('lat') || '0');
    const lon = parseFloat(n.getAttribute('lon') || '0');
    trkpts.push({ latitude: lat, longitude: lon });
  }

  return { waypoints: wpts, track: trkpts };
}
