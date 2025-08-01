import { ReactNode } from 'react';

type AmenityType = "Sustenance" | "Education" | "Transportation";

interface Amenity {
  label: string;
  value: string;
  description?: string;
  icon: ReactNode | null;
  type: AmenityType;
}

const OverPassAmenityList: Amenity[] = [
    // -------------------
    // |    Nouriture    |
    // -------------------
    {
        value: "bar",
        label: "Bar",
        description: "Etablissement servant des boissons alcoolisées.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "biergarten",
        label: "Biergarten",
        description: "Jardin à bière, souvent en plein air.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "cafe",
        label: "Café",
        description: "Etablissement servant du café et des boissons chaudes.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "fast_food",
        label: "Restauration Rapide",
        description: "Restauration rapide.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "food_court",
        label: "Aire de restauration",
        description: "Espace regroupant plusieurs restaurants ou stands de nourriture.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "ice_cream",
        label: "Glacier",
        description: "Magasin ou stand vendant des glaces.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "pub",
        label: "Pub",
        description: "Établissement servant des boissons alcoolisées, souvent avec une ambiance décontractée.",
        icon: null,
        type: "Sustenance"
    }, {
        value: "restaurant",
        label: "Restaurant",
        description: "Établissement servant des repas.",
        icon: null,
        type: "Sustenance"
    }, 
    
    // --------------------
    // |     Education    |
    // --------------------

    {
        value: "college",
        label: "Université",
        description: "Établissement d'enseignement supérieur.",
        icon: null,
        type: "Education"
    }, {
        value: "dancing_school",
        label: "École de danse",
        description: "Établissement enseignant la danse.",
        icon: null,
        type: "Education"
    }, {
        value: "driving_school",
        label: "Auto-école",
        description: "Établissement enseignant la conduite automobile.",
        icon: null,
        type: "Education"
    }, {
        value: "first_aid_school",
        label: "École de secourisme",
        description: "Établissement enseignant les premiers secours.",
        icon: null,
        type: "Education"
    }, {
        value: "kindergarten",
        label: "Jardin d'enfants",
        description: "Établissement préscolaire pour les jeunes enfants.",
        icon: null,
        type: "Education"
    }, {
        value: "language_school",
        label: "École de langues",
        description: "Établissement enseignant des langues étrangères.",
        icon: null,
        type: "Education"
    }, {
        value: "library",
        label: "Bibliothèque",
        description: "Lieu de prêt de livres et autres médias.",
        icon: null,
        type: "Education"
    }, {
        value: "surf_school",
        label: "École de surf",
        description: "Établissement enseignant le surf.",
        icon: null,
        type: "Education"
    }, {
        value: "toy_library",
        label: "Bibliothèque de jouets",
        description: "Lieu de prêt de jouets ou jouer avec sur place.",
        icon: null,
        type: "Education"
    }, {
        value: "research_institute",
        label: "Laboratoire de recherche",
        description: "Établissement pour divers recherches.",
        icon: null,
        type: "Education"
    }, 
    
    // ------------------
    // | Transportation |
    // ------------------

    {
        value: "bicycle_parking",
        label: "Parking à vélos",
        description: "Espace dédié au stationnement des vélos.",
        icon: null,
        type: "Transportation"
    }, {
        value: "bicycle_repair_station",
        label: "Station de réparation de vélos",
        description: "Station équipée pour réparer les vélos.",
        icon: null,
        type: "Transportation"
    }, {
        value: "bicycle_rental",
        label: "Location de vélos",
        description: "Service de location de vélos.",
        icon: null,
        type: "Transportation"
    }, {
        value: "bicycle_wash",
        label: "Nettoyage de vélos",
        description: "Station de lavage pour vélos.",
        icon: null,
        type: "Transportation"
    }, {
        value: "boat_rental",
        label: "Location de bateaux",
        description: "Service de location de bateaux.",
        icon: null,
        type: "Transportation"
    }, {
        value: "boat_sharing",
        label: "Partage de bateaux",
        description: "Service de partage de bateaux.",
        icon: null,
        type: "Transportation"
    }, {
        value: "bus_station",
        label: "Gare routière",
        description: "Lieu de départ et d'arrivée des bus.",
        icon: null,
        type: "Transportation"
    }, {
        value: "car_rental",
        label: "Location de voiture",
        description: "Service de location de voitures.",
        icon: null,
        type: "Transportation"
    }, {
        value: "car_sharing",
        label: "Partage de voiture",
        description: "Service de partage de voitures.",
        icon: null,
        type: "Transportation"
    }, {
        value: "car_wash",
        label: "Station de lavage de voiture",
        description: "Station pour nettoyer les voitures.",
        icon: null,
        type: "Transportation"
    }, {
        value: "compressed_air",
        label: "Station de gonflage",
        description: "Station pour gonfler les pneus.",
        icon: null,
        type: "Transportation"
    }, {
        value: "vehicle_inspection",
        label: "Contrôle technique",
        description: "Station pour le contrôle technique des véhicules.",
        icon: null,
        type: "Transportation"
    }, {
        value: "charging_station",
        label: "Station de recharge",
        description: "Station pour recharger les véhicules électriques.",
        icon: null,
        type: "Transportation"
    },
];

export type { AmenityType };
export default OverPassAmenityList;
