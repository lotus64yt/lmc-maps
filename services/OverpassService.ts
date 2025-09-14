export interface OverpassPOI {
  id: string;
  lat: number;
  lon: number;
  tags: {
    name?: string;
    amenity?: string;
    shop?: string;
    tourism?: string;
    cuisine?: string;
    opening_hours?: string;
    phone?: string;
    website?: string;
    addr_street?: string;
    addr_housenumber?: string;
    addr_city?: string;
    brand?: string;
    operator?: string;
  };
  distance?: number;
}

export interface OverpassResponse {
  elements: OverpassPOI[];
}

export class OverpassService {
  private static readonly BASE_URL = 'https://overpass-api.de/api/interpreter';

  
  static async searchPOI(
    lat: number,
    lon: number,
    radius: number,
    amenityType: string
  ): Promise<OverpassPOI[]> {
    try {
      let query: string;
      
      if (amenityType === '*') {
        query = `
          [out:json][timeout:25];
          (
            node["amenity"](around:${radius},${lat},${lon});
            way["amenity"](around:${radius},${lat},${lon});
            relation["amenity"](around:${radius},${lat},${lon});
          );
          out center meta;
        `;
      } else {
        query = `
          [out:json][timeout:25];
          (
            node["amenity"="${amenityType}"](around:${radius},${lat},${lon});
            way["amenity"="${amenityType}"](around:${radius},${lat},${lon});
            relation["amenity"="${amenityType}"](around:${radius},${lat},${lon});
          );
          out center meta;
        `;
      }

      const response = await fetch(this.BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data: OverpassResponse = await response.json();
      
      const poisWithDistance = data.elements
        .filter(poi => poi.lat != null && poi.lon != null && !isNaN(poi.lat) && !isNaN(poi.lon))
        .map(poi => ({
        ...poi,
        distance: this.calculateDistance(lat, lon, poi.lat, poi.lon)
      }));

      return poisWithDistance.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    } catch (error) {
      throw error;
    }
  }

  
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  
  static formatPOIName(poi: OverpassPOI): string {
    if (poi.tags.name) {
      return poi.tags.name;
    }
    
    if (poi.tags.brand) {
      return poi.tags.brand;
    }
    
    if (poi.tags.operator) {
      return poi.tags.operator;
    }
    
    return poi.tags.amenity || 'POI sans nom';
  }

  
  static formatPOIAddress(poi: OverpassPOI): string {
    const parts = [];
    
    if (poi.tags.addr_housenumber) {
      parts.push(poi.tags.addr_housenumber);
    }
    
    if (poi.tags.addr_street) {
      parts.push(poi.tags.addr_street);
    }
    
    if (poi.tags.addr_city) {
      parts.push(poi.tags.addr_city);
    }
    
    return parts.length > 0 ? parts.join(' ') : '';
  }
}

