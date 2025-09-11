import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FavoriteItem {
  id: string;
  title: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  type?: string;
  createdAt?: number;
}

const FAVORITES_KEY = 'lmc_favorites_v1';

export class FavoritesService {
  static async listFavorites(): Promise<FavoriteItem[]> {
    try {
      const raw = await AsyncStorage.getItem(FAVORITES_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as FavoriteItem[];
    } catch (e) {
      console.error('FavoritesService.listFavorites error', e);
      return [];
    }
  }

  static async saveFavorites(items: FavoriteItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('FavoritesService.saveFavorites error', e);
    }
  }

  static async isFavorite(id: string): Promise<boolean> {
    const items = await FavoritesService.listFavorites();
    return items.some((i) => i.id === id);
  }

  static async addFavorite(item: FavoriteItem): Promise<void> {
    const items = await FavoritesService.listFavorites();
    if (items.some((i) => i.id === item.id)) return;
    items.unshift({ ...item, createdAt: Date.now() });
    await FavoritesService.saveFavorites(items);
  }

  static async removeFavorite(id: string): Promise<void> {
    const items = await FavoritesService.listFavorites();
    const filtered = items.filter((i) => i.id !== id);
    await FavoritesService.saveFavorites(filtered);
  }

  static async toggleFavorite(item: FavoriteItem): Promise<boolean> {
    const isFav = await FavoritesService.isFavorite(item.id);
    if (isFav) {
      await FavoritesService.removeFavorite(item.id);
      return false;
    } else {
      await FavoritesService.addFavorite(item);
      return true;
    }
  }
}
