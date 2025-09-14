import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onRetry: () => void;
  onContinue: () => void;
  styles: any;
};

export default function LocationTimeoutModal({ visible, onRetry, onContinue, styles }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <MaterialIcons name="location-off" size={32} color="#FF9500" />
            <Text style={styles.modalTitle}>Localisation non trouvée</Text>
          </View>
          <Text style={styles.modalDescription}>
            Impossible de récupérer votre position après 10 secondes. Vérifiez les autorisations ou réessayez.
          </Text>
          <View style={styles.modalButtonsVertical}>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={onRetry}>
              <MaterialIcons name="refresh" size={20} color="#FFF" />
              <Text style={styles.modalButtonTextPrimary}>Réessayer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={onContinue}>
              <MaterialIcons name="block" size={20} color="#FF3B30" />
              <Text style={styles.modalButtonTextSecondary}>Continuer sans localisation</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
