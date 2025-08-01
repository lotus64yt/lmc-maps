// Service pour récupérer les informations de parking à Paris
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

  // Vérifier si on est dans Paris
  isInParis(latitude: number, longitude: number): boolean {
    return latitude >= this.PARIS_BOUNDS.south &&
           latitude <= this.PARIS_BOUNDS.north &&
           longitude >= this.PARIS_BOUNDS.west &&
           longitude <= this.PARIS_BOUNDS.east;
  }

  // Rechercher des parkings à proximité
  async findNearbyParkings(
    latitude: number, 
    longitude: number, 
    radiusKm: number = 1
  ): Promise<ParkingSearchResult> {if (!this.isInParis(latitude, longitude)) {
      throw new Error('Le service de parking n\'est disponible qu\'à Paris');
    }

    const parkings: ParkingSpot[] = [];

    try {
      // 1. API Open Data Paris - Parkings publics
      const parisData = await this.fetchParisOpenData(latitude, longitude, radiusKm);
      parkings.push(...parisData);

      // 2. API ParkingList (gratuite pour informations de base)
      const parkingListData = await this.fetchParkingListData(latitude, longitude, radiusKm);
      parkings.push(...parkingListData);

      // 3. Overpass API pour parkings de rue
      const streetParkings = await this.fetchStreetParkingsOverpass(latitude, longitude, radiusKm);
      parkings.push(...streetParkings);

      // Trier par distance
      const sortedParkings = parkings
        .map(parking => ({
          ...parking,
          distance: this.calculateDistance(latitude, longitude, parking.coordinate.latitude, parking.coordinate.longitude)
        }))
        .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        .slice(0, 20); // Limiter à 20 résultatsreturn {
        parkings: sortedParkings,
        searchLocation: { latitude, longitude }
      };
    } catch (error) {
      console.error('🅿️ Erreur lors de la recherche de parkings:', error);
      throw error;
    }
  }

  // API Open Data Paris
  private async fetchParisOpenData(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      // API des parkings de la ville de Paris
      const response = await fetch(
        `https://opendata.paris.fr/api/records/1.0/search/?dataset=stationnement-voie-publique-emplacements&geofilter.distance=${lat},${lon},${radius * 1000}&rows=50`
      );

      if (!response.ok) {
        console.warn('🅿️ API Paris Open Data non disponible');
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
      }return parkings;
    } catch (error) {
      console.error('🅿️ Erreur API Paris Open Data:', error);
      return [];
    }
  }

  // API ParkingList (gratuite)
  private async fetchParkingListData(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      // Simuler des données de parking depuis diverses sources
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

      // Filtrer par distance
      const nearbyParkings = mockParkings.filter(parking => {
        const distance = this.calculateDistance(lat, lon, parking.coordinate.latitude, parking.coordinate.longitude);
        return distance <= radius;
      });return nearbyParkings;
    } catch (error) {
      console.error('🅿️ Erreur données parking mock:', error);
      return [];
    }
  }

  // Overpass API pour parkings de rue
  private async fetchStreetParkingsOverpass(lat: number, lon: number, radius: number): Promise<ParkingSpot[]> {
    try {
      const radiusMeters = radius * 1000;
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="parking"](around:${radiusMeters},${lat},${lon});
          way["amenity"="parking"](around:${radiusMeters},${lat},${lon});
        );
        out geom;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
      });

      if (!response.ok) {
        console.warn('🅿️ Overpass API non disponible');
        return [];
      }

      const data = await response.json();
      const parkings: ParkingSpot[] = [];

      if (data.elements) {
        for (const element of data.elements) {
          let coordinate;
          
          if (element.type === 'node') {
            coordinate = { latitude: element.lat, longitude: element.lon };
          } else if (element.type === 'way' && element.geometry) {
            // Prendre le centre du way
            const firstPoint = element.geometry[0];
            coordinate = { latitude: firstPoint.lat, longitude: firstPoint.lon };
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
      }return parkings;
    } catch (error) {
      console.error('🅿️ Erreur Overpass API:', error);
      return [];
    }
  }

  // Obtenir des informations détaillées et position exacte d'une place libre
  async getExactParkingSpot(parking: ParkingSpot): Promise<ParkingSpot | null> {try {
      // Simuler la recherche d'une place exacte
      // En réalité, cela dépendrait de l'API du fournisseur de parking
      
      if (parking.provider === 'Q-Park' || parking.provider === 'Saemes') {
        // Simuler une place exacte près de l'entrée
        const offset = 0.0001; // ~10 mètres
        const exactSpot = {
          ...parking,
          exactSpotCoordinate: {
            latitude: parking.coordinate.latitude + (Math.random() - 0.5) * offset,
            longitude: parking.coordinate.longitude + (Math.random() - 0.5) * offset
          }
        };return exactSpot;
      }

      // Pour les parkings de rue, retourner les coordonnées d'entrée
      return parking;
    } catch (error) {
      console.error('🅿️ Erreur recherche place exacte:', error);
      return parking;
    }
  }

  // Calculer la distance entre deux points
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Rayon de la Terre en mètres
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

  // Formater la distance pour affichage
  formatDistance(distanceM: number): string {
    if (distanceM < 1000) {
      return `${Math.round(distanceM)} m`;
    } else {
      return `${(distanceM / 1000).toFixed(1)} km`;
    }
  }

  // Obtenir l'icône selon le type de parking
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
