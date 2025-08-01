import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedMapState {
  latitude: number;
  longitude: number;
  zoomLevel: number;
  timestamp: number;
}

const LAST_MAP_POSITION_KEY = 'last_map_position';
const DEFAULT_POSITION = {
  latitude: 48.8566,  // Paris
  longitude: 2.3522,
  zoomLevel: 10,
};

export class MapStorageService {
  /**
   * Sauvegarder la position actuelle de la carte
   */
  static async saveMapPosition(
    latitude: number, 
    longitude: number, 
    zoomLevel: number = 15
  ): Promise<void> {
    try {
      const mapState: SavedMapState = {
        latitude,
        longitude,
        zoomLevel,
        timestamp: Date.now(),
      };
      
      await AsyncStorage.setItem(LAST_MAP_POSITION_KEY, JSON.stringify(mapState));} catch (error) {
      console.error('❌ Error saving map position:', error);
    }
  }

  /**
   * Charger la dernière position sauvegardée
   */
  static async loadLastMapPosition(): Promise<SavedMapState> {
    try {
      const savedPosition = await AsyncStorage.getItem(LAST_MAP_POSITION_KEY);
      
      if (savedPosition) {
        const parsedPosition: SavedMapState = JSON.parse(savedPosition);
        
        // Vérifier que la position n'est pas trop ancienne (plus de 30 jours)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        if (parsedPosition.timestamp && parsedPosition.timestamp > thirtyDaysAgo) {return parsedPosition;
        } else {}
      } else {}
    } catch (error) {
      console.error('❌ Error loading map position:', error);
    }

    // Retourner la position par défaut
    return {
      ...DEFAULT_POSITION,
      timestamp: Date.now(),
    };
  }

  /**
   * Effacer la position sauvegardée
   */
  static async clearSavedPosition(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LAST_MAP_POSITION_KEY);} catch (error) {
      console.error('❌ Error clearing map position:', error);
    }
  }

  /**
   * Obtenir les coordonnées sous forme de tableau [longitude, latitude] pour Mapbox
   */
  static getMapboxCoordinates(mapState: SavedMapState): [number, number] {
    return [mapState.longitude, mapState.latitude];
  }
}
