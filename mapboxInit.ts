import Mapbox from '@rnmapbox/maps';

// When using a fully local style JSON, Mapbox native may still require an
// access token when inflating the native MapView on Android. For development
// with local styles we can set an empty token early to avoid the native
// exception. If you later publish to Play Store or use Mapbox hosted styles,
// replace this with a real token.

try {
  // Setting an explicit empty string prevents the native layer from throwing
  // "Using MapView requires providing a valid access token when inflating or creating the view"
  // while keeping behavior unchanged for local style usage.
  Mapbox.setAccessToken('');
} catch (e) {
  // If the native module isn't available in some environments (Expo Go),
  // ignore the error — it will be handled by the native runtime when available.
}

export default Mapbox;
