import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedMapState {
  latitude: number;
  longitude: number;
  zoomLevel: number;
  timestamp: number;
}

const LAST_MAP_POSITION_KEY = 'last_map_position';
const DEFAULT_POSITION = {
  latitude: 48.8566,
  longitude: 2.3522,
  zoomLevel: 10,
};

export class MapStorageService {
  
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
    }
  }

  
  static async loadLastMapPosition(): Promise<SavedMapState> {
    try {
      const savedPosition = await AsyncStorage.getItem(LAST_MAP_POSITION_KEY);
      
      if (savedPosition) {
        const parsedPosition: SavedMapState = JSON.parse(savedPosition);
        
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        if (parsedPosition.timestamp && parsedPosition.timestamp > thirtyDaysAgo) {return parsedPosition;
        } else {}
      } else {}
    } catch (error) {
    }

    return {
      ...DEFAULT_POSITION,
      timestamp: Date.now(),
    };
  }

  
  static async clearSavedPosition(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LAST_MAP_POSITION_KEY);} catch (error) {
    }
  }

  
  static getMapboxCoordinates(mapState: SavedMapState): [number, number] {
    return [mapState.longitude, mapState.latitude];
  }
}

