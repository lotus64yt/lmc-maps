import NavigationService from '../services/NavigationService';
import { NavigationStep } from '../types/RouteTypes';

// Exemple de données pour tester le système de navigation
export const createTestRoute = (): NavigationStep[] => {
  return [
    {
      instruction: "Dirigez-vous vers le nord sur la Rue de la Paix",
      distance: 200,
      duration: 120,
      maneuver: "depart",
      coordinates: [2.3522, 48.8566],
      direction: "N",
      streetName: "Rue de la Paix"
    },
    {
      instruction: "Tournez à droite sur Boulevard Haussmann",
      distance: 500,
      duration: 300,
      maneuver: "turn-right",
      coordinates: [2.3532, 48.8576],
      direction: "E",
      streetName: "Boulevard Haussmann"
    },
    {
      instruction: "Continuez tout droit pendant 800m",
      distance: 800,
      duration: 480,
      maneuver: "turn-straight",
      coordinates: [2.3642, 48.8586],
      direction: "E",
      streetName: "Boulevard Haussmann"
    },
    {
      instruction: "Tournez à gauche sur Avenue des Champs-Élysées",
      distance: 300,
      duration: 180,
      maneuver: "turn-left",
      coordinates: [2.3652, 48.8596],
      direction: "N",
      streetName: "Avenue des Champs-Élysées"
    },
    {
      instruction: "Vous êtes arrivé à destination",
      distance: 0,
      duration: 0,
      maneuver: "arrive",
      coordinates: [2.3662, 48.8606],
      direction: "",
      streetName: "Avenue des Champs-Élysées"
    }
  ];
};

// Fonction pour démarrer un test de navigation
export const startTestNavigation = () => {
  const testSteps = createTestRoute();
  NavigationService.startNavigation(testSteps);
};

export default { createTestRoute, startTestNavigation };
