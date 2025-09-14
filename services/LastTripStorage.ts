import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LastTripData {
  destination: { latitude: number; longitude: number; name?: string };
  mode: string;
  routeSteps: any[];
  fullRouteCoordinates?: number[];
}

const STORAGE_KEY = 'LMC_LAST_TRIP';

export const LastTripStorage = {
  async save(trip: LastTripData) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    } catch (e) {
    }
  },
  async load(): Promise<LastTripData | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  async clear() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
};

