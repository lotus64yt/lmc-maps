import { registerRootComponent } from 'expo';

// Ensure Mapbox access token is configured early to avoid native inflation errors
import './mapboxInit';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
