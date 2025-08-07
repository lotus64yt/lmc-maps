import { ReactNode } from 'react';

type AmenityType = "Sustenance" | "Education" | "Transportation" | "Finance" | "Healthcare" | "Entertainment" | "PublicService" | "Facilities" | "Waste" | "Other";

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
    }, {
        value: "driver_training",
        label: "Formation de conducteurs",
        description: "Établissement offrant des cours de conduite.",
        icon: null,
        type: "Transportation"
    }, {
        value: "ferry_terminal",
        label: "Terminal de ferry",
        description: "Lieu d'embarquement et de débarquement des ferries.",
        icon: null,
        type: "Transportation"
    }, {
        value: "fuel",
        label: "Station-service",
        description: "Station pour faire le plein de carburant.",
        icon: null,
        type: "Transportation"
    }, {
        value: "grit_bin",
        label: "Bac à sel",
        description: "Bac pour stocker le sel ou le sable pour les routes.",
        icon: null,
        type: "Transportation"
    }, {
        value: "motorcycle_parking",
        label: "Parking pour motos",
        description: "Espace dédié au stationnement des motos.",
        icon: null,
        type: "Transportation"
    }, {
        value: "parking_entrance",
        label: "Parking",
        description: "Espace de stationnement pour véhicules.",
        icon: null,
        type: "Transportation"
    }, {
        value: "taxi",
        label: "Station de taxis",
        description: "Lieu de stationnement des taxis.",
        icon: null,
        type: "Transportation"
    }, {
        value: "weighbridge",
        label: "Pont bascule",
        description: "Station de pesage pour véhicules.",
        icon: null,
        type: "Transportation"
    },
        
    // -----------
    // | Finance |
    // -----------

    {
        value: "atm",
        label: "Distributeur automatique",
        description: "Distributeur automatique de billets.",
        icon: null,
        type: "Finance"
    }, {
        value: "payment_terminal",
        label: "Terminal de paiement",
        description: "Terminal pour effectuer des paiements.",
        icon: null,
        type: "Finance"
    }, {
        value: "bank",
        label: "Banque",
        description: "Établissement bancaire.",
        icon: null,
        type: "Finance"
    }, {
        value: "bureau_de_change",
        label: "Bureau de change",
        description: "Service d'échange de devises.",
        icon: null,
        type: "Finance"
    }, {
        value: "money_transfer",
        label: "Transfert d'argent",
        description: "Service de transfert d'argent.",
        icon: null,
        type: "Finance"
    }, {
        value: "payment_centre",
        label: "Centre de paiement",
        description: "Centre pour effectuer divers paiements.",
        icon: null,
        type: "Finance"
    },

    // ----------------
    // | Soins/Santé |
    // ----------------

    {
        value: "baby_hatch",
        label: "Boîte à bébé",
        description: "Dispositif permettant d'abandonner un bébé en sécurité.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "clinic",
        label: "Clinique",
        description: "Établissement de soins médicaux.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "dentist",
        label: "Dentiste",
        description: "Cabinet dentaire.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "doctors",
        label: "Médecin",
        description: "Cabinet médical.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "hospital",
        label: "Hôpital",
        description: "Établissement hospitalier.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "nursing_home",
        label: "Maison de retraite",
        description: "Établissement pour personnes âgées.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "pharmacy",
        label: "Pharmacie",
        description: "Officine pharmaceutique.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "social_facility",
        label: "Centre social",
        description: "Établissement d'aide sociale.",
        icon: null,
        type: "Healthcare"
    }, {
        value: "veterinary",
        label: "Vétérinaire",
        description: "Clinique vétérinaire.",
        icon: null,
        type: "Healthcare"
    },

    // --------------------
    // | Divertissement   |
    // --------------------

    {
        value: "arts_centre",
        label: "Centre artistique",
        description: "Centre dédié aux arts et à la culture.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "brothel",
        label: "Maison close",
        description: "Établissement de prostitution.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "casino",
        label: "Casino",
        description: "Établissement de jeux d'argent.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "cinema",
        label: "Cinéma",
        description: "Salle de projection de films.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "community_centre",
        label: "Centre communautaire",
        description: "Centre d'activités communautaires.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "conference_centre",
        label: "Centre de conférences",
        description: "Centre pour événements et conférences.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "events_venue",
        label: "Lieu d'événements",
        description: "Lieu pour organiser des événements.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "exhibition_centre",
        label: "Centre d'exposition",
        description: "Centre pour expositions et salons.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "fountain",
        label: "Fontaine",
        description: "Fontaine décorative ou d'agrément.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "gambling",
        label: "Jeux d'argent",
        description: "Établissement de jeux et paris.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "love_hotel",
        label: "Hôtel de passe",
        description: "Hôtel pour couples à court terme.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "music_venue",
        label: "Salle de concert",
        description: "Lieu pour spectacles musicaux.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "nightclub",
        label: "Boîte de nuit",
        description: "Établissement de divertissement nocturne.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "planetarium",
        label: "Planétarium",
        description: "Établissement d'observation astronomique.",
        icon: null,
        type: "Entertainment"
    }, {
        value: "public_bookcase",
        label: "Boîte à livres",
        description: "Boîte d'échange de livres publique.",
        icon: null,
        type: "Entertainment"
    },

    // ----------------------
    // | Service Publique   |
    // ----------------------

    {
        value: "courthouse",
        label: "Tribunal",
        description: "Palais de justice.",
        icon: null,
        type: "PublicService"
    }, {
        value: "fire_station",
        label: "Caserne de pompiers",
        description: "Station de pompiers.",
        icon: null,
        type: "PublicService"
    }, {
        value: "police",
        label: "Commissariat",
        description: "Station de police.",
        icon: null,
        type: "PublicService"
    }, {
        value: "post_box",
        label: "Boîte aux lettres",
        description: "Boîte postale publique.",
        icon: null,
        type: "PublicService"
    }, {
        value: "post_depot",
        label: "Dépôt postal",
        description: "Centre de tri postal.",
        icon: null,
        type: "PublicService"
    }, {
        value: "post_office",
        label: "Bureau de poste",
        description: "Agence postale.",
        icon: null,
        type: "PublicService"
    }, {
        value: "prison",
        label: "Prison",
        description: "Établissement pénitentiaire.",
        icon: null,
        type: "PublicService"
    }, {
        value: "ranger_station",
        label: "Poste de garde forestier",
        description: "Station de garde forestier ou de parc.",
        icon: null,
        type: "PublicService"
    }, {
        value: "townhall",
        label: "Mairie",
        description: "Hôtel de ville.",
        icon: null,
        type: "PublicService"
    },

    // ------------------
    // | Installations  |
    // ------------------

    {
        value: "bbq",
        label: "Barbecue",
        description: "Installation de barbecue public.",
        icon: null,
        type: "Facilities"
    }, {
        value: "bench",
        label: "Banc",
        description: "Banc public pour s'asseoir.",
        icon: null,
        type: "Facilities"
    }, {
        value: "dog_toilet",
        label: "Toilettes pour chiens",
        description: "Espace sanitaire pour animaux.",
        icon: null,
        type: "Facilities"
    }, {
        value: "dressing_room",
        label: "Vestiaire",
        description: "Cabine de change ou vestiaire.",
        icon: null,
        type: "Facilities"
    }, {
        value: "drinking_water",
        label: "Fontaine à eau",
        description: "Point d'eau potable.",
        icon: null,
        type: "Facilities"
    }, {
        value: "give_box",
        label: "Boîte de dons",
        description: "Boîte d'échange d'objets gratuits.",
        icon: null,
        type: "Facilities"
    }, {
        value: "lounge",
        label: "Salon d'attente",
        description: "Espace de détente et d'attente.",
        icon: null,
        type: "Facilities"
    }, {
        value: "mailroom",
        label: "Salle de courrier",
        description: "Local de tri et distribution du courrier.",
        icon: null,
        type: "Facilities"
    }, {
        value: "parcel_locker",
        label: "Consigne à colis",
        description: "Casier automatique pour colis.",
        icon: null,
        type: "Facilities"
    }, {
        value: "shelter",
        label: "Abri",
        description: "Abri public contre les intempéries.",
        icon: null,
        type: "Facilities"
    }, {
        value: "shower",
        label: "Douche",
        description: "Installation de douche publique.",
        icon: null,
        type: "Facilities"
    }, {
        value: "telephone",
        label: "Téléphone",
        description: "Cabine téléphonique publique.",
        icon: null,
        type: "Facilities"
    }, {
        value: "toilets",
        label: "Toilettes",
        description: "Toilettes publiques.",
        icon: null,
        type: "Facilities"
    }, {
        value: "water_point",
        label: "Point d'eau",
        description: "Point d'approvisionnement en eau.",
        icon: null,
        type: "Facilities"
    }, {
        value: "watering_place",
        label: "Abreuvoir",
        description: "Point d'eau pour animaux.",
        icon: null,
        type: "Facilities"
    },

    // -------------
    // | Déchets   |
    // -------------

    {
        value: "sanitary_dump_station",
        label: "Station de vidange sanitaire",
        description: "Station pour vidanger les eaux usées des camping-cars.",
        icon: null,
        type: "Waste"
    }, {
        value: "recycling",
        label: "Centre de recyclage",
        description: "Point de collecte pour le recyclage.",
        icon: null,
        type: "Waste"
    }, {
        value: "waste_basket",
        label: "Poubelle",
        description: "Corbeille à papier publique.",
        icon: null,
        type: "Waste"
    }, {
        value: "waste_disposal",
        label: "Collecte des déchets",
        description: "Point de collecte des déchets.",
        icon: null,
        type: "Waste"
    }, {
        value: "waste_transfer_station",
        label: "Station de transfert des déchets",
        description: "Centre de tri et transfert des déchets.",
        icon: null,
        type: "Waste"
    },

    // -----------
    // | Autres  |
    // -----------

    {
        value: "animal_boarding",
        label: "Pension pour animaux",
        description: "Établissement d'hébergement pour animaux.",
        icon: null,
        type: "Other"
    }, {
        value: "animal_breeding",
        label: "Élevage d'animaux",
        description: "Établissement d'élevage et reproduction animale.",
        icon: null,
        type: "Other"
    }, {
        value: "animal_shelter",
        label: "Refuge pour animaux",
        description: "Refuge et centre d'adoption pour animaux.",
        icon: null,
        type: "Other"
    }, {
        value: "animal_training",
        label: "Dressage d'animaux",
        description: "Centre de dressage et formation d'animaux.",
        icon: null,
        type: "Other"
    }, {
        value: "baking_oven",
        label: "Four à pain",
        description: "Four communautaire pour la cuisson du pain.",
        icon: null,
        type: "Other"
    }, {
        value: "clock",
        label: "Horloge publique",
        description: "Horloge ou cadran solaire public.",
        icon: null,
        type: "Other"
    }, {
        value: "crematorium",
        label: "Crématorium",
        description: "Installation de crémation.",
        icon: null,
        type: "Other"
    }, {
        value: "dive_centre",
        label: "Centre de plongée",
        description: "École et centre d'activités de plongée.",
        icon: null,
        type: "Other"
    }, {
        value: "funeral_hall",
        label: "Funérarium",
        description: "Salon funéraire pour cérémonies.",
        icon: null,
        type: "Other"
    }, {
        value: "grave_yard",
        label: "Cimetière",
        description: "Lieu de sépulture et cimetière.",
        icon: null,
        type: "Other"
    }, {
        value: "hunting_stand",
        label: "Mirador de chasse",
        description: "Poste d'observation pour la chasse.",
        icon: null,
        type: "Other"
    }, {
        value: "internet_cafe",
        label: "Cybercafé",
        description: "Café avec accès internet.",
        icon: null,
        type: "Other"
    }, {
        value: "kitchen",
        label: "Cuisine communautaire",
        description: "Cuisine partagée ou communautaire.",
        icon: null,
        type: "Other"
    }, {
        value: "kneipp_water_cure",
        label: "Cure Kneipp",
        description: "Installation de thérapie par l'eau froide.",
        icon: null,
        type: "Other"
    }, {
        value: "lounger",
        label: "Chaise longue",
        description: "Transat ou chaise longue publique.",
        icon: null,
        type: "Other"
    }, {
        value: "marketplace",
        label: "Marché",
        description: "Place de marché ou marché couvert.",
        icon: null,
        type: "Other"
    }, {
        value: "monastery",
        label: "Monastère",
        description: "Communauté religieuse monastique.",
        icon: null,
        type: "Other"
    }, {
        value: "mortuary",
        label: "Morgue",
        description: "Établissement mortuaire.",
        icon: null,
        type: "Other"
    }, {
        value: "photo_booth",
        label: "Photomaton",
        description: "Cabine photo automatique.",
        icon: null,
        type: "Other"
    }, {
        value: "place_of_mourning",
        label: "Lieu de recueillement",
        description: "Espace dédié au recueillement.",
        icon: null,
        type: "Other"
    }, {
        value: "place_of_worship",
        label: "Lieu de culte",
        description: "Édifice religieux pour le culte.",
        icon: null,
        type: "Other"
    }, {
        value: "public_bath",
        label: "Bains publics",
        description: "Établissement de bains publics.",
        icon: null,
        type: "Other"
    }, {
        value: "refugee_site",
        label: "Site de réfugiés",
        description: "Camp ou centre d'accueil pour réfugiés.",
        icon: null,
        type: "Other"
    }, {
        value: "vending_machine",
        label: "Distributeur automatique",
        description: "Machine de vente automatique.",
        icon: null,
        type: "Other"
    },

];

export type { AmenityType };
export default OverPassAmenityList;
