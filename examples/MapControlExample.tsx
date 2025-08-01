import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useMapView } from '../contexts/MapViewContext';

/**
 * Exemple de composant qui utilise le hook useMapView pour contrôler la caméra
 * depuis n'importe où dans l'application
 */
export default function MapControlExample() {
  const { 
    animateToLocation, 
    setZoom, 
    setPitch, 
    setHeading, 
    resetCamera,
    centerCoordinate,
    zoomLevel,
    pitch,
    heading
  } = useMapView();

  const handleGoToParis = () => {
    // Aller à Paris avec un zoom spécifique
    animateToLocation(48.8566, 2.3522, 14, 2000);
  };

  const handleGoToNewYork = () => {
    // Aller à New York avec animation rapide
    animateToLocation(40.7128, -74.0060, 12, 1500);
  };

  const handleZoomIn = () => {
    // Zoomer avec animation
    setZoom(zoomLevel + 2, 800);
  };

  const handleZoomOut = () => {
    // Dézoomer avec animation
    setZoom(Math.max(1, zoomLevel - 2), 800);
  };

  const handleTiltUp = () => {
    // Incliner la caméra (vue 3D)
    setPitch(Math.min(60, pitch + 15), 1000);
  };

  const handleTiltDown = () => {
    // Remettre la caméra à plat
    setPitch(Math.max(0, pitch - 15), 1000);
  };

  const handleRotateLeft = () => {
    // Tourner la caméra vers la gauche
    setHeading((heading - 45) % 360, 1000);
  };

  const handleRotateRight = () => {
    // Tourner la caméra vers la droite
    setHeading((heading + 45) % 360, 1000);
  };

  const handleReset = () => {
    // Réinitialiser la caméra
    resetCamera(1500);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contrôles de Caméra</Text>
      
      <Text style={styles.info}>
        Position: {centerCoordinate ? `${centerCoordinate[1].toFixed(4)}, ${centerCoordinate[0].toFixed(4)}` : 'N/A'}
      </Text>
      <Text style={styles.info}>Zoom: {zoomLevel.toFixed(1)}</Text>
      <Text style={styles.info}>Inclinaison: {pitch.toFixed(0)}°</Text>
      <Text style={styles.info}>Orientation: {heading.toFixed(0)}°</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Destinations</Text>
        <TouchableOpacity style={styles.button} onPress={handleGoToParis}>
          <Text style={styles.buttonText}>Aller à Paris</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleGoToNewYork}>
          <Text style={styles.buttonText}>Aller à New York</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zoom</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
            <Text style={styles.buttonText}>Zoom +</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
            <Text style={styles.buttonText}>Zoom -</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inclinaison</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.smallButton} onPress={handleTiltUp}>
            <Text style={styles.buttonText}>Incliner</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallButton} onPress={handleTiltDown}>
            <Text style={styles.buttonText}>À plat</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rotation</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.smallButton} onPress={handleRotateLeft}>
            <Text style={styles.buttonText}>← Gauche</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallButton} onPress={handleRotateRight}>
            <Text style={styles.buttonText}>Droite →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Text style={styles.buttonText}>Réinitialiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 10,
    minWidth: 200,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  info: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  section: {
    marginTop: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 5,
  },
  smallButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    flex: 0.48,
  },
  resetButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 15,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
});
