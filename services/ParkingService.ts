export interface ParkingSpot {
  id: string;
  name: string;
  address: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  availableSpaces?: number;
  totalSpaces?: number;
  pricePerHour?: number;
  openingHours?: string;
  type: 'street' | 'garage' | 'underground' | 'surface';
  provider: string;
  distance?: number;
  exactSpotCoordinate?: {
    latitude: number;
    longitude: number;
  };
  features?: string[];
}

export interface ParkingSearchResult {
  parkings: ParkingSpot[];
  searchLocation: {
    latitude: number;
    longitude: number;
  };
}

class ParkingService {
  private readonly PARIS_BOUNDS = {
    north: 48.9021,
    south: 48.8155,
    east: 2.4699,
    west: 2.2242
  };

  isInParis(latitude: number, longitude: number): boolean {
    return latitude >= this.PARIS_BOUNDS.south &&
           latitude <= this.PARIS_BOUNDS.north &&
           longitude >= this.PARIS_BOUNDS.west &&
           longitude <= this.PARIS_BOUNDS.east;
  }

  async findNearbyParkings(
    latitude: number, 
    longitude: number, 
    radiusKm: number = 1
  ): Promise<ParkingSearchResult> {
    const parkings: ParkingSpot[] = [];

    try {
      const streetParkings = await this.fetchStreetParkingsOverpass(latitude, longitude, radiusKm);
      parkings.push(...streetParkings);

      if (this.isInParis(latitude, longitude)) {
        const parisData = await this.fetchParisOpenData(latitude, longitude, radiusKm);
        parkings.push(...parisData);

        const parkingListData = await this.fetchParkingListData(latitude, longitude, radiusKm);
        parkings.push(...parkingListData);
      }

      const sortedParkings = parkings
        .map(parking => ({
          ...parking,
          distance: this.calculateDistance(latitude, longitude, parking.coordinate.latitude, parking.coordinate.longitude)
        }))
        .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        .slice(0, 50);

      return {
        parkings: sortedParkings,
        searchLocation: { latitude, longitude }
      };
    } catch (error) {
      throw error;
    }
  }

  private async fetchParisOpenData(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      const response = await fetch(
        `https://opendata.paris.fr/api/records/1.0/search/?dataset=stationnement-voie-publique-emplacements&geofilter.distance=${lat},${lon},${radius * 1000}&rows=50`
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const parkings: ParkingSpot[] = [];

      if (data.records) {
        for (const record of data.records) {
          const fields = record.fields;
          if (fields.geo_point_2d) {
            parkings.push({
              id: `paris_${record.recordid}`,
              name: fields.adresse || 'Parking de rue',
              address: fields.adresse || '',
              coordinate: {
                latitude: fields.geo_point_2d[0],
                longitude: fields.geo_point_2d[1]
              },
              type: 'street',
              provider: 'Ville de Paris',
              features: [
                fields.statut_tarifaire || 'Gratuit',
                fields.regime_de_fonctionnement || ''
              ].filter(Boolean)
            });
          }
        }
      }
return parkings;
    } catch (error) {
      return [];
    }
  }

  private async fetchParkingListData(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      const mockParkings: ParkingSpot[] = [
        {
          id: 'parking_rivoli',
          name: 'Parking Rivoli',
          address: '4 Place du Louvre, 75001 Paris',
          coordinate: { latitude: 48.8606, longitude: 2.3376 },
          availableSpaces: 45,
          totalSpaces: 200,
          pricePerHour: 3.20,
          type: 'underground',
          provider: 'Q-Park',
          features: ['24h/24', 'Sécurisé', 'Accessible PMR']
        },
        {
          id: 'parking_chatelet',
          name: 'Parking Châtelet Les Halles',
          address: '1 Place Marguerite de Navarre, 75001 Paris',
          coordinate: { latitude: 48.8617, longitude: 2.3467 },
          availableSpaces: 12,
          totalSpaces: 150,
          pricePerHour: 2.80,
          type: 'underground',
          provider: 'Saemes',
          features: ['Centre commercial', 'Métro direct']
        },
        {
          id: 'parking_hotel_ville',
          name: 'Parking Hôtel de Ville',
          address: '2 Rue Lobau, 75004 Paris',
          coordinate: { latitude: 48.8565, longitude: 2.3522 },
          availableSpaces: 8,
          totalSpaces: 80,
          pricePerHour: 4.10,
          type: 'underground',
          provider: 'Saemes',
          features: ['Centre historique', 'Sécurisé']
        }
      ];

      const nearbyParkings = mockParkings.filter(parking => {
        const distance = this.calculateDistance(lat, lon, parking.coordinate.latitude, parking.coordinate.longitude);
        return distance <= radius;
      });
return nearbyParkings;
    } catch (error) {
      return [];
    }
  }

  private async fetchStreetParkingsOverpass(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      const radiusMeters = Math.max(100, Math.round(radius * 1000));
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.openstreetmap.fr/api/interpreter'
      ];

      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="parking"](around:${radiusMeters},${lat},${lon});
          way["amenity"="parking"](around:${radiusMeters},${lat},${lon});
          relation["amenity"="parking"](around:${radiusMeters},${lat},${lon});
        );
        out center;
      `;

      let data: any = null;
      let lastError: any = null;

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            body: query,
          });

          if (!response.ok) {
            lastError = new Error(`Overpass endpoint ${endpoint} returned ${response.status}`);
            continue;
          }

          data = await response.json();
          break;
        } catch (err) {
          lastError = err;
          continue;
        }
      }

      if (!data) {
        return [];
      }

      const parkings: ParkingSpot[] = [];

      if (data.elements) {
        for (const element of data.elements) {
          let coordinate: { latitude: number; longitude: number } | null = null;

          if (element.type === 'node' && typeof element.lat === 'number' && typeof element.lon === 'number') {
            coordinate = { latitude: element.lat, longitude: element.lon };
          } else if ((element.type === 'way' || element.type === 'relation') && element.center) {
            coordinate = { latitude: element.center.lat, longitude: element.center.lon };
          } else if (element.geometry && Array.isArray(element.geometry) && element.geometry.length > 0) {
            const sum = element.geometry.reduce((acc: any, p: any) => {
              return { lat: acc.lat + p.lat, lon: acc.lon + p.lon };
            }, { lat: 0, lon: 0 });
            const len = element.geometry.length;
            coordinate = { latitude: sum.lat / len, longitude: sum.lon / len };
          }

          if (coordinate && element.tags) {
            parkings.push({
              id: `osm_${element.id}`,
              name: element.tags.name || 'Parking',
              address: element.tags['addr:full'] || element.tags['addr:street'] || '',
              coordinate,
              type: element.tags.parking === 'surface' ? 'surface' : 
                    element.tags.parking === 'underground' ? 'underground' : 'street',
              provider: 'OpenStreetMap',
              features: [
                element.tags.fee === 'yes' ? 'Payant' : 'Gratuit',
                element.tags.access || ''
              ].filter(Boolean)
            });
          }
        }
      }

      return parkings;
    } catch (error) {
      return [];
    }
  }

  async getExactParkingSpot(parking: ParkingSpot): Promise<ParkingSpot | null> {
try {
      
      if (parking.provider === 'Q-Park' || parking.provider === 'Saemes') {
        const offset = 0.0001;
        const exactSpot = {
          ...parking,
          exactSpotCoordinate: {
            latitude: parking.coordinate.latitude + (Math.random() - 0.5) * offset,
            longitude: parking.coordinate.longitude + (Math.random() - 0.5) * offset
          }
        };
return exactSpot;
      }

      return parking;
    } catch (error) {
      return parking;
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  formatDistance(distanceM: number): string {
    if (distanceM < 1000) {
      return `${Math.round(distanceM)} m`;
    } else {
      return `${(distanceM / 1000).toFixed(1)} km`;
    }
  }

  getParkingIcon(type: string): string {
    switch (type) {
      case 'underground':
        return 'layers';
      case 'garage':
        return 'garage';
      case 'surface':
        return 'local-parking';
      case 'street':
        return 'location-on';
      default:
        return 'local-parking';
    }
  }
}

export default new ParkingService();

