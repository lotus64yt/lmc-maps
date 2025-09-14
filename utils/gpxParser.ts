export interface GPXPoint {
  latitude: number;
  longitude: number;
  name?: string;
  elevation?: number;
}
import { XMLParser } from 'fast-xml-parser';

export function parseGPX(gpxText: string): { waypoints: GPXPoint[]; track: GPXPoint[] } {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(gpxText);

  const wpts: GPXPoint[] = [];
  const trkpts: GPXPoint[] = [];

  const gpx = (doc as any)?.gpx;
  if (!gpx) {
    return { waypoints: wpts, track: trkpts };
  }

  const wptNode = (gpx as any).wpt;
  const wptArr = wptNode ? (Array.isArray(wptNode) ? wptNode : [wptNode]) : [];
  for (const n of wptArr) {
    const lat = parseFloat(n['@_lat'] ?? n['lat'] ?? '0');
    const lon = parseFloat(n['@_lon'] ?? n['lon'] ?? '0');
    const nameVal = (n as any).name;
    const name = typeof nameVal === 'string' ? nameVal : nameVal != null ? String(nameVal) : undefined;
    const eleRaw = (n as any).ele;
    const elevation = eleRaw != null && eleRaw !== '' && !isNaN(parseFloat(eleRaw)) ? parseFloat(eleRaw) : undefined;
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      wpts.push({ latitude: lat, longitude: lon, name, elevation });
    }
  }

  const trkNode = (gpx as any).trk;
  const trkArr = trkNode ? (Array.isArray(trkNode) ? trkNode : [trkNode]) : [];
  for (const t of trkArr) {
    const trksegNode = (t as any).trkseg;
    const segArr = trksegNode ? (Array.isArray(trksegNode) ? trksegNode : [trksegNode]) : [];
    for (const seg of segArr) {
      const trkptNode = (seg as any).trkpt;
      const ptsArr = trkptNode ? (Array.isArray(trkptNode) ? trkptNode : [trkptNode]) : [];
      for (const p of ptsArr) {
        const lat = parseFloat(p['@_lat'] ?? p['lat'] ?? '0');
        const lon = parseFloat(p['@_lon'] ?? p['lon'] ?? '0');
        const eleRaw = (p as any).ele;
        const elevation = eleRaw != null && eleRaw !== '' && !isNaN(parseFloat(eleRaw)) ? parseFloat(eleRaw) : undefined;
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          trkpts.push({ latitude: lat, longitude: lon, elevation });
        }
      }
    }
  }

  return { waypoints: wpts, track: trkpts };
}
