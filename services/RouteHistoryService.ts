import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HistoryItem {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  searchCount: number;
}

const HISTORY_KEY = '@route_history';
const MAX_HISTORY_ITEMS = 20;

export class RouteHistoryService {
  
  static async getHistory(): Promise<HistoryItem[]> {
    try {
      const historyJson = await AsyncStorage.getItem(HISTORY_KEY);
      if (historyJson) {
        const history: HistoryItem[] = JSON.parse(historyJson);
        return history.sort((a, b) => {
          if (a.searchCount !== b.searchCount) {
            return b.searchCount - a.searchCount;
          }
          return b.timestamp - a.timestamp;
        });
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  
  static async addToHistory(item: Omit<HistoryItem, 'id' | 'timestamp' | 'searchCount'>): Promise<void> {
    try {
      const history = await this.getHistory();
      
      const existingIndex = history.findIndex(
        h => Math.abs(h.latitude - item.latitude) < 0.0001 && 
             Math.abs(h.longitude - item.longitude) < 0.0001
      );

      if (existingIndex !== -1) {
        history[existingIndex] = {
          ...history[existingIndex],
          title: item.title,
          subtitle: item.subtitle,
          timestamp: Date.now(),
          searchCount: history[existingIndex].searchCount + 1
        };
      } else {
        const newItem: HistoryItem = {
          ...item,
          id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          searchCount: 1
        };
        history.unshift(newItem);
      }

      const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS);
      
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmedHistory));
    } catch (error) {
    }
  }

  
  static async removeFromHistory(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const filteredHistory = history.filter(item => item.id !== id);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(filteredHistory));
    } catch (error) {
    }
  }

  
  static async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
    } catch (error) {
    }
  }

  
  static filterByLocation(
    history: HistoryItem[], 
    centerLat: number, 
    centerLon: number, 
    radiusKm: number = 50
  ): HistoryItem[] {
    return history.filter(item => {
      const distance = this.calculateDistance(
        centerLat, centerLon, 
        item.latitude, item.longitude
      );
      return distance <= radiusKm;
    });
  }

  
  private static calculateDistance(
    lat1: number, lon1: number, 
    lat2: number, lon2: number
  ): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

