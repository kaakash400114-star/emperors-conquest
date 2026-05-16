/**
 * map.js — All game data: territories, empires, weapons, shop items.
 * Pure data, no logic. Add new content here.
 */

export const MAP_W = 960, MAP_H = 640, T_RADIUS = 0;

export const TERRITORIES = [
  // East Asia (right side)
  { id:0,  name:'Indus Valley',   cx:680, cy:340, terrain:'desert',      def:0, adj:[1,2,4],
    poly:[[640,310],[710,310],[720,340],[710,375],[660,380],[630,360]] },
  { id:1,  name:'Ganges',         cx:790, cy:380, terrain:'plains',      def:0, adj:[0,2,17],
    poly:[[750,345],[830,345],[840,385],[830,420],[760,420],[740,385]] },
  { id:2,  name:'Persia',         cx:600, cy:280, terrain:'desert',      def:1, adj:[0,1,3,4,6],
    poly:[[545,250],[660,250],[660,305],[630,330],[570,330],[535,300]] },
  { id:3,  name:'Mesopotamia',    cx:555, cy:340, terrain:'plains',      def:0, adj:[2,4,6,10],
    poly:[[520,310],[590,310],[600,345],[590,375],[530,380],[510,350]] },
  { id:4,  name:'Arabia',         cx:570, cy:430, terrain:'desert',      def:1, adj:[0,2,3,5],
    poly:[[530,390],[620,390],[630,435],[610,470],[540,475],[520,440]] },
  { id:5,  name:'Egypt',          cx:480, cy:460, terrain:'desert',      def:0, adj:[4,7,16],
    poly:[[445,430],[520,430],[525,470],[510,500],[450,505],[435,470]] },
  // Mediterranean & Europe (center)
  { id:6,  name:'Anatolia',       cx:520, cy:240, terrain:'mountains',   def:2, adj:[2,3,7,8,10,15],
    poly:[[475,210],[570,210],[575,255],[560,275],[490,280],[470,255]] },
  { id:7,  name:'Greece',         cx:470, cy:300, terrain:'coast',       def:1, adj:[5,6,8,15],
    poly:[[445,270],[500,270],[505,310],[490,335],[450,340],[435,310]] },
  { id:8,  name:'Italia',         cx:420, cy:340, terrain:'coast',       def:0, adj:[6,7,9,10],
    poly:[[395,310],[450,310],[455,350],[445,380],[405,385],[390,355]] },
  { id:9,  name:'Gaul',           cx:340, cy:230, terrain:'plains',      def:0, adj:[8,10,11,12,15],
    poly:[[295,200],[390,200],[395,245],[385,270],[310,275],[290,245]] },
  { id:10, name:'Hispania',       cx:310, cy:380, terrain:'peninsula',   def:1, adj:[3,6,8,9,16],
    poly:[[270,345],[355,345],[360,390],[345,425],[280,430],[265,395]] },
  // Northern Europe (top center)
  { id:11, name:'Britannia',      cx:280, cy:120, terrain:'island',      def:1, adj:[9,12,13],
    poly:[[250,85],[315,85],[320,125],[310,160],[260,165],[245,130]] },
  { id:12, name:'Germania',       cx:390, cy:160, terrain:'forest',      def:2, adj:[9,11,13,14,15],
    poly:[[350,130],[435,130],[440,175],[430,200],[360,205],[345,175]] },
  { id:13, name:'Scandinavia',    cx:360, cy:60,  terrain:'mountains',   def:2, adj:[11,12,14],
    poly:[[325,30],[400,30],[405,75],[395,105],[340,110],[320,75]] },
  { id:14, name:'Eastern Europe', cx:490, cy:160, terrain:'plains',      def:0, adj:[12,13,15],
    poly:[[455,130],[530,130],[535,175],[525,200],[465,205],[450,175]] },
  { id:15, name:'Balkans',        cx:440, cy:260, terrain:'mountains',   def:1, adj:[6,7,9,12,14],
    poly:[[405,230],[480,230],[485,265],[475,290],[415,295],[400,265]] },
  // Africa (bottom left)
  { id:16, name:'North Africa',   cx:350, cy:490, terrain:'coast',       def:1, adj:[5,10],
    poly:[[300,460],[405,460],[410,500],[395,535],[315,540],[295,505]] },
  // Far East (far right)
  { id:17, name:'Japan',          cx:880, cy:220, terrain:'island',      def:1, adj:[1],
    poly:[[850,185],[915,185],[920,225],[910,260],[855,265],[845,230]] },
];

// ═══════════════════════════════════════════════════════════
// DETAILED WORLD MAP — continents, seas, rivers, mountains
// Coordinates: 960 x 640  (Equirectangular-ish projection)
// ═══════════════════════════════════════════════════════════
export const MAP_BG = {
  ocean: [[0,0],[960,0],[960,640],[0,640]],

  // ── CONTINENT OUTLINES (detailed coastlines) ──────────────
  lands: [
    // ── EUROPE MAINLAND ──────────────────────────────────
    // Scandinavia peninsula
    [[330,10],[380,5],[410,15],[420,35],[415,60],[405,80],[395,105],
     [380,110],[360,105],[340,100],[325,80],[320,60],[325,35],[330,10]],
    // Finland / Baltic coast
    [[420,35],[445,30],[460,45],[455,70],[440,85],[420,90],[415,60],[420,35]],
    // British Isles — Great Britain
    [[248,55],[260,45],[275,42],[290,48],[300,60],[305,80],[300,100],
     [295,120],[285,135],[270,140],[258,135],[250,120],[245,100],
     [242,80],[245,65],[248,55]],
    // Ireland
    [[220,70],[235,65],[245,75],[248,90],[245,105],[235,110],[225,105],
     [218,95],[218,80],[220,70]],
    // Western Europe — Iberian Peninsula
    [[265,310],[275,295],[285,285],[300,280],[310,290],[315,310],
     [320,340],[325,370],[330,400],[325,420],[315,430],[300,435],
     [280,430],[270,415],[260,395],[258,370],[260,345],[265,310]],
    // France / Low Countries
    [[300,280],[315,260],[330,245],[350,235],[370,230],[385,225],
     [395,235],[400,250],[395,270],[385,285],[370,290],[355,295],
     [340,300],[325,310],[310,290],[300,280]],
    // Germany / Central Europe
    [[350,235],[370,220],[390,210],[410,200],[430,195],[445,200],
     [450,215],[445,235],[435,250],[420,255],[400,258],[385,260],
     [370,250],[360,240],[350,235]],
    // Italy peninsula
    [[400,280],[410,270],[420,275],[430,290],[435,310],[430,330],
     [420,350],[410,365],[400,370],[395,355],[390,335],[388,315],
     [392,295],[400,280]],
    // Sicily
    [[405,370],[415,368],[420,375],[418,385],[410,388],[405,380],[405,370]],
    // Balkans / Greece
    [[430,245],[445,235],[460,230],[475,235],[485,245],[490,260],
     [495,275],[490,290],[485,305],[475,315],[465,320],[455,315],
     [445,310],[435,300],[430,285],[428,265],[430,245]],
    // Greece peninsula
    [[465,310],[470,320],[475,335],[478,350],[475,365],[468,370],
     [462,360],[458,345],[455,330],[460,315],[465,310]],
    // Crete
    [[470,375],[480,373],[490,376],[488,382],[478,384],[470,380],[470,375]],
    // Eastern Europe — Ukraine / Russia steppe
    [[445,200],[470,190],[500,185],[530,180],[550,185],[560,200],
     [565,220],[560,240],[550,255],[535,260],[520,255],[505,250],
     [490,245],[475,240],[460,230],[450,215],[445,200]],
    // Eastern Europe south — Black Sea coast
    [[500,250],[520,245],[540,250],[555,260],[560,280],[555,295],
     [545,305],[530,310],[515,305],[505,295],[498,280],[495,265],[500,250]],

    // ── AFRICA ────────────────────────────────────────────
    // North Africa coast
    [[265,430],[300,435],[340,440],[380,445],[420,450],[460,455],
     [500,458],[530,460],[540,470],[535,490],[525,510],[510,530],
     [490,545],[465,555],[440,560],[410,565],[380,570],[350,575],
     [320,578],[290,575],[270,565],[260,545],[255,520],[258,495],
     [260,470],[262,450],[265,430]],
    // Nile Delta region (detailed)
    [[510,440],[520,435],[528,440],[530,450],[525,460],[515,465],
     [508,458],[505,448],[510,440]],

    // ── MIDDLE EAST / ANATOLIA ────────────────────────────
    // Anatolia (Turkey)
    [[480,210],[500,200],[525,195],[550,200],[570,210],[580,225],
     [575,245],[565,260],[548,270],[530,275],[510,270],[495,260],
     [485,245],[478,230],[480,210]],
    // Caucasus
    [[550,190],[570,185],[585,190],[590,200],[582,210],[570,215],
     [558,210],[550,200],[550,190]],

    // ── ARABIAN PENINSULA ─────────────────────────────────
    [[540,310],[560,300],[585,295],[610,300],[630,310],[645,330],
     [650,360],[645,390],[635,420],[620,445],[600,460],[580,465],
     [560,458],[545,440],[535,415],[530,390],[528,360],[530,335],[540,310]],

    // ── PERSIA / IRAN ─────────────────────────────────────
    [[585,200],[610,190],[640,185],[670,190],[690,200],[700,220],
     [695,245],[685,265],[670,280],[650,290],[630,295],[610,290],
     [595,275],[585,255],[580,235],[580,215],[585,200]],

    // ── CENTRAL ASIA / STEPPE ────────────────────────────
    [[580,100],[620,90],[660,85],[700,90],[730,100],[750,115],
     [740,135],[720,150],[695,160],[670,165],[645,160],[625,150],
     [610,140],[595,125],[585,110],[580,100]],

    // ── INDIAN SUBCONTINENT ───────────────────────────────
    [[640,260],[665,250],[695,245],[725,250],[755,260],[775,275],
     [790,295],[800,320],[805,350],[800,380],[790,405],[775,425],
     [755,440],[730,450],[705,455],[680,450],[660,440],[645,425],
     [635,400],[630,375],[628,350],[630,325],[632,300],[635,280],[640,260]],
    // Sri Lanka
    [[735,455],[745,452],[752,458],[750,468],[742,470],[735,464],[735,455]],

    // ── SOUTHEAST ASIA ────────────────────────────────────
    [[800,260],[820,250],[840,255],[855,270],[860,290],[855,310],
     [845,325],[830,335],[815,330],[805,315],[798,295],[795,275],[800,260]],
    // Indochina
    [[830,335],[845,340],[855,355],[860,375],[855,395],[845,410],
     [830,415],[818,405],[810,385],[808,365],[812,345],[820,338],[830,335]],

    // ── FAR EAST — China / Korea ─────────────────────────
    [[750,120],[780,110],[810,105],[840,110],[860,120],[875,135],
     [880,155],[878,175],[870,190],[855,200],[835,205],[815,200],
     [795,195],[780,185],[768,170],[760,150],[755,135],[750,120]],
    // Korean Peninsula
    [[870,120],[878,115],[885,125],[888,145],[885,160],[880,170],
     [873,165],[868,150],[867,135],[870,120]],

    // ── JAPAN ─────────────────────────────────────────────
    // Hokkaido
    [[900,70],[915,65],[925,72],[922,85],[912,90],[902,85],[900,75],[900,70]],
    // Honshu
    [[895,95],[905,88],[918,92],[928,105],[932,125],[930,150],
     [925,170],[918,185],[908,192],[898,188],[890,175],[886,155],
     [885,135],[888,115],[892,102],[895,95]],
    // Shikoku
    [[898,195],[908,192],[915,198],[913,208],[905,212],[898,207],[898,195]],
    // Kyushu
    [[882,185],[892,180],[900,185],[902,198],[898,210],[890,215],
     [883,210],[880,200],[882,185]],

    // ════════════════════════════════════════════════════════════
    // NEW WORLD — NORTH AMERICA
    // ════════════════════════════════════════════════════════════
    // Alaska
    [[8,50],[20,35],[40,28],[60,32],[75,45],[80,65],[70,80],
     [55,85],[35,80],[18,72],[10,60],[8,50]],
    // Western Canada / British Columbia
    [[55,85],[80,65],[100,55],[125,48],[145,45],[160,50],
     [165,65],[155,80],[140,90],[120,95],[100,100],[80,100],[60,95],[55,85]],
    // Central Canada (Prairies/Hudson Bay region)
    [[145,45],[170,35],[195,30],[215,35],[225,50],[230,70],
     [225,90],[210,100],[190,105],[170,100],[155,95],[145,85],[145,45]],
    // Eastern Canada (Quebec/Maritime)
    [[215,35],[230,28],[240,32],[248,48],[245,65],[235,78],
     [225,90],[225,50],[215,35]],
    // Hudson Bay
    [[165,65],[185,60],[200,65],[205,80],[195,90],[180,92],
     [168,85],[165,72],[165,65]],
    // USA Pacific Northwest
    [[80,100],[100,100],[115,95],[125,100],[130,115],[125,130],
     [110,135],[95,130],[82,120],[78,110],[80,100]],
    // USA West (California/Nevada)
    [[60,130],[78,120],[82,130],[95,130],[105,140],[100,155],
     [90,165],[75,170],[60,165],[50,155],[48,142],[55,135],[60,130]],
    // USA Central (Great Plains)
    [[110,135],[125,130],[140,135],[155,140],[170,145],[180,155],
     [175,170],[165,180],[150,185],[135,180],[120,175],[110,165],
     [105,155],[110,135]],
    // USA East (Appalachians/Atlantic coast)
    [[180,155],[195,148],[210,145],[225,148],[235,158],[240,175],
     [235,190],[225,200],[210,205],[195,200],[180,195],[170,185],
     [175,170],[180,155]],
    // Florida
    [[195,200],[210,205],[218,215],[220,230],[215,240],[205,238],
     [195,230],[190,218],[192,208],[195,200]],
    // Mexico
    [[75,170],[90,165],[105,170],[120,175],[130,185],[135,200],
     [130,215],[120,228],[105,235],[90,230],[78,220],[70,205],
     [65,190],[68,178],[75,170]],
    // Central America
    [[105,235],[120,228],[130,240],[135,255],[128,265],[118,268],
     [108,260],[100,248],[102,240],[105,235]],
    // Caribbean islands
    // Cuba
    [[95,225],[110,220],[125,222],[128,230],[120,235],[105,235],[95,230],[95,225]],
    // Hispaniola
    [[130,228],[142,225],[150,228],[148,235],[138,238],[130,235],[130,228]],

    // ════════════════════════════════════════════════════════════
    // NEW WORLD — SOUTH AMERICA
    // ════════════════════════════════════════════════════════════
    // Colombia / Venezuela / Guianas
    [[118,268],[135,265],[155,268],[170,275],[180,285],[185,300],
     [178,310],[165,315],[148,318],[132,315],[120,305],[115,290],
     [112,278],[118,268]],
    // Brazil (Amazon basin)
    [[148,318],[165,315],[185,310],[205,308],[225,312],[240,320],
     [248,335],[250,355],[245,375],[235,390],[220,400],[200,405],
     [180,400],[165,395],[152,385],[142,370],[135,350],[132,330],
     [138,320],[148,318]],
    // Peru / Ecuador
    [[115,290],[120,305],[118,320],[115,335],[110,350],[105,365],
     [100,375],[95,368],[92,355],[90,340],[92,325],[95,310],[108,298],[115,290]],
    // Bolivia / Paraguay
    [[165,395],[180,400],[195,405],[205,415],[200,425],[188,430],
     [175,428],[162,420],[155,408],[160,398],[165,395]],
    // Chile / Argentina
    [[95,375],[105,380],[115,385],[125,395],[132,410],[135,430],
     [130,450],[122,470],[115,490],[108,510],[100,525],[92,530],
     [85,520],[82,500],[80,480],[82,460],[85,440],[88,420],
     [90,400],[92,385],[95,375]],
    // Patagonia
    [[100,525],[108,520],[115,530],[118,545],[112,555],[105,555],
     [98,548],[95,538],[100,525]],

    // ════════════════════════════════════════════════════════════
    // EXTENDED AFRICA (south of current north coast)
    // ════════════════════════════════════════════════════════════
    // West Africa bulge (Senegal/Guinea)
    [[260,470],[275,465],[290,468],[300,478],[305,492],[298,505],
     [285,512],[270,510],[258,500],[255,485],[258,475],[260,470]],
    // Congo / Central Africa
    [[310,510],[330,505],[350,508],[370,515],[385,525],[390,540],
     [385,555],[370,565],[350,570],[330,568],[315,560],[305,545],
     [300,530],[302,518],[310,510]],
    // East Africa (Horn of Africa / Tanzania)
    [[390,465],[410,460],[430,462],[445,470],[450,485],[448,500],
     [440,515],[425,525],[410,530],[395,525],[385,515],[380,500],
     [378,485],[382,472],[390,465]],
    // Southern Africa
    [[305,545],[325,540],[345,545],[365,555],[380,568],[390,582],
     [388,598],[378,610],[362,618],[345,620],[328,615],[315,605],
     [305,590],[298,575],[300,558],[305,545]],
    // Madagascar
    [[435,530],[445,525],[452,532],[450,548],[442,558],[435,555],
     [430,542],[432,535],[435,530]],

    // ════════════════════════════════════════════════════════════
    // GREENLAND
    // ════════════════════════════════════════════════════════════
    [[155,8],[175,2],[200,5],[218,12],[225,28],[220,45],[208,55],
     [190,60],[170,58],[155,50],[148,38],[145,22],[148,12],[155,8]],

    // ════════════════════════════════════════════════════════════
    // AUSTRALIA / OCEANIA
    // ════════════════════════════════════════════════════════════
    // Australia mainland
    [[830,460],[855,452],[880,455],[905,460],[920,472],[928,490],
     [925,510],[915,525],[900,535],[880,540],[858,538],[840,530],
     [828,518],[822,500],[820,482],[824,468],[830,460]],
    // New Zealand
    [[920,545],[928,540],[935,548],[933,562],[926,570],[920,565],
     [916,555],[918,548],[920,545]],
    // Papua New Guinea
    [[860,430],[878,425],[895,428],[900,438],[892,445],[878,448],
     [865,445],[858,438],[860,430]],

    // ════════════════════════════════════════════════════════════
    // ANTARCTICA (hint at bottom)
    // ════════════════════════════════════════════════════════════
    [[100,635],[200,628],[350,625],[500,627],[650,625],[800,628],
     [900,632],[920,638],[920,645],[800,643],[650,642],[500,643],
     [350,642],[200,643],[100,645],[100,635]],
  ],

  // ── SEA / OCEAN LABELS (position, name) ──────────────────
  seas: [
    { name: 'ATLANTIC OCEAN', x: 180, y: 300, size: 14, angle: -0.3 },
    { name: 'MEDITERRANEAN SEA', x: 400, y: 395, size: 11, angle: 0.1 },
    { name: 'NORTH SEA', x: 280, y: 145, size: 10, angle: 0 },
    { name: 'BALTIC SEA', x: 390, y: 120, size: 9, angle: 0.1 },
    { name: 'BLACK SEA', x: 545, y: 250, size: 10, angle: 0 },
    { name: 'RED SEA', x: 545, y: 385, size: 10, angle: -0.5 },
    { name: 'PERSIAN GULF', x: 620, y: 330, size: 9, angle: -0.2 },
    { name: 'ARABIAN SEA', x: 680, y: 410, size: 10, angle: 0 },
    { name: 'INDIAN OCEAN', x: 720, y: 510, size: 13, angle: 0 },
    { name: 'SOUTH CHINA SEA', x: 840, y: 320, size: 9, angle: 0 },
    { name: 'SEA OF JAPAN', x: 880, y: 165, size: 9, angle: -0.4 },
    { name: 'CASPIAN SEA', x: 600, y: 180, size: 9, angle: 0 },
    { name: 'BAY OF BENGAL', x: 790, y: 340, size: 9, angle: 0.2 },
    { name: 'PACIFIC OCEAN', x: 50, y: 350, size: 14, angle: -0.2 },
    { name: 'CARIBBEAN SEA', x: 130, y: 248, size: 8, angle: 0 },
    { name: 'GULF OF MEXICO', x: 115, y: 210, size: 8, angle: 0.1 },
    { name: 'SOUTH ATLANTIC', x: 200, y: 450, size: 11, angle: -0.1 },
    { name: 'SOUTHERN OCEAN', x: 500, y: 618, size: 11, angle: 0 },
    { name: 'AUSTRALASIA', x: 880, y: 490, size: 9, angle: 0 },
  ],

  // ── RIVERS (array of point arrays) ───────────────────────
  rivers: [
    // Nile
    { name: 'Nile', pts: [[515,445],[518,455],[520,465],[518,478],[515,490],[510,500],[505,510],[500,520]], width: 2 },
    // Danube
    { name: 'Danube', pts: [[400,210],[420,215],[440,225],[460,235],[480,245],[500,250]], width: 1.5 },
    // Rhine
    { name: 'Rhine', pts: [[370,165],[375,185],[378,205],[380,220],[382,240]], width: 1.5 },
    // Tigris
    { name: 'Tigris', pts: [[565,240],[570,260],[568,280],[565,300],[560,315],[555,330]], width: 1.5 },
    // Euphrates
    { name: 'Euphrates', pts: [[555,225],[560,240],[558,255],[555,270],[548,285],[540,300],[535,310]], width: 1.5 },
    // Indus
    { name: 'Indus', pts: [[660,280],[655,300],[650,320],[645,340],[640,355]], width: 1.5 },
    // Ganges
    { name: 'Ganges', pts: [[750,280],[755,300],[760,320],[765,340],[770,360],[775,380]], width: 1.5 },
    // Yangtze
    { name: 'Yangtze', pts: [[810,140],[815,160],[820,180],[818,200],[815,220],[810,240]], width: 1.5 },
    // Volga
    { name: 'Volga', pts: [[510,120],[515,140],[520,160],[522,180],[518,200]], width: 1.5 },
    // Mississippi
    { name: 'Mississippi', pts: [[155,120],[158,140],[155,160],[150,180],[148,200],[145,218]], width: 2 },
    // Amazon
    { name: 'Amazon', pts: [[175,330],[185,340],[195,350],[200,365],[195,380],[185,395]], width: 2.5 },
    // Rio de la Plata
    { name: 'Parana', pts: [[155,400],[160,410],[158,425],[152,440],[148,450]], width: 1.5 },
    // Congo
    { name: 'Congo', pts: [[350,510],[355,520],[358,535],[355,548],[350,558]], width: 1.5 },
    // Niger
    { name: 'Niger', pts: [[275,468],[280,478],[285,490],[282,500],[278,508]], width: 1.5 },
    // Murray (Australia)
    { name: 'Murray', pts: [[870,520],[878,515],[885,508],[890,500],[892,490]], width: 1.5 },
    // Mackenzie (Canada)
    { name: 'Mackenzie', pts: [[80,70],[85,80],[90,90],[95,100]], width: 1.5 },
    // Columbia (US)
    { name: 'Columbia', pts: [[90,105],[95,115],[100,125],[105,135]], width: 1.5 },
  ],

  // ── MOUNTAIN RANGES (array of point arrays for drawing) ─
  mountains: [
    // Alps
    { name: 'Alps', pts: [[370,230],[390,225],[410,220],[430,225],[445,230]], color: '#8B7355' },
    // Pyrenees
    { name: 'Pyrenees', pts: [[285,285],[300,280],[315,282],[330,285]], color: '#8B7355' },
    // Carpathians
    { name: 'Carpathians', pts: [[450,200],[460,210],[465,225],[460,240],[455,250]], color: '#7B6345' },
    // Caucasus
    { name: 'Caucasus', pts: [[555,190],[565,195],[575,200],[580,210]], color: '#8B7355' },
    // Himalayas
    { name: 'Himalayas', pts: [[700,260],[720,255],[740,258],[760,262],[780,260]], color: '#9B8365' },
    // Zagros
    { name: 'Zagros', pts: [[590,240],[600,250],[605,265],[600,280]], color: '#8B7355' },
    // Hindu Kush
    { name: 'Hindu Kush', pts: [[660,240],[670,250],[675,265],[670,275]], color: '#7B6345' },
    // Urals
    { name: 'Urals', pts: [[550,80],[555,100],[558,120],[555,140],[550,160]], color: '#7B6345' },
    // Atlas Mountains
    { name: 'Atlas Mts.', pts: [[270,435],[290,430],[310,432],[330,435]], color: '#8B7355' },
    // Rocky Mountains (North America)
    { name: 'Rockies', pts: [[70,90],[78,110],[85,130],[90,150],[95,170],[100,190]], color: '#8B7355' },
    // Andes (South America)
    { name: 'Andes', pts: [[95,380],[100,400],[105,420],[108,440],[110,460],[108,480],[105,500],[100,520]], color: '#9B8365' },
    // Appalachian Mountains
    { name: 'Appalachians', pts: [[200,155],[210,165],[215,178],[212,190],[208,200]], color: '#7B6345' },
    // Great Dividing Range (Australia)
    { name: 'Great Dividing', pts: [[890,465],[895,478],[898,490],[900,505],[895,518],[890,525]], color: '#8B7355' },
    // Drakensberg (South Africa)
    { name: 'Drakensberg', pts: [[360,590],[370,595],[375,605],[370,612],[360,610]], color: '#7B6345' },
    // Ethiopian Highlands
    { name: 'Ethiopian Mts.', pts: [[420,470],[430,475],[435,485],[430,492],[420,488]], color: '#8B7355' },
  ],

  // ── DESERT REGIONS (subtle sand-colored areas) ───────────
  deserts: [
    // Sahara
    [[265,440],[350,435],[430,445],[500,450],[530,455],[535,490],[525,520],[500,540],[460,550],[400,555],[340,555],[290,545],[265,520],[260,490],[260,460],[265,440]],
    // Arabian Desert
    [[545,320],[580,310],[620,315],[640,330],[645,360],[635,390],[615,410],[590,420],[565,410],[550,390],[540,365],[538,340],[545,320]],
    // Thar Desert (India)
    [[660,310],[680,305],[700,310],[710,325],[705,340],[690,345],[675,340],[665,330],[660,310]],
    // Gobi Desert
    [[700,130],[730,125],[760,130],[775,145],[770,160],[750,165],[725,160],[710,150],[700,130]],
    // Sonoran Desert (US Southwest)
    [[60,140],[75,135],[90,140],[95,155],[88,165],[75,168],[62,160],[58,148],[60,140]],
    // Kalahari Desert (Southern Africa)
    [[340,575],[360,570],[380,575],[385,590],[378,600],[360,605],[345,600],[338,588],[340,575]],
    // Outback (Australia)
    [[840,480],[860,475],[880,478],[895,485],[900,500],[895,515],[878,520],[860,518],[845,510],[835,495],[838,485],[840,480]],
    // Patagonian Desert
    [[95,500],[110,495],[125,500],[130,510],[125,520],[110,525],[98,518],[92,508],[95,500]],
  ],

  // ── FOREST REGIONS (subtle green areas) ──────────────────
  forests: [
    // Germanic forests
    [[360,190],[380,185],[400,190],[410,205],[405,220],[390,225],[375,220],[365,210],[360,190]],
    // Scandinavian taiga
    [[340,40],[365,35],[390,40],[400,55],[395,70],[380,80],[360,75],[345,65],[340,50],[340,40]],
    // Eastern European forests
    [[460,180],[480,175],[500,180],[510,195],[505,210],[490,215],[475,210],[465,200],[460,180]],
    // Amazon Rainforest
    [[170,340],[195,335],[220,338],[240,345],[248,360],[245,378],[232,390],[215,395],[195,392],[178,385],[165,370],[162,355],[165,345],[170,340]],
    // Canadian boreal forest
    [[100,70],[130,62],[160,58],[185,62],[200,72],[195,85],[175,92],[150,95],[125,92],[108,85],[100,78],[100,70]],
    // Congo Rainforest
    [[335,520],[355,515],[375,520],[385,535],[380,550],[365,558],[348,555],[335,545],[330,530],[335,520]],
    // Southeast US forests
    [[180,165],[200,160],[220,165],[230,175],[225,190],[210,195],[195,192],[182,182],[180,165]],
  ],

  // ── ISLANDS (small decorative islands) ───────────────────
  islands: [
    // Corsica/Sardinia
    { cx: 385, cy: 310, rx: 8, ry: 18 },
    // Cyprus
    { cx: 540, cy: 280, rx: 12, ry: 6 },
    // Malta
    { cx: 420, cy: 370, rx: 4, ry: 3 },
    // Java/Sumatra region
    { cx: 830, cy: 430, rx: 20, ry: 5 },
    { cx: 840, cy: 445, rx: 15, ry: 4 },
    // Taiwan
    { cx: 860, cy: 210, rx: 5, ry: 10 },
    // Madagascar
    { cx: 630, cy: 520, rx: 8, ry: 20 },
    // Borneo
    { cx: 845, cy: 395, rx: 15, ry: 12 },
    // Philippines
    { cx: 870, cy: 300, rx: 8, ry: 15 },
    // Iceland
    { cx: 210, cy: 18, rx: 15, ry: 8 },
    // Svalbard
    { cx: 290, cy: 5, rx: 10, ry: 5 },
    // Greenland coast (small)
    { cx: 180, cy: 35, rx: 5, ry: 8 },
    // Bermuda
    { cx: 200, cy: 195, rx: 4, ry: 4 },
    // Canary Islands
    { cx: 250, cy: 430, rx: 8, ry: 3 },
    // Cape Verde
    { cx: 240, cy: 465, rx: 5, ry: 4 },
    // Sri Lanka (duplicate removed - already a polygon)
    // Tasmania
    { cx: 910, cy: 555, rx: 6, ry: 8 },
    // Fiji
    { cx: 930, cy: 480, rx: 5, ry: 5 },
    // Hawaii
    { cx: 15, cy: 320, rx: 8, ry: 3 },
  ],
};

export const EMPIRES = {
  maurya:  { id:'maurya',  name:'Maurya Empire',       era:'Ancient India 322 BC',   color:'#e67e22', dark:'#d35400', light:'#f39c12', text:'#fff',
             bonus:'+2 coins per territory', bonusType:'income', icon:'\u2694' },
  roman:   { id:'roman',   name:'Roman Empire',        era:'Ancient Rome 27 BC',      color:'#c0392b', dark:'#922b21', light:'#e74c3c', text:'#fff',
             bonus:'+1 defense all territories',       bonusType:'defense', icon:'\u265E' },
  mongol:  { id:'mongol',  name:'Mongol Empire',       era:'Mongolia 1206 AD',        color:'#7f8c8d', dark:'#5d6d7e', light:'#95a5a6', text:'#fff',
             bonus:'+1 attack in combat',              bonusType:'attack', icon:'\u2694' },
  ottoman: { id:'ottoman', name:'Ottoman Empire',      era:'Turkey 1299 AD',          color:'#16a085', dark:'#0e6655', light:'#1abc9c', text:'#fff',
             bonus:'+1 defense mountains',             bonusType:'fortress', icon:'\u2626' },
  british: { id:'british', name:'British Empire',      era:'England 1588 AD',         color:'#2c3e50', dark:'#1a252f', light:'#34495e', text:'#fff',
             bonus:'+2 coins per territory',            bonusType:'bonus', icon:'\u2693' },
  napoleon:{ id:'napoleon',name:"Napoleon's France",   era:'France 1804 AD',          color:'#2980b9', dark:'#1f618d', light:'#3498db', text:'#fff',
             bonus:'+2 attack on plains',              bonusType:'plains', icon:'\u2660' },
  japan:   { id:'japan',   name:'Imperial Japan',      era:'Japan 1868 AD',           color:'#e74c3c', dark:'#c0392b', light:'#ff6b6b', text:'#fff',
             bonus:'+2 defense on islands',            bonusType:'island', icon:'\u265B' },
  germany: { id:'germany', name:'Nazi Germany',        era:'Germany 1939 AD',         color:'#444444', dark:'#222222', light:'#666666', text:'#fff',
             bonus:'+3 coins per territory',          bonusType:'warMachine', icon:'\u2620' },
  russia:  { id:'russia',  name:'Soviet Russia',      era:'USSR 1922 AD',            color:'#cc0000', dark:'#990000', light:'#ff3333', text:'#fff',
             bonus:'Soldiers cost -5 coins',           bonusType:'cheap', icon:'\u2603' },
  egypt:   { id:'egypt',   name:'Egyptian Empire',     era:'Egypt 3100 BC',           color:'#f1c40f', dark:'#d4a017', light:'#f7dc6f', text:'#1a1a2e',
             bonus:'+3 coins from desert territories',  bonusType:'desert', icon:'\u2600' },
};

export const EIDS = Object.keys(EMPIRES);

  // FIX: Japan now connects to Ganges [1] (Asian sea route) instead of Eastern Europe [14] / Scandinavia [13]
export const STARTS = {
  maurya:  { t:[0,1],       troops:[6,4] },
  roman:   { t:[8],         troops:[7] },
  mongol:  { t:[3],         troops:[6] },
  ottoman: { t:[6,15],      troops:[5,3] },
  british: { t:[11],        troops:[6] },
  napoleon:{ t:[9],         troops:[6] },
  japan:   { t:[17],        troops:[5] },
  germany: { t:[12],        troops:[6] },
  russia:  { t:[13,14],     troops:[4,5] },
  egypt:   { t:[5],         troops:[6] },
};

// Neutrals: territories with no owner at start, but some troops guarding them
// Territory 14 is no longer neutral since Russia starts there
export const NEUTRALS = { 2:3, 4:3, 7:3, 10:3, 16:3 };

// Weapons: tier → name, atk bonus, def bonus, cost to unlock
// Tier 1 weapons are free. Higher tiers must be unlocked.
// Weapon bonuses are now capped in combat.js to prevent trivialization.
export const WEAPONS = {
  1: [
    { name:'Sword',     atk:1, def:0, cost:0,  icon:'\u2694' },
    { name:'Spear',     atk:0, def:1, cost:0,  icon:'\u265E' },
    { name:'Bow',       atk:2, def:0, cost:0,  icon:'\u{1F3F9}' },
  ],
  2: [
    { name:'Musket',    atk:2, def:0, cost:30, icon:'\u{1F52B}' },
    { name:'Knight',    atk:1, def:2, cost:35, icon:'\u265E' },
    { name:'Cannon',    atk:3, def:0, cost:40, icon:'\u{1F4A3}' },
  ],
  3: [
    { name:'Rifle',     atk:3, def:0, cost:60, icon:'\u{1F52B}' },
    { name:'Artillery', atk:4, def:0, cost:70, icon:'\u{1F4A3}' },
    { name:'Cavalry',   atk:2, def:2, cost:55, icon:'\u{1F40E}' },
  ],
  4: [
    { name:'Machine Gun',atk:4, def:0, cost:100,icon:'\u{1F52B}' },
    { name:'Tank',       atk:5, def:3, cost:120,icon:'\u{1F3FB}' },
    { name:'Bomber',     atk:6, def:0, cost:150,icon:'\u2708' },
  ],
};

// Shop items
export const SHOP = {
  soldier:   { name:'Soldier',       cost:10, desc:'+1 troop' },
  veteran:   { name:'Veteran',       cost:20, desc:'+2 troops' },
  fortify:   { name:'Fortify',       cost:15, desc:'+2 defense (permanent)' },
  weaponT2:  { name:'Medieval Arms', cost:25, desc:'Unlock Tier 2 weapons' },
  weaponT3:  { name:'Gunpowder Age', cost:50, desc:'Unlock Tier 3 weapons' },
  weaponT4:  { name:'Modern Warfare',cost:80, desc:'Unlock Tier 4 weapons' },
  spy:       { name:'Spy Network',   cost:30, desc:'See enemy troop counts' },
};

// Combat strategies
export const STRATEGIES = [
  { id:'assault', name:'Full Assault', desc:'All troops attack — high risk, high reward', atkMod:0, defMod:0 },
  { id:'siege',   name:'Siege',        desc:'Ignore enemy terrain defense bonus',       atkMod:-1, defMod:0, ignoreDef:true },
  { id:'raid',    name:'Raid',         desc:'Quick strike — fewer losses on win',       atkMod:1, defMod:-1 },
  { id:'ambush',  name:'Ambush',       desc:'+2 attack from forests & mountains',       atkMod:2, defMod:0, needTerrain:['forest','mountains'] },
];

// Terrain icons for visual indicators
export const TERRAIN_ICONS = {
  desert:    '\u2600',
  plains:    '\u{1F33E}',
  mountains: '\u26F0',
  coast:     '\u{1F30A}',
  island:    '\u{1F3DD}',
  forest:    '\u{1F332}',
  peninsula: '\u{1F3D4}',
};

// Terrain display colors (subtle overlay tint)
export const TERRAIN_COLORS = {
  desert:    'rgba(244,164,96,0.25)',
  plains:    'rgba(144,238,144,0.2)',
  mountains: 'rgba(169,169,169,0.25)',
  coast:     'rgba(100,149,237,0.2)',
  island:    'rgba(100,149,237,0.25)',
  forest:    'rgba(34,139,34,0.25)',
  peninsula: 'rgba(210,180,140,0.2)',
};

// ═══════════════════════════════════════════════════════════
// HISTORICAL STORIES — Educational facts for each empire
// ═══════════════════════════════════════════════════════════
export const EMPIRE_STORIES = {
  maurya: [
    "Chandragupta Maurya founded the Maurya Empire in 322 BC after overthrowing the Nanda dynasty. He was mentored by the brilliant strategist Chanakya (Kautilya).",
    "Emperor Ashoka the Great ruled the Maurya Empire from 268 to 232 BC. After the bloody Kalinga War, he embraced Buddhism and spread peace across Asia.",
    "The Maurya Empire was the largest empire in the Indian subcontinent, spanning over 5 million square kilometers at its peak.",
    "Chanakya wrote the Arthashastra, an ancient treatise on economics, politics, and military strategy that is still studied today.",
    "Ashoka built 84,000 stupas across his empire and sent missionaries to Sri Lanka, Central Asia, and the Middle East to spread Buddhism.",
    "The Mauryan army had over 600,000 infantry, 30,000 cavalry, and 9,000 war elephants — one of the largest military forces of the ancient world.",
    "The Lion Capital of Ashoka, built in 250 BC, is now the national emblem of India and appears on every Indian currency note.",
    "Mauryan cities had advanced drainage systems, public hospitals, and free rest houses for travelers — innovations far ahead of their time.",
  ],
  roman: [
    "The Roman Empire at its peak controlled 5 million square kilometers around the Mediterranean, ruling over 70 million people — 25% of the world's population.",
    "Julius Caesar crossed the Rubicon River in 49 BC, starting a civil war that ended the Roman Republic and gave birth to the Roman Empire.",
    "The Romans built over 400,000 km of roads, connecting every corner of their empire. Many modern European roads still follow Roman routes today.",
    "Roman concrete (opus caementicium) was revolutionary — structures like the Pantheon, built nearly 2,000 years ago, still stand today.",
    "The Colosseum could seat 50,000 spectators and had a retractable awning called the velarium to shade audiences from the sun.",
    "Roman legions were organized into centuries of 80 men. A full legion had 5,200 soldiers and was the most disciplined fighting force of the ancient world.",
    "The Roman Empire split into Western and Eastern halves in 395 AD. The Western Empire fell in 476 AD, but the Eastern (Byzantine) Empire lasted until 1453.",
    "Hadrian's Wall, stretching 117 km across northern England, was built to keep out Pictish raiders and marked the northern frontier of the Empire.",
  ],
  mongol: [
    "Genghis Khan united the Mongol tribes in 1206 and built the largest contiguous land empire in history, stretching from Korea to Hungary.",
    "At its peak, the Mongol Empire covered 24 million square kilometers — that's 16% of Earth's total land area.",
    "The Mongol postal system (Yam) used relay stations every 30 km. A message could travel 400 km per day — faster than any system before it.",
    "Mongol horsemen could fire arrows accurately while riding at full gallop, and each warrior traveled with 3-5 remount horses.",
    "Genghis Khan promoted people based on merit, not birth. His generals included former enemies and people from conquered nations.",
    "The Mongol Empire fostered the Pax Mongolica — a century of peace that allowed trade, ideas, and technologies to flow freely across Eurasia.",
    "Kublai Khan, grandson of Genghis, established the Yuan Dynasty in China and built the Forbidden City's predecessor in Beijing.",
    "The Black Death (bubonic plague) likely traveled along Mongol trade routes from Central Asia to Europe in the 1340s.",
  ],
  ottoman: [
    "The Ottoman Empire was founded in 1299 by Osman I and lasted for over 600 years until 1922 — one of the longest-lasting empires in history.",
    "Sultan Suleiman the Magnificent (1520-1566) made the Ottoman Empire the world's most powerful state and was known as 'The Lawgiver' for his justice reforms.",
    "The Ottoman Empire controlled the Silk Road trade routes between Europe and Asia for centuries, making Istanbul the world's richest city.",
    "The Janissaries were elite infantry units formed from Christian boys who were educated, converted to Islam, and trained as soldiers from childhood.",
    "The Siege of Constantinople in 1453 used the largest cannons ever built — Orban's cannon fired 600 kg stone balls and helped breach the legendary Theodosian Walls.",
    "Ottoman architecture reached its peak with the Süleymaniye Mosque, designed by the genius architect Mimar Sinan, who built over 300 structures.",
    "The Ottoman Empire spanned three continents — Europe, Asia, and Africa — at its greatest extent under Mehmed II and Suleiman the Magnificent.",
    "Coffee was introduced to Europe through the Ottoman Empire. The word 'coffee' comes from the Turkish word 'kahve'.",
  ],
  british: [
    "The British Empire was the largest empire in history, covering 25% of the world's land area and ruling over 400 million people at its peak.",
    "The British Empire spanned every time zone on Earth. It was said that 'the sun never sets on the British Empire.'",
    "The Royal Navy was the most powerful fleet in the world for over 200 years, ensuring British dominance of global trade routes.",
    "The Industrial Revolution began in Britain in the 1760s, transforming the world from agricultural to industrial economies forever.",
    "The British East India Company, founded in 1600, became the most powerful corporation in history and eventually ruled India with a private army of 260,000 soldiers.",
    "Queen Victoria (1837-1901) reigned for 63 years, and her name defines an entire era — the Victorian Age — of culture, science, and empire.",
    "The British Empire built over 60,000 miles of railways across its colonies, including the famous Indian railway system that still operates today.",
    "The Magna Carta of 1215, signed by King John, established the principle that even kings must obey the law — a foundation of modern democracy.",
  ],
  napoleon: [
    "Napoleon Bonaparte rose from a minor Corsican noble family to become Emperor of France, conquering most of Europe before his final defeat at Waterloo in 1815.",
    "The Napoleonic Code (1804) reformed French law and became the basis for legal systems in over 40 countries worldwide.",
    "Napoleon's Grande Armée of 600,000 soldiers invaded Russia in 1812, but only about 100,000 survived the brutal winter retreat — one of history's greatest military disasters.",
    "Napoleon was not short! At 5'7\" (1.70m), he was actually average height for his time. The myth came from British propaganda and confusion between French and English inches.",
    "The Arc de Triomphe in Paris, commissioned by Napoleon in 1806, took 30 years to build and remains one of the world's most iconic monuments.",
    "Napoleon won 60 of his 72 battles, making him one of the most successful military commanders in recorded history.",
    "The Louisiana Purchase (1803) — Napoleon's sale of French territory to the United States for $15 million — doubled the size of the USA overnight.",
    "Napoleon established the Légion d'honneur (Legion of Honour) in 1802. It remains France's highest award and is given for outstanding achievements.",
  ],
  japan: [
    "Imperial Japan emerged from the Meiji Restoration of 1868, which transformed Japan from an isolated feudal state into a modern industrial power in just 40 years.",
    "The samurai code of Bushido emphasized honor, loyalty, and self-discipline. Samurai were the warrior class of Japan for nearly 700 years.",
    "Japan's feudal era lasted from 1185 to 1868. During this time, the Shogun (military dictator) held real power while the Emperor was a figurehead.",
    "The Battle of Sekigahara in 1600 unified Japan under Tokugawa Ieyasu and began 268 years of peace — the Edo Period.",
    "Admiral Togo Heihachiro, the 'Nelson of the East,' destroyed the Russian fleet at the Battle of Tsushima in 1905 — the first time an Asian power defeated a European one.",
    "Mount Fuji, Japan's sacred volcano at 3,776 meters, has been a symbol of Japan for centuries and appears in over 30,000 works of art.",
    "Japanese castle architecture reached its peak in the 16th century. Himeji Castle, known as the 'White Heron Castle,' is considered Japan's most beautiful.",
    "The Kamikaze ('divine wind') typhoons destroyed two Mongol invasion fleets in 1274 and 1281, saving Japan from conquest by Kublai Khan.",
  ],
  germany: [
    "The unification of Germany in 1871 under Otto von Bismarck created a powerful new European nation that would reshape world history.",
    "The Prussian military tradition produced some of history's most skilled generals, using the 'Kriegsspiel' (war game) to train officers.",
    "The Autobahn highway system, begun in the 1930s, was the first limited-access highway network in the world and inspired modern interstate systems.",
    "German scientists led the world in physics and chemistry. Einstein, Planck, and Heisenberg all made discoveries that changed our understanding of the universe.",
    "The Treaty of Versailles (1919) imposed harsh penalties on Germany after World War I, creating economic hardship that contributed to the rise of extremism.",
    "The Blitzkrieg ('lightning war') strategy combined tanks, aircraft, and rapid infantry movement to achieve victories before enemies could react.",
    "German engineering produced revolutionary weapons including the V-2 rocket, the first ballistic missile and the ancestor of all modern space rockets.",
    "The Berlin Wall (1961-1989) became the most powerful symbol of the Cold War division between East and West. Its fall in 1989 united Germany once more.",
  ],
  russia: [
    "The Soviet Union was formed in 1922 and became one of two superpowers that defined the 20th century, along with the United States.",
    "The Battle of Stalingrad (1942-43) was the turning point of World War II. Over 2 million soldiers and civilians died — the bloodiest battle in human history.",
    "The Trans-Siberian Railway stretches 9,289 km from Moscow to Vladivostok, crossing 7 time zones. It took 25 years to build.",
    "Soviet science achieved extraordinary milestones: the first satellite (Sputnik, 1957), the first animal in orbit (Laika, 1957), and the first human in space (Yuri Gagarin, 1961).",
    "The Soviet Union had the world's largest army, with over 5 million soldiers at its peak during the Cold War.",
    "Ivan the Terrible was the first Tsar of Russia (1547-1584). He expanded Russia's territory but was also known for his brutal purges.",
    "Peter the Great (1682-1725) modernized Russia by building a new capital, St. Petersburg, modeled on European cities and designed by Italian architects.",
    "The Russian winter has defeated multiple invading armies — Napoleon's Grande Armée in 1812 and Hitler's Wehrmacht in 1941-42.",
  ],
  egypt: [
    "Ancient Egypt's civilization lasted over 3,000 years — from 3100 BC to 30 BC — making it one of the longest-lasting civilizations in history.",
    "The Great Pyramid of Giza, built around 2560 BC, was the tallest man-made structure in the world for 3,800 years. It is built from 2.3 million stone blocks.",
    "Cleopatra VII, the last pharaoh of Egypt, lived closer in time to the Moon landing (1969) than to the building of the Great Pyramid.",
    "Ancient Egyptians invented papyrus paper, the 365-day calendar, toothpaste, and surgical instruments — innovations we still use today.",
    "Tutankhamun became pharaoh at age 9 and died at 19. His tomb, discovered in 1922 by Howard Carter, contained over 5,000 artifacts.",
    "Ramses II (1279-1213 BC) ruled for 66 years, had over 100 children, and built more monuments than any other pharaoh.",
    "The Rosetta Stone, discovered in 1799, allowed scholars to decode Egyptian hieroglyphs for the first time in 1,400 years.",
    "Ancient Egyptians believed in the afterlife and mummified their dead. The entire process took 70 days and involved removing all internal organs except the heart.",
  ],
};

// Territory-specific historical facts (shown when territory is selected/conquered)
export const TERRITORY_STORIES = {
  0: "The Indus Valley Civilization (3300-1300 BC) had the world's first known urban sanitation systems, with flush toilets and covered drains in every home.",
  1: "The Ganges River is considered sacred by Hindus. Over 400 million people depend on it for water, food, and spiritual practice.",
  2: "Persia (modern Iran) was the birthplace of the first human rights charter — the Cyrus Cylinder, created by Cyrus the Great in 539 BC.",
  3: "Mesopotamia, the 'Cradle of Civilization,' is where writing was invented around 3400 BC. The cuneiform script was pressed into clay tablets.",
  4: "Arabia was home to the Nabataean Kingdom, who built the magnificent rock city of Petra, now one of the New Seven Wonders of the World.",
  5: "Ancient Egypt's economy was based on grain. Workers on the pyramids were paid in bread, beer, and onions — not slaves, but skilled laborers.",
  6: "Anatolia (modern Turkey) has been home to some of the world's oldest known settlements, including Catalhoyuk, dating back to 7500 BC.",
  7: "Ancient Greece gave birth to democracy (Athens, 508 BC), the Olympic Games (776 BC), and Western philosophy with Socrates, Plato, and Aristotle.",
  8: "The Roman Empire's heart was Italia. Rome's engineers built aqueducts that carried 1 million cubic meters of fresh water into the city every day.",
  9: "Gaul (modern France) was conquered by Julius Caesar in 58-50 BC. Caesar's book 'Commentarii de Bello Gallico' is still used to teach Latin.",
  10: "Hispania (modern Spain) was a Roman province for 600 years. The Roman amphitheater in Merida could seat 15,000 spectators and is still used today.",
  11: "Britannia was home to the Celts before the Roman conquest in 43 AD. The Romans built Hadrian's Wall and the city of Londinium (London).",
  12: "Germania's forests proved deadly to Roman legions. In 9 AD, Arminius destroyed three Roman legions in the Teutoburg Forest, halting Roman expansion.",
  13: "The Vikings came from Scandinavia. Between 793-1066 AD, they explored, traded, and raided from North America to Constantinople.",
  14: "Eastern Europe's steppes were the highway for nomadic warriors. The Huns, under Attila (434-453 AD), terrorized both the Eastern and Western Roman Empires.",
  15: "The Balkans have been a crossroads of civilizations for millennia. The region gave birth to the Cyrillic alphabet, still used by 250 million people.",
  16: "North Africa's Mediterranean coast was the 'breadbasket of Rome.' Carthage (modern Tunisia) rivaled Rome until its destruction in 146 BC.",
  17: "Japan's isolation for over 200 years (1639-1854) allowed it to develop a unique culture. When it opened, it rapidly modernized and became a world power.",
};

export const T = (id) => TERRITORIES[id];
export const E = (id) => EMPIRES[id];
export const adj = (a,b) => TERRITORIES[a].adj.includes(b);
