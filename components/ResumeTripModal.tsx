import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

const TRANSPORTS = [
  { id: 'driving', name: 'Voiture', icon: 'directions-car' },
  { id: 'walking', name: 'À pied', icon: 'directions-walk' },
  { id: 'bicycling', name: 'Vélo', icon: 'directions-bike' },
  { id: 'transit', name: 'Transport', icon: 'directions-transit' },
];

export default function ResumeTripModal({
  visible,
  destination,
  mode,
  onValidate,
  onCancel
}: {
  visible: boolean;
  destination: { name?: string };
  mode: string;
  onValidate: (mode: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(mode);
  const isFirst = !destination?.name;
  const resolvedTransportName = TRANSPORTS.find(t => t.id === selected)?.name;
  const indicatorX = React.useRef(new Animated.Value(0)).current;
  const indicatorWidth = React.useRef(new Animated.Value(0)).current;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  const onItemLayout = (id: string) => (e: any) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts(prev => {
      if (prev[id] && prev[id].x === x && prev[id].width === width) return prev;
      return { ...prev, [id]: { x, width } };
    });
  };

  React.useEffect(() => {
    const target = layouts[selected];
    if (!target) return;
    Animated.parallel([
      Animated.timing(indicatorX, {
        toValue: target.x,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(indicatorWidth, {
        toValue: target.width,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [selected, layouts, indicatorWidth, indicatorX]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>
                  {isFirst
                    ? `C'est votre premier trajet` 
                    : `Allons-nous toujours à ${destination?.name || 'votre destination'} en ${resolvedTransportName} ?`}
                </Text>
                {isFirst ? (
                  <Text style={[styles.subtitle, styles.error]}>Erreur — impossible de reprendre : aucun trajet précédent.</Text>
                ) : (
                  <Text style={styles.subtitle}>Choisissez un mode de transport pour commencer.</Text>
                )}

                <View style={styles.selectContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectContent}
                  >
                    {/* animated sliding indicator inside the scroll content so it moves with items */}
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.indicator,
                        {
                          transform: [{ translateX: indicatorX }],
                          width: indicatorWidth,
                        },
                      ]}
                    />
                    {TRANSPORTS.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.selectItem]}
                        onPress={() => setSelected(t.id)}
                        onLayout={onItemLayout(t.id)}
                      >
                        <Icon name={t.icon as any} size={22} color={selected === t.id ? '#007AFF' : '#888'} />
                        <Text style={[styles.selectText, selected === t.id && { color: '#007AFF', fontWeight: 'bold' }]}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {isFirst ? (
                  <View style={styles.buttonRowSingle}>
                    <TouchableOpacity style={styles.goBtnFull} onPress={onCancel}>
                      <Text style={styles.goText}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                      <Text style={styles.cancelText}>Annuler mon trajet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.goBtn} onPress={() => onValidate(selected)}>
                      <Text style={styles.goText}>Y aller</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  keyboard: { flex: 1, width: '100%' },
  safe: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 480,
    alignItems: 'center',
    maxHeight: '80%'
  },
  title: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 18, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 12, textAlign: 'center' },
  error: { color: '#C62828', fontWeight: '600' },
  selectContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap', position: 'relative' },
  selectItem: { flexDirection: 'column', alignItems: 'center', margin: 8, padding: 10, borderRadius: 8, minWidth: 72 },
  selected: { backgroundColor: '#EAF2FF' },
  selectText: { marginTop: 4, fontSize: 13, color: '#888' },
  indicator: {
    position: 'absolute',
    height: 48,
    top: 6,
    left: 0,
    backgroundColor: '#EAF2FF',
    borderRadius: 12,
  },
  selectContent: { alignItems: 'center', paddingHorizontal: 8 },
  scrollContent: { alignItems: 'center', paddingBottom: 6 },
  buttonRow: { flexDirection: 'row', marginTop: 10, width: '100%' },
  buttonRowSingle: { marginTop: 12, width: '100%' },
  goBtnFull: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center', width: '100%' },
  cancelBtn: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 8, padding: 12, marginRight: 8, alignItems: 'center' },
  goBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 12, marginLeft: 8, alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: '500', fontSize: 15 },
  goText: { color: 'white', fontWeight: '600', fontSize: 15 },
});
