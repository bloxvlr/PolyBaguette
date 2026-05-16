// data.js
const MOCK_MARKETS = [
    {
        id: "m1",
        title: "Drake 'Iceman' Première semaine de ventes d'albums ?",
        category: "culture",
        icon: "https://picsum.photos/seed/drake/100/100",
        volume: 186000,
        endDate: "2026-08-31",
        outcomes: [
            { name: "450k-500k", prob: 15, currentPrice: 0.15 },
            { name: "500k-550k", prob: 21, currentPrice: 0.21 },
            { name: "550k-600k", prob: 17, currentPrice: 0.17 },
            { name: "600k+", prob: 21, currentPrice: 0.21 }
        ],
        news: [
            { text: "Trump declassifies new UFO files by May 15?", prob: 100 },
            { text: "Will Jerome Powell depart as Fed Chair by May 16 2026?", prob: 1 }
        ],
        description: "Ce marché sera résolu selon les chiffres de Billboard. Les ventes incluent le streaming et les ventes physiques.",
        isFeatured: true
    },
    {
        id: "m2",
        title: "Vainqueur du Championnat PGA 2026",
        category: "sport",
        icon: "https://picsum.photos/seed/golf/100/100",
        volume: 4039895,
        endDate: "2026-05-18",
        outcomes: [
            { name: "Scottie Scheffler", prob: 20, currentPrice: 0.20, volume: 404254, yesPrice: 0.20, noPrice: 0.81 },
            { name: "Cameron Young", prob: 10, currentPrice: 0.10, volume: 235080, yesPrice: 0.10, noPrice: 0.91 },
            { name: "Ludvig Aberg", prob: 7, currentPrice: 0.07, volume: 84286, yesPrice: 0.08, noPrice: 0.93 },
            { name: "Maverick McNealy", prob: 7, currentPrice: 0.07, volume: 49803, yesPrice: 0.08, noPrice: 0.93 },
            { name: "Chris Gotterup", prob: 6, currentPrice: 0.06, volume: 54232, yesPrice: 0.07, noPrice: 0.94 }
        ],
        description: "Ce marché concerne le vainqueur du Championnat PGA 2026. Si un joueur se retire avant le début du tournoi, les paris sur lui sont annulés.",
        isFeatured: false
    },
    {
        id: "m3",
        title: "BTC vers le haut ou vers le bas 5m",
        category: "crypto",
        icon: "https://picsum.photos/seed/btc/100/100",
        volume: 1250000,
        endDate: "2026-05-16",
        outcomes: [
            { name: "Up", prob: 52, currentPrice: 0.52, yesPrice: 0.52, noPrice: 0.49 },
            { name: "Down", prob: 48, currentPrice: 0.48, yesPrice: 0.48, noPrice: 0.53 }
        ],
        description: "Le prix du Bitcoin sera-t-il supérieur ou inférieur à son prix actuel dans 5 minutes ?",
        isFeatured: false
    },
    {
        id: "m4",
        title: "MicroStrategy vend des Bitcoins par ___ ?",
        category: "crypto",
        icon: "https://picsum.photos/seed/mstr/100/100",
        volume: 28000000,
        endDate: "2026-12-31",
        outcomes: [
            { name: "31 décembre 2026", prob: 89, currentPrice: 0.89, yesPrice: 0.89, noPrice: 0.12 },
            { name: "30 juin 2026", prob: 75, currentPrice: 0.75, yesPrice: 0.75, noPrice: 0.26 }
        ],
        description: "MicroStrategy va-t-il vendre une partie de ses avoirs en Bitcoin avant ces dates ?",
        isFeatured: false
    },
    {
        id: "m5",
        title: "Dissolution de l'Assemblée Nationale en 2026 ?",
        category: "politique",
        icon: "https://picsum.photos/seed/assemblee/100/100",
        volume: 850000,
        endDate: "2026-12-31",
        outcomes: [
            { name: "Oui", prob: 35, currentPrice: 0.35, yesPrice: 0.35, noPrice: 0.66 },
            { name: "Non", prob: 65, currentPrice: 0.65, yesPrice: 0.65, noPrice: 0.36 }
        ],
        description: "Le Président de la République prononcera-t-il la dissolution de l'Assemblée Nationale avant la fin de l'année 2026 ?",
        isFeatured: false
    }
];

const MOCK_TICKER = [
    "JeanMie a enfourné 50 OUI sur 'Dissolution' à 0.42 PLC",
    "BaguettePro ouvre : 'Mbappé au PSG 2027 ?'",
    "RÉSOLU : 'Prix baguette > 1.50€' → OUI",
    "ALERTE : 5 000 PLC tradés sur 'Élections 2027'",
    "NOUVEAU ROI : Julie devient n°1 avec 142 000 PLC !",
    "DarkTrader tombe à 0 PLC après 3 ans de règne...",
    "Incroyable : Paul remonte de 0 à 10 000 PLC !",
    "RECORD HISTORIQUE : Marc atteint 250 000 PLC !"
];

const MOCK_LEADERBOARD = [
    { name: "Julie", score: 142000, trend: "+5%" },
    { name: "Marc", score: 125000, trend: "-2%" },
    { name: "BaguettePro", score: 89000, trend: "+12%" },
    { name: "JeanMie", score: 75400, trend: "+1%" },
    { name: "CroissantLover", score: 62000, trend: "-5%" },
    { name: "Paul", score: 58000, trend: "+150%" }
];

const BADGES = [
    { id: "croissant", name: "Petit Croissant", desc: "1er trade", icon: "croissant" },
    { id: "tradition", name: "Baguette Tradition", desc: "5 trades en 24h", icon: "baguette" },
    { id: "beurre", name: "Plaque de Beurre", desc: "1 000 PLC de volume", icon: "square" },
    { id: "boulanger", name: "Boulanger", desc: "10 000 PLC de volume", icon: "chef-hat" },
    { id: "roi", name: "Roi de la Mie", desc: "Top 1 Classement", icon: "crown" },
    { id: "irma", name: "Madame Irma", desc: "10 victoires de suite", icon: "eye" },
    { id: "whale", name: "Baleine", desc: "+1000 PLC sur 1 trade", icon: "fish" },
    { id: "burn", name: "Pain Brûlé", desc: "Tombé à 0 PLC", icon: "skull" }
];
