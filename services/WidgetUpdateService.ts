import { NativeModules } from 'react-native';

interface WidgetUpdateModuleInterface {
  updateFavoritesWidgets(): void;
}

const { WidgetUpdateModule } = NativeModules;

export const WidgetUpdateService = {
  updateFavoritesWidgets: (): void => {
    try {
      WidgetUpdateModule?.updateFavoritesWidgets();
    } catch (e) {
      // Silent fail - widget updates shouldn't crash the app
    }
  }
};
