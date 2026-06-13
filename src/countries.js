/**
 * countries.js — 195 countries with geographic data
 * Generates TERRITORIES and EMPIRES arrays compatible with the existing game engine.
 * Each country = one territory on the map. Player picks their country, rest are AI/neutral.
 */

// Game coordinate space (matches existing territory coordinate system)
export const GAME_W = 960, GAME_H = 640;

// Convert lat/lng to game pixel coordinates (equirectangular projection)
export function latlngToXY(lat, lng) {
    return {
        x: (lng + 180) / 360 * GAME_W,
        y: (90 - lat) / 180 * GAME_H
    };
}

// Get flag emoji from ISO 3166-1 alpha-2 code
export function getFlag(code) {
    return String.fromCodePoint(
        ...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
}

// Generate unique color for N countries via HSL
export function countryColor(index, total) {
    const hue = (index * 360 / total) % 360;
    return `hsl(${hue}, 65%, 55%)`;
}

// Haversine distance in km between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════
//  195 COUNTRIES — name, ISO code, capital lat/lng, continent
// ═══════════════════════════════════════════════════════════════
const RAW = [
    // ─── Africa (54) ───────────────────────────────────────────
    ['Algeria','DZ',36.75,3.04,'Africa'],
    ['Angola','AO',-8.84,13.23,'Africa'],
    ['Benin','BJ',6.50,2.63,'Africa'],
    ['Botswana','BW',-24.65,25.91,'Africa'],
    ['Burkina Faso','BF',12.37,-1.52,'Africa'],
    ['Burundi','BI',-3.42,29.93,'Africa'],
    ['Cabo Verde','CV',14.92,-23.51,'Africa'],
    ['Cameroon','CM',3.85,11.50,'Africa'],
    ['Central African Republic','CF',4.39,18.56,'Africa'],
    ['Chad','TD',12.11,15.05,'Africa'],
    ['Comoros','KM',-11.88,43.87,'Africa'],
    ['Congo','CG',-4.27,15.28,'Africa'],
    ["Côte d'Ivoire",'CI',6.83,-5.29,'Africa'],
    ['DR Congo','CD',-4.34,15.31,'Africa'],
    ['Djibouti','DJ',11.59,43.15,'Africa'],
    ['Egypt','EG',30.04,31.24,'Africa'],
    ['Equatorial Guinea','GQ',3.75,8.77,'Africa'],
    ['Eritrea','ER',15.18,39.00,'Africa'],
    ['Eswatini','SZ',-26.32,31.14,'Africa'],
    ['Ethiopia','ET',9.02,38.75,'Africa'],
    ['Gabon','GA',0.39,9.45,'Africa'],
    ['Gambia','GM',13.45,-16.58,'Africa'],
    ['Ghana','GH',5.56,-0.19,'Africa'],
    ['Guinea','GN',9.64,-13.52,'Africa'],
    ['Guinea-Bissau','GW',11.85,-15.60,'Africa'],
    ['Kenya','KE',-1.29,36.82,'Africa'],
    ['Lesotho','LS',-29.31,27.48,'Africa'],
    ['Liberia','LR',6.31,-10.81,'Africa'],
    ['Libya','LY',32.90,13.18,'Africa'],
    ['Madagascar','MG',-18.88,47.51,'Africa'],
    ['Malawi','MW',-13.97,33.79,'Africa'],
    ['Mali','ML',12.64,-8.00,'Africa'],
    ['Mauritania','MR',18.09,-15.98,'Africa'],
    ['Mauritius','MU',-20.17,57.50,'Africa'],
    ['Morocco','MA',34.02,-6.84,'Africa'],
    ['Mozambique','MZ',-25.97,32.58,'Africa'],
    ['Namibia','NA',-22.56,17.07,'Africa'],
    ['Niger','NE',13.51,2.11,'Africa'],
    ['Nigeria','NG',9.06,7.50,'Africa'],
    ['Rwanda','RW',-1.94,29.87,'Africa'],
    ['São Tomé and Príncipe','ST',0.19,6.61,'Africa'],
    ['Senegal','SN',14.72,-17.46,'Africa'],
    ['Seychelles','SC',-4.68,55.49,'Africa'],
    ['Sierra Leone','SL',8.47,-13.23,'Africa'],
    ['Somalia','SO',2.05,45.34,'Africa'],
    ['South Africa','ZA',-25.75,28.19,'Africa'],
    ['South Sudan','SS',4.86,31.60,'Africa'],
    ['Sudan','SD',15.50,32.56,'Africa'],
    ['Tanzania','TZ',-6.16,35.75,'Africa'],
    ['Togo','TG',6.13,1.22,'Africa'],
    ['Tunisia','TN',33.89,9.54,'Africa'],
    ['Uganda','UG',0.35,32.58,'Africa'],
    ['Zambia','ZM',-15.39,28.32,'Africa'],
    ['Zimbabwe','ZW',-17.83,31.05,'Africa'],

    // ─── Asia (49) ─────────────────────────────────────────────
    ['Afghanistan','AF',34.53,69.17,'Asia'],
    ['Armenia','AM',40.18,44.51,'Asia'],
    ['Azerbaijan','AZ',40.41,49.87,'Asia'],
    ['Bahrain','BH',26.23,50.59,'Asia'],
    ['Bangladesh','BD',23.81,90.41,'Asia'],
    ['Bhutan','BT',27.51,89.70,'Asia'],
    ['Brunei','BN',4.94,114.93,'Asia'],
    ['Cambodia','KH',11.56,104.92,'Asia'],
    ['China','CN',39.90,116.41,'Asia'],
    ['Cyprus','CY',35.19,33.38,'Asia'],
    ['Georgia','GE',41.72,44.78,'Asia'],
    ['India','IN',28.61,77.21,'Asia'],
    ['Indonesia','ID',-6.21,106.85,'Asia'],
    ['Iran','IR',35.69,51.39,'Asia'],
    ['Iraq','IQ',33.31,44.37,'Asia'],
    ['Israel','IL',31.78,35.22,'Asia'],
    ['Japan','JP',35.68,139.69,'Asia'],
    ['Jordan','JO',31.95,35.93,'Asia'],
    ['Kazakhstan','KZ',51.17,71.43,'Asia'],
    ['Kuwait','KW',29.38,47.98,'Asia'],
    ['Kyrgyzstan','KG',42.87,74.59,'Asia'],
    ['Laos','LA',17.97,102.63,'Asia'],
    ['Lebanon','LB',33.85,35.50,'Asia'],
    ['Malaysia','MY',3.14,101.69,'Asia'],
    ['Maldives','MV',4.18,73.51,'Asia'],
    ['Mongolia','MN',47.91,106.91,'Asia'],
    ['Myanmar','MM',19.76,96.07,'Asia'],
    ['Nepal','NP',27.72,85.32,'Asia'],
    ['North Korea','KP',38.91,127.77,'Asia'],
    ['Oman','OM',23.59,58.41,'Asia'],
    ['Pakistan','PK',33.69,73.04,'Asia'],
    ['Palestine','PS',31.95,35.23,'Asia'],
    ['Philippines','PH',14.60,120.98,'Asia'],
    ['Qatar','QA',25.29,51.53,'Asia'],
    ['Russia','RU',55.76,37.62,'Asia'],
    ['Saudi Arabia','SA',24.71,46.68,'Asia'],
    ['Singapore','SG',1.35,103.82,'Asia'],
    ['South Korea','KR',37.57,126.98,'Asia'],
    ['Sri Lanka','LK',6.91,79.86,'Asia'],
    ['Syria','SY',33.51,36.29,'Asia'],
    ['Tajikistan','TJ',38.56,68.77,'Asia'],
    ['Thailand','TH',13.76,100.50,'Asia'],
    ['Timor-Leste','TL',-8.56,125.53,'Asia'],
    ['Turkey','TR',39.93,32.86,'Asia'],
    ['Turkmenistan','TM',37.96,58.35,'Asia'],
    ['United Arab Emirates','AE',24.45,54.65,'Asia'],
    ['Uzbekistan','UZ',41.30,69.28,'Asia'],
    ['Vietnam','VN',21.03,105.85,'Asia'],
    ['Yemen','YE',15.37,44.19,'Asia'],

    // ─── Europe (44) ──────────────────────────────────────────
    ['Albania','AL',41.33,19.82,'Europe'],
    ['Andorra','AD',42.51,1.52,'Europe'],
    ['Austria','AT',48.21,16.37,'Europe'],
    ['Belarus','BY',53.90,27.57,'Europe'],
    ['Belgium','BE',50.85,4.35,'Europe'],
    ['Bosnia and Herzegovina','BA',43.86,18.41,'Europe'],
    ['Bulgaria','BG',42.70,23.32,'Europe'],
    ['Croatia','HR',45.81,15.98,'Europe'],
    ['Denmark','DK',55.68,12.57,'Europe'],
    ['Estonia','EE',59.44,24.75,'Europe'],
    ['Finland','FI',60.17,24.94,'Europe'],
    ['France','FR',48.86,2.35,'Europe'],
    ['Germany','DE',52.52,13.41,'Europe'],
    ['Greece','GR',37.98,23.73,'Europe'],
    ['Hungary','HU',47.50,19.04,'Europe'],
    ['Iceland','IS',64.15,-21.94,'Europe'],
    ['Ireland','IE',53.35,-6.26,'Europe'],
    ['Italy','IT',41.90,12.50,'Europe'],
    ['Kosovo','XK',42.66,21.17,'Europe'],
    ['Latvia','LV',56.95,24.11,'Europe'],
    ['Liechtenstein','LI',47.17,9.55,'Europe'],
    ['Lithuania','LT',54.69,25.28,'Europe'],
    ['Luxembourg','LU',49.61,6.13,'Europe'],
    ['Malta','MT',35.90,14.45,'Europe'],
    ['Moldova','MD',47.01,28.86,'Europe'],
    ['Monaco','MC',43.75,7.42,'Europe'],
    ['Montenegro','ME',42.44,19.26,'Europe'],
    ['Netherlands','NL',52.37,4.90,'Europe'],
    ['North Macedonia','MK',41.99,21.43,'Europe'],
    ['Norway','NO',59.91,10.75,'Europe'],
    ['Poland','PL',52.23,21.01,'Europe'],
    ['Portugal','PT',38.72,-9.14,'Europe'],
    ['Romania','RO',44.43,26.10,'Europe'],
    ['San Marino','SM',43.94,12.46,'Europe'],
    ['Serbia','RS',44.79,20.47,'Europe'],
    ['Slovakia','SK',48.15,17.11,'Europe'],
    ['Slovenia','SI',46.06,14.51,'Europe'],
    ['Spain','ES',40.42,-3.70,'Europe'],
    ['Sweden','SE',59.33,18.07,'Europe'],
    ['Switzerland','CH',46.95,7.45,'Europe'],
    ['Ukraine','UA',50.45,30.52,'Europe'],
    ['United Kingdom','GB',51.51,-0.13,'Europe'],
    ['Vatican City','VA',41.90,12.45,'Europe'],

    // ─── Americas (35) ─────────────────────────────────────────
    ['Antigua and Barbuda','AG',17.12,-61.85,'Americas'],
    ['Argentina','AR',-34.60,-58.38,'Americas'],
    ['Bahamas','BS',25.05,-77.46,'Americas'],
    ['Barbados','BB',13.10,-59.62,'Americas'],
    ['Belize','BZ',17.25,-88.77,'Americas'],
    ['Bolivia','BO',-19.04,-65.26,'Americas'],
    ['Brazil','BR',-15.79,-47.88,'Americas'],
    ['Canada','CA',45.42,-75.70,'Americas'],
    ['Chile','CL',-33.45,-70.67,'Americas'],
    ['Colombia','CO',4.71,-74.07,'Americas'],
    ['Costa Rica','CR',9.93,-84.08,'Americas'],
    ['Cuba','CU',23.11,-82.37,'Americas'],
    ['Dominica','DM',15.30,-61.39,'Americas'],
    ['Dominican Republic','DO',18.47,-69.89,'Americas'],
    ['Ecuador','EC',-0.18,-78.47,'Americas'],
    ['El Salvador','SV',13.70,-89.22,'Americas'],
    ['Grenada','GD',12.06,-61.75,'Americas'],
    ['Guatemala','GT',14.63,-90.51,'Americas'],
    ['Guyana','GY',6.80,-58.16,'Americas'],
    ['Haiti','HT',18.54,-72.34,'Americas'],
    ['Honduras','HN',14.07,-87.19,'Americas'],
    ['Jamaica','JM',18.00,-76.79,'Americas'],
    ['Mexico','MX',19.43,-99.13,'Americas'],
    ['Nicaragua','NI',12.11,-86.28,'Americas'],
    ['Panama','PA',8.98,-79.53,'Americas'],
    ['Paraguay','PY',-25.26,-57.58,'Americas'],
    ['Peru','PE',-12.05,-77.04,'Americas'],
    ['Saint Kitts and Nevis','KN',17.30,-62.72,'Americas'],
    ['Saint Lucia','LC',13.91,-60.98,'Americas'],
    ['Saint Vincent','VC',13.25,-61.21,'Americas'],
    ['Suriname','SR',5.85,-55.17,'Americas'],
    ['Trinidad and Tobago','TT',10.49,-61.22,'Americas'],
    ['United States','US',38.91,-77.04,'Americas'],
    ['Uruguay','UY',-34.88,-56.17,'Americas'],
    ['Venezuela','VE',10.49,-66.88,'Americas'],

    // ─── Oceania (14) ──────────────────────────────────────────
    ['Australia','AU',-35.28,149.13,'Oceania'],
    ['Fiji','FJ',-18.14,178.44,'Oceania'],
    ['Kiribati','KI',1.33,173.00,'Oceania'],
    ['Marshall Islands','MH',7.10,171.38,'Oceania'],
    ['Micronesia','FM',6.92,158.15,'Oceania'],
    ['Nauru','NR',-0.52,166.92,'Oceania'],
    ['New Zealand','NZ',-41.29,174.78,'Oceania'],
    ['Palau','PW',7.50,134.62,'Oceania'],
    ['Papua New Guinea','PG',-6.31,147.15,'Oceania'],
    ['Samoa','WS',-13.83,-171.77,'Oceania'],
    ['Solomon Islands','SB',-9.43,159.97,'Oceania'],
    ['Tonga','TO',-21.21,-175.20,'Oceania'],
    ['Tuvalu','TV',-8.52,179.19,'Oceania'],
    ['Vanuatu','VU',-17.73,168.32,'Oceania'],
];

// ═══════════════════════════════════════════════════════════════
//  CONTINENT FILTER DATA
// ═══════════════════════════════════════════════════════════════
export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania'];
export const CONTINENT_ICONS = { Africa: '🌍', Asia: '🌏', Europe: '🌍', Americas: '🌎', Oceania: '🏝️' };

// ═══════════════════════════════════════════════════════════════
//  PROCESSED COUNTRIES with computed positions & flags
// ═══════════════════════════════════════════════════════════════
export const COUNTRIES = RAW.map((r, i) => {
    const pos = latlngToXY(r[2], r[3]);
    return {
        id: i,
        name: r[0],
        code: r[1],
        lat: r[2],
        lng: r[3],
        continent: r[4],
        cx: pos.x,
        cy: pos.y,
        flag: getFlag(r[1]),
        color: countryColor(i, RAW.length),
    };
});

// Verify count
if (COUNTRIES.length !== 195) {
    console.warn(`[countries.js] Expected 195 countries, got ${COUNTRIES.length}`);
}

// ═══════════════════════════════════════════════════════════════
//  ADJACENCY — distance-based (haversine km)
//  Threshold varies by region density
// ═══════════════════════════════════════════════════════════════
export function computeAdjacency() {
    const THRESHOLDS = { Europe: 700, Asia: 1000, Africa: 900, Americas: 1200, Oceania: 2500 };
    const adj = Array.from({ length: COUNTRIES.length }, () => []);

    for (let i = 0; i < COUNTRIES.length; i++) {
        for (let j = i + 1; j < COUNTRIES.length; j++) {
            const a = COUNTRIES[i], b = COUNTRIES[j];
            const dist = haversine(a.lat, a.lng, b.lat, b.lng);
            const thresh = Math.max(THRESHOLDS[a.continent] || 1000, THRESHOLDS[b.continent] || 1000);
            // Use geometric mean of thresholds
            const effective = Math.sqrt(
                (THRESHOLDS[a.continent] || 1000) * (THRESHOLDS[b.continent] || 1000)
            );
            if (dist < effective) {
                adj[i].push(j);
                adj[j].push(i);
            }
        }
    }
    return adj;
}

// ═══════════════════════════════════════════════════════════════
//  TERRITORY TERRAIN — derived from continent/latitude
// ═══════════════════════════════════════════════════════════════
function guessTerrain(country) {
    const absLat = Math.abs(country.lat);
    if (absLat > 60) return 'tundra';
    if (absLat > 45) return 'forest';
    if (country.continent === 'Africa' && absLat < 20) return 'desert';
    if (country.continent === 'Africa' && absLat < 35) return 'plains';
    if (country.continent === 'Asia' && absLat < 25) return 'plains';
    if (country.continent === 'Europe') return absLat > 50 ? 'forest' : 'plains';
    if (country.continent === 'Americas' && country.lat < 0 && absLat > 30) return 'forest';
    if (country.continent === 'Oceania') return 'island';
    return 'plains';
}

// ═══════════════════════════════════════════════════════════════
//  BUILD TERRITORIES — compatible format with existing game
//  { id, name, cx, cy, terrain, def, adj, label }
// ═══════════════════════════════════════════════════════════════
export function buildTerritories() {
    const adj = computeAdjacency();
    return COUNTRIES.map((c, i) => ({
        id: i,
        name: c.name,
        cx: c.cx,
        cy: c.cy,
        continent: c.continent,
        terrain: guessTerrain(c),
        def: 0,
        adj: adj[i],
        label: [c.cx, c.cy],
        res: { iron: c.minerals || 0, gold: c.wealth || 0, wood: 1, stone: 1, food: c.fertile || 0 },
        // No polygon — click detection uses distance to center
        poly: null,
    }));
}

// ═══════════════════════════════════════════════════════════════
//  BUILD EMPIRES — each country is a playable option
// ═══════════════════════════════════════════════════════════════
export function buildEmpires() {
    return COUNTRIES.map((c, i) => ({
        id: i,
        name: c.name,
        color: c.color,
        icon: c.flag,
        start: i, // starting territory = this country
        continent: c.continent,
    }));
}

// ═══════════════════════════════════════════════════════════════
//  COUNTRY LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════
export function getCountriesByContinent(continent) {
    if (!continent || continent === 'All') return COUNTRIES;
    return COUNTRIES.filter(c => c.continent === continent);
}

export function searchCountries(query) {
    if (!query) return COUNTRIES;
    const q = query.toLowerCase();
    return COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
}
