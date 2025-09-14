import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, PanResponder, Vibration } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

interface GPXStartDrawerProps {
  visible: boolean;
  start: { latitude: number; longitude: number } | null;
  onStartGpx: () => void;
  onClose: () => void;
}

const { height: screenHeight } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.4;

export default function GPXStartDrawer({ visible, start, onStartGpx, onClose }: GPXStartDrawerProps) {
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: screenHeight - DRAWER_HEIGHT, useNativeDriver: true, bounciness: 8, speed: 12 }).start();
    } else {
      Animated.spring(translateY, { toValue: screenHeight, useNativeDriver: true, bounciness: 0 }).start();
    }
  }, [visible]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (evt, g) => {
      let newY = screenHeight - DRAWER_HEIGHT + g.dy;
      newY = Math.max(screenHeight - DRAWER_HEIGHT, Math.min(screenHeight, newY));
      translateY.setValue(newY);
    },
    onPanResponderRelease: (evt, g) => {
      if (g.dy > DRAWER_HEIGHT / 3) onClose();
      else Animated.spring(translateY, { toValue: screenHeight - DRAWER_HEIGHT, useNativeDriver: true, bounciness: 8 }).start();
    },
  });

  if (!visible || !start) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <View style={styles.handle} />
        <TouchableOpacity onPress={() => { Vibration.vibrate(40); onClose(); }} style={styles.closeButton}>
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.iconRow}>
          <Icon name="flag" size={36} color="#34C759" />
        </View>
        <Text style={styles.title}>Vous êtes arrivé au point de départ</Text>
        <Text style={styles.subtitle}>
          ({start.latitude.toFixed(5)}, {start.longitude.toFixed(5)})
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => { Vibration.vibrate(80); onStartGpx(); }}>
          <Icon name="play-arrow" size={22} color="#FFF" />
          <Text style={styles.primaryButtonText}>Lancer la navigation GPX</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: DRAWER_HEIGHT,
    backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  header: { height: 36, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#DDD' },
  closeButton: { position: 'absolute', right: 8, top: 6, padding: 8 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  iconRow: { alignItems: 'center', marginTop: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#222', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 4 },
  primaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16, backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 10 },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },
});

