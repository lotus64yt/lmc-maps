import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { FavoritesService, FavoriteItem } from '../services/FavoritesService';
import { WidgetUpdateService } from '../services/WidgetUpdateService';

export default function FavoritesDebugPanel() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const loadFavorites = async () => {
    const favs = await FavoritesService.listFavorites();
    setFavorites(favs);
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const addTestFavorite = async () => {
    const testFavorite: FavoriteItem = {
      id: `test_${Date.now()}`,
      title: 'Test Favori',
      subtitle: 'Favori de test pour le widget',
      latitude: 45.508888,
      longitude: -73.561668,
      createdAt: Date.now()
    };
    
    await FavoritesService.addFavorite(testFavorite);
    await loadFavorites();
    Alert.alert('Test', 'Favori de test ajouté !');
  };

  const clearFavorites = async () => {
    await FavoritesService.saveFavorites([]);
    await loadFavorites();
    Alert.alert('Test', 'Favoris effacés !');
  };

  const updateWidget = () => {
    WidgetUpdateService.updateFavoritesWidgets();
    Alert.alert('Test', 'Mise à jour du widget envoyée !');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Favoris & Widget</Text>
      <Text style={styles.count}>Favoris: {favorites.length}</Text>
      
      {favorites.map((fav, index) => (
        <Text key={fav.id} style={styles.favorite}>
          {index + 1}. {fav.title} {fav.subtitle ? `(${fav.subtitle})` : ''}
        </Text>
      ))}
      
      <TouchableOpacity style={styles.button} onPress={addTestFavorite}>
        <Text style={styles.buttonText}>Ajouter Favori Test</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={clearFavorites}>
        <Text style={styles.buttonText}>Effacer Favoris</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={updateWidget}>
        <Text style={styles.buttonText}>Mettre à jour Widget</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    maxWidth: 250,
    zIndex: 1000,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  count: {
    fontSize: 14,
    marginBottom: 8,
  },
  favorite: {
    fontSize: 12,
    marginBottom: 4,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 4,
    marginVertical: 2,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
  },
});
