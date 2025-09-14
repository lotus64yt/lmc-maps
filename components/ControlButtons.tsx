import React from "react";
import { StyleSheet, TouchableOpacity, Text, View, Vibration } from "react-native";
import { MaterialIcons } from '@expo/vector-icons';

interface ControlButtonsProps {
  onRecenter: () => void;
  onToggleCompass: () => void;
  compassMode: 'north' | 'heading';
  isFollowingUser?: boolean;
  isNavigating?: boolean;
  onOpenFavorites?: () => void;
}

export default function ControlButtons({ 
  onRecenter, 
  onToggleCompass, 
  compassMode,
  isFollowingUser = false,
  isNavigating = false
  , onOpenFavorites
}: ControlButtonsProps) {
  const handleRecenterPress = () => {
    Vibration.vibrate(50);
    onRecenter();
  };

  const handleCompassToggle = () => {
    Vibration.vibrate(50);
    onToggleCompass();
  };

  return (
    <View style={[
      styles.buttonContainer,
      isNavigating && styles.buttonContainerNavigating,
      isNavigating && styles.buttonContainerHidden
    ]}>
      <TouchableOpacity onPress={handleRecenterPress} style={[
        styles.button,
        { backgroundColor: isFollowingUser ? '#34C759' : 'white' }
      ]}>
        <MaterialIcons 
          name="my-location" 
          size={24} 
          color={isFollowingUser ? 'white' : '#333'} 
        />
      </TouchableOpacity>
      
      {}
      {}
      {onOpenFavorites && (
        <TouchableOpacity onPress={() => { Vibration.vibrate(50); onOpenFavorites(); }} style={styles.button}>
          <MaterialIcons name="star" size={24} color="#FFB300" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    right: 20,
    flexDirection: 'column',
    gap: 10,
  },
  buttonContainerNavigating: {
    bottom: 120,
  },
  buttonContainerHidden: {
    display: 'none',
  },
  button: {
    backgroundColor: "white",
    borderRadius: 30,
    padding: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    alignItems: 'center',
    justifyContent: 'center',
    width: 54,
    height: 54,
  },
});

