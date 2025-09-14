export interface NominatimAddress {
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  road?: string;
  house_number?: string;
}

export interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: NominatimAddress;
  boundingbox: string[];
}

export interface NominatimReverseResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: NominatimAddress;
}

export class NominatimService {
  private static readonly BASE_URL = 'https://nominatim.openstreetmap.org';
  private static readonly DEFAULT_HEADERS = {
    'User-Agent': 'LMC-Maps/1.0.0',
    'Referer': 'https://lmcgroup.xyz/'
  };

  
  static async search(query: string, options?: {
    limit?: number;
    countryCode?: string;
    bounded?: boolean;
    viewbox?: string;
  }): Promise<NominatimSearchResult[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: (options?.limit || 5).toString()
      });

      if (options?.countryCode) {
        params.append('countrycodes', options.countryCode);
      }

      if (options?.bounded) {
        params.append('bounded', '1');
      }

      if (options?.viewbox) {
        params.append('viewbox', options.viewbox);
      }

      const response = await fetch(
        `${this.BASE_URL}/search?${params.toString()}`,
        { headers: this.DEFAULT_HEADERS }
      );

      if (!response.ok) {
        throw new Error(`Nominatim search failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }

  
  static async reverse(lat: number, lon: number, options?: {
    zoom?: number;
    addressDetails?: boolean;
  }): Promise<NominatimReverseResult | null> {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
        zoom: (options?.zoom || 18).toString(),
        addressdetails: (options?.addressDetails !== false ? '1' : '0')
      });

      const response = await fetch(
        `${this.BASE_URL}/reverse?${params.toString()}`,
        { headers: this.DEFAULT_HEADERS }
      );

      if (!response.ok) {
        throw new Error(`Nominatim reverse failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  
  static getAdaptiveZoom(address: NominatimAddress): number {
    if (address.road) {
      const road = address.road.toLowerCase();

      if (
        road.includes('autoroute') ||
        (road.startsWith('a') && /^\d+$/.test(road.slice(1))) ||
        road.includes('motorway')
      ) {
        return 10;
      }

      if (
        (road.startsWith('n') && /^\d+$/.test(road.slice(1))) ||
        road.includes('route nationale') ||
        road.includes('national road')
      ) {
        return 17;
      }

      if (
        (road.startsWith('d') && /^\d+$/.test(road.slice(1))) ||
        road.includes('route départementale') ||
        road.includes('departmental road')
      ) {
        return 18;
      }

      if (
        (road.startsWith('c') && /^\d+$/.test(road.slice(1))) ||
        road.includes('rue') ||
        road.includes('street') ||
        road.includes('chemin') ||
        road.includes('impasse') ||
        road.includes('alley') ||
        road.includes('lane')
      ) {
        return 19;
      }
    }

    if (address.city || address.town || address.municipality) {
      return 18;
    }

    if (address.village || address.hamlet || address.suburb) {
      return 17;
    }

    if (address.county || address.state) {
      return 16;
    }

    return 15;
  }

  
  static async getZoomForLocation(lat: number, lon: number): Promise<number> {
    const result = await this.reverse(lat, lon, { zoom: 10 });
    
    if (result?.address) {
      return this.getAdaptiveZoom(result.address);
    }
    
    return 14;
  }

  
  static async searchCoordinates(query: string): Promise<{
    latitude: number;
    longitude: number;
    displayName: string;
  } | null> {
    const results = await this.search(query, { limit: 1 });
    
    if (results.length > 0) {
      const result = results[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        displayName: result.display_name
      };
    }
    
    return null;
  }

  
  static formatAddress(address: NominatimAddress): string {
    const parts: string[] = [];
    
    if (address.house_number && address.road) {
      parts.push(`${address.house_number} ${address.road}`);
    } else if (address.road) {
      parts.push(address.road);
    }
    
    if (address.city || address.town || address.village) {
      parts.push(address.city || address.town || address.village!);
    }
    
    if (address.postcode) {
      parts.push(address.postcode);
    }
    
    if (address.country) {
      parts.push(address.country);
    }
    
    return parts.join(', ');
  }
}

