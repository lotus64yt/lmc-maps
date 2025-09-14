export class SpeedLimitService {
  static async getSpeedLimit(lat: number, lon: number): Promise<string | null> {
    const query = `
      [out:json][timeout:10];
      way(around:30,${lat},${lon})[maxspeed];
      out tags center 1;
    `;
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data.elements && data.elements.length > 0) {
        const maxspeed = data.elements[0].tags?.maxspeed;
        return maxspeed || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
