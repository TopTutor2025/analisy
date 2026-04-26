/* =========================================================
   ANALISY — Situation Room Map Engine
   Leaflet + real-world geographic data
   ========================================================= */

let situationMap;
const layerGroups = {};
const layerState  = {};

/* ── CATEGORY CONFIG ──────────────────────────────────────
   Quattro domini tematici — la magnitudo (1-4) descrive
   la gravità dell'evento all'interno del suo dominio.
   ──────────────────────────────────────────────────────── */
const EVENT_COLORS = {
  geopolitica: '#e8344e',   // rosso    — guerre, operazioni militari, crisi umanitarie
  politica:    '#4f9eff',   // blu      — elezioni, colpi di stato, crisi politiche
  business:    '#f5a623',   // ambra    — sanzioni, guerre commerciali, mercati energetici
  tecnologia:  '#a78bfa',   // viola    — cyberattacchi, corsa all'IA, disinformazione
};
const EVENT_LABELS = {
  geopolitica: 'GEOPOLITICA',
  politica:    'POLITICA',
  business:    'BUSINESS',
  tecnologia:  'TECNOLOGIA',
};
const RESOURCE_COLORS = {
  oil:     '#ff8c00',
  gas:     '#00d4aa',
  lithium: '#9b59ff',
  uranium: '#c9a400'
};
const RESOURCE_LABELS = {
  oil:     'Petrolio',
  gas:     'Gas Naturale',
  lithium: 'Litio',
  uranium: 'Uranio'
};
const ROUTE_COLORS = {
  migration: '#ff4757',
  maritime:  '#4f9eff',
  oil_trade: '#ff8c00',
  submarine: '#00c2e0'
};
const ROUTE_LABELS = {
  migration: 'Tratte Migratorie',
  maritime:  'Rotte Maritime',
  oil_trade: 'Rotte Petrolio',
  submarine: 'Cavi Sottomarini'
};

/* ── REAL-WORLD ROUTE DATA ── */
const ROUTES = {
  migration: [
    {
      name: 'Rotta Mediterraneo Centrale — Libia → Italia',
      origin: { label: 'Zuwara / Zawiya, Libia', coords: [32.93, 12.08] },
      dest:   { label: 'Lampedusa / Sicilia, Italia', coords: [35.50, 12.61] },
      coords: [[32.93,12.08],[33.05,12.15],[33.30,12.25],[33.70,12.35],[34.15,12.42],[34.55,12.50],[34.95,12.55],[35.30,12.58],[35.50,12.61]]
    },
    {
      name: 'Rotta Mediterraneo Centrale — Tunisia → Sicilia',
      origin: { label: 'Sfax / Mahdia, Tunisia', coords: [34.74, 10.76] },
      dest:   { label: 'Agrigento / Mazara, Sicilia', coords: [37.30, 12.60] },
      coords: [[34.74,10.76],[34.90,11.00],[35.10,11.30],[35.40,11.65],[35.80,12.00],[36.20,12.25],[36.65,12.40],[37.00,12.50],[37.30,12.60]]
    },
    {
      name: 'Rotta Mediterraneo Occidentale — Marocco → Spagna',
      origin: { label: 'Tangeri / Nador, Marocco', coords: [35.78, -5.80] },
      dest:   { label: 'Tarifa / Algeciras, Spagna', coords: [36.01, -5.45] },
      coords: [[35.78,-5.80],[35.82,-5.72],[35.87,-5.63],[35.93,-5.55],[36.01,-5.45]]
    },
    {
      name: 'Rotta Atlantica — Africa Occ. → Isole Canarie',
      origin: { label: 'Dakar / Nouadhibou, Senegal–Mauritania', coords: [20.94, -17.04] },
      dest:   { label: 'El Hierro / Las Palmas, Canarie', coords: [27.80, -17.55] },
      coords: [[20.94,-17.04],[21.80,-17.20],[22.70,-17.35],[23.60,-17.45],[24.50,-17.55],[25.40,-17.60],[26.30,-17.60],[27.10,-17.60],[27.80,-17.55]]
    },
    {
      name: 'Rotta Mediterraneo Orientale — Turchia → Egeo',
      origin: { label: 'Izmir / Bodrum, Turchia', coords: [37.85, 27.20] },
      dest:   { label: 'Lesbo / Chio / Kos, Grecia', coords: [38.37, 26.14] },
      coords: [[37.85,27.20],[37.95,27.05],[38.05,26.85],[38.15,26.65],[38.25,26.42],[38.37,26.14]]
    },
    {
      name: 'Rotta Balcanica — Grecia → Europa Centrale',
      origin: { label: 'Evros / Kastaniés, frontiera greco-turca', coords: [41.37, 26.60] },
      dest:   { label: 'Vienna / Monaco di Baviera', coords: [48.14, 16.35] },
      coords: [[41.37,26.60],[41.60,24.80],[41.90,22.80],[42.50,21.40],[43.50,20.80],[44.60,20.60],[45.50,19.00],[46.30,17.80],[47.00,16.80],[47.60,16.20],[48.14,16.35]]
    },
  ],

  maritime: [
    { name: 'Rotta Suez (Mar Rosso → Mediterraneo)', coords: [[12.5,43.5],[15.0,42.0],[18.0,40.5],[21.0,38.5],[24.0,37.0],[27.0,34.5],[29.9,32.6],[31.0,32.3],[32.0,31.5],[34.0,30.0],[36.0,25.0],[37.8,20.0],[38.5,14.0],[35.5,13.0]] },
    { name: 'Stretto di Malacca',                    coords: [[1.3,103.8],[2.0,102.5],[3.0,101.0],[4.5,100.0],[5.5,98.8],[6.5,98.0]] },
    { name: 'Stretto di Hormuz',                     coords: [[26.5,56.3],[26.0,57.0],[25.0,58.5],[24.0,59.5],[22.0,59.0]] },
    { name: 'Rotta Capo di Buona Speranza',           coords: [[-33.9,18.4],[-36.0,20.0],[-38.0,25.0],[-40.0,35.0],[-38.0,45.0],[-35.0,55.0],[-30.0,60.0],[-25.0,50.0]] },
    { name: 'Canale di Panama',                      coords: [[9.0,-79.5],[9.1,-79.8],[9.3,-80.1],[8.9,-79.6],[9.3,-80.0]] },
    { name: 'Stretto di Gibilterra',                 coords: [[35.9,-5.5],[36.1,-4.5],[36.3,-3.0],[37.0,-0.5]] },
    { name: 'Stretto di Bab el-Mandeb',              coords: [[12.6,43.3],[12.4,43.6],[12.5,43.9],[12.8,44.2]] },
  ],

  oil_trade: [
    { name: 'Golfo Persico → Asia Orientale',        coords: [[26.5,56.3],[18.0,62.0],[12.0,72.0],[5.0,80.0],[1.3,103.8],[10.0,110.0],[20.0,116.0],[30.0,122.0],[35.0,130.0]] },
    { name: 'Golfo Persico → Europa (Suez)',         coords: [[26.5,56.3],[23.0,50.0],[16.0,44.0],[13.0,43.0],[12.5,43.5],[24.0,37.0],[29.9,32.6],[33.0,28.0],[36.0,23.0],[38.0,15.0],[40.0,10.0],[43.0,8.0],[44.0,5.0]] },
    { name: 'Russia → Europa (Baltico)',             coords: [[60.0,30.0],[59.0,25.0],[57.5,21.0],[56.0,18.0],[55.0,14.0],[54.0,11.0],[53.0,7.0],[52.0,4.5],[51.5,3.5]] },
    { name: 'Africa Occidentale → Americhe',         coords: [[5.0,2.0],[0.0,-5.0],[-5.0,-10.0],[-10.0,-20.0],[-15.0,-30.0],[-10.0,-38.0],[0.0,-40.0],[10.0,-55.0],[20.0,-65.0],[25.0,-75.0]] },
    { name: 'Venezuela → USA',                      coords: [[10.0,-63.0],[15.0,-68.0],[20.0,-73.0],[25.0,-78.0],[30.0,-84.0],[28.0,-90.0]] },
    { name: 'Canada → USA (oleodotto)',              coords: [[56.0,-111.0],[52.0,-110.0],[48.0,-108.0],[44.0,-103.0],[41.0,-96.0],[38.0,-92.0]] },
  ],

  submarine: [
    // ── NORD ATLANTICO (3 corridoi paralleli) ──────────────────────────
    {
      name: 'Atlantico Nord — New York → Irlanda / UK',
      coords: [
        [40.7,-74.0],
        [41.5,-65.0],[44.5,-52.0],[47.0,-40.0],
        [49.5,-25.0],[50.8,-12.0],
        [51.5,-9.5],
        [50.8,-4.5],
      ]
    },
    {
      name: 'Atlantico Nord — Virginia Beach → Francia / Spagna',
      coords: [
        [36.9,-76.0],
        [38.5,-68.0],[41.5,-54.0],[44.0,-40.0],
        [46.5,-27.0],[47.5,-15.0],
        [48.4,-4.5],
        [43.5,-1.5],
      ]
    },
    {
      name: 'Atlantico Nord — New York → Azzorre → Portogallo',
      coords: [
        [40.7,-74.0],
        [40.5,-60.0],[39.5,-48.0],
        [38.7,-27.2],
        [37.0,-16.0],[37.5,-10.5],
        [38.7,-9.2],
      ]
    },
    // ── SUD ATLANTICO ─────────────────────────────────────────────────
    {
      name: 'Atlantico — USA → Caraibi → Brasile',
      coords: [
        [25.7,-80.1],
        [22.0,-75.5],[15.0,-69.0],[9.0,-63.0],
        [5.0,-54.0],
        [-3.8,-38.5],
        [-8.0,-35.0],
        [-23.0,-43.0],
      ]
    },
    {
      name: 'Atlantico Sud — Brasile → Portogallo',
      coords: [
        [-3.8,-38.5],
        [6.5,-27.0],[10.5,-22.0],
        [14.7,-17.4],
        [22.0,-16.5],[28.5,-13.5],[35.5,-9.5],
        [38.7,-9.2],
      ]
    },
    {
      name: 'Atlantico Sud — Brasile → Africa Ovest',
      coords: [
        [-23.0,-43.0],
        [-20.0,-33.0],[-14.0,-22.0],[-8.0,-12.0],
        [-2.0,-3.0],[0.5,5.0],[3.5,8.5],
        [-8.8,13.2],
        [-33.9,18.4],
      ]
    },
    // ── MEDITERRANEO ──────────────────────────────────────────────────
    {
      name: 'Mediterraneo — Europa → Levante / Turchia',
      coords: [
        [43.3,5.4],
        [40.5,9.0],
        [37.5,11.0],
        [34.5,20.0],
        [34.0,27.0],
        [33.5,33.5],
        [32.5,35.0],
        [33.5,35.5],
        [36.5,36.5],
        [38.5,26.5],
        [41.0,29.0],
      ]
    },
    {
      name: 'Mediterraneo — Nord Africa → Egitto',
      coords: [
        [43.3,5.4],
        [41.2,2.0],
        [38.5,-0.5],
        [36.0,-5.5],
        [35.8,-4.0],
        [35.5,0.0],[37.0,3.0],
        [37.5,10.5],
        [33.0,11.0],
        [32.0,23.5],
        [31.3,32.3],
      ]
    },
    // ── AFRICA OVEST ──────────────────────────────────────────────────
    {
      name: 'ACE / WACS — Costa Atlantica Africa',
      coords: [
        [38.7,-9.2],[37.5,-9.5],[33.0,-9.5],
        [28.0,-13.5],[24.0,-17.0],[20.9,-17.0],
        [14.7,-17.4],[10.0,-15.5],[5.5,-11.5],
        [4.5,-4.8],[5.6,-0.2],[6.4,3.4],[3.8,9.2],
        [0.2,8.8],[-4.8,11.8],[-8.8,13.2],
        [-17.0,11.5],[-28.0,15.5],
        [-33.9,18.4],
      ]
    },
    // ── OCEANO INDIANO — SEA-ME-WE ────────────────────────────────────
    {
      name: 'SEA-ME-WE 4/5 — Europa → Suez → Asia',
      coords: [
        [43.3,5.4],[40.5,9.5],[37.5,11.0],[34.5,21.0],
        [32.0,29.5],[31.3,32.3],[30.0,32.6],[26.5,34.5],
        [21.5,37.5],[15.5,41.5],[11.6,43.1],[14.0,50.5],
        [18.5,56.0],[23.6,58.6],[24.8,65.0],[19.0,72.8],
        [7.5,77.5],[5.8,80.0],[3.5,94.5],[1.3,103.8],
        [10.8,107.5],[22.0,114.2],[30.5,122.5],[35.6,139.7],
      ]
    },
    // ── AFRICA EST ────────────────────────────────────────────────────
    {
      name: 'EASSy / SAFE — Costa Est Africa',
      coords: [
        [23.6,58.6],[18.0,56.0],[12.0,44.5],[11.5,43.0],
        [7.0,46.0],[2.0,45.0],[-2.0,41.5],[-6.8,39.9],
        [-10.5,40.5],[-15.0,40.8],[-20.0,37.5],
        [-26.0,33.5],[-29.8,31.0],[-34.5,26.5],
        [-33.9,18.4],
      ]
    },
    // ── INDIA → SE ASIA → AUSTRALIA ───────────────────────────────────
    {
      name: 'India → SE Asia → Perth',
      coords: [
        [19.0,72.8],[7.5,77.5],[5.8,80.0],
        [3.5,94.5],[1.3,103.8],
        [-6.0,108.0],[-8.7,115.2],
        [-17.0,115.0],[-25.0,113.5],
        [-31.9,115.9],
      ]
    },
    // ── HUB SE ASIA — Giappone → Australia ───────────────────────────
    {
      name: 'APG / APCN2 — Giappone → SE Asia → Australia',
      coords: [
        [35.6,139.7],[27.0,131.5],[22.5,124.0],
        [17.0,123.0],[9.5,126.5],[3.0,128.5],
        [-3.0,128.0],[-9.0,127.0],[-12.0,130.9],
        [-12.0,136.5],[-12.5,141.5],[-15.0,145.5],
        [-20.5,150.0],[-26.0,153.5],[-33.9,151.2],
      ]
    },
    {
      name: 'C2C — Cina / Corea → SE Asia',
      coords: [
        [37.5,126.5],[32.0,122.0],[26.0,120.0],
        [22.0,114.2],[16.0,111.5],[10.0,108.0],
        [1.3,103.8],[-1.0,109.5],
        [-6.2,106.8],[-8.7,115.2],
      ]
    },
    // ── TRANS-PACIFICO (split anti-meridian) ─────────────────────────
    {
      name: 'Trans-Pacifico Ovest — Giappone → Midway',
      coords: [
        [35.6,139.7],[33.0,150.0],[30.0,158.0],
        [24.5,162.0],[20.0,167.0],[18.5,170.0],
        [25.0,175.0],[28.0,178.8],
      ]
    },
    {
      name: 'Trans-Pacifico Est — Hawaii → USA',
      coords: [
        [21.3,-157.8],
        [25.0,-153.0],[29.0,-143.0],[34.0,-128.0],
        [34.0,-118.2],
        [37.8,-122.4],
        [47.5,-122.5],
      ]
    },
    // ── PACIFICO NORD (split anti-meridian) ───────────────────────────
    {
      name: 'Pacifico Nord — Giappone → Aleutine (W)',
      coords: [
        [35.6,139.7],[40.0,145.0],[46.0,153.0],
        [51.0,163.0],[54.0,172.0],[55.5,179.0],
      ]
    },
    {
      name: 'Pacifico Nord — Aleutine → Seattle (E)',
      coords: [
        [55.5,-179.0],[54.5,-170.0],[52.0,-163.0],
        [50.0,-153.0],[48.0,-136.0],
        [47.5,-122.5],
      ]
    },
    // ── PACIFICO SUD (split anti-meridian) ────────────────────────────
    {
      name: 'Pacifico Sud — Australia → Isole Pacifico (W)',
      coords: [
        [-33.9,151.2],[-32.0,155.0],[-28.0,162.0],
        [-23.5,166.5],[-18.0,168.5],[-17.5,174.5],
        [-13.0,179.0],
      ]
    },
    {
      name: 'Pacifico Sud — Hawaii → Samoa (E)',
      coords: [
        [21.3,-157.8],[14.0,-167.0],[6.0,-171.0],
        [-1.0,-173.0],[-8.0,-173.0],
        [-13.5,-172.5],[-17.5,-178.0],
      ]
    },
  ]
};

/* ── DEFAULT DATA LOADERS ── */
function getMapEvents() {
  // Events are populated exclusively by the AI engine via the backend.
  // No hardcoded fallback — the map starts empty and fills when AI runs.
  if (typeof AppData !== 'undefined' && AppData.mapEvents && AppData.mapEvents.length)
    return AppData.mapEvents;
  return [];
}

function getMapResources() {
  if (typeof AppData !== 'undefined' && AppData.mapResources && AppData.mapResources.length)
    return AppData.mapResources;
  return [
    { id:'r1',  name:'Petrolio: Arabia Saudita',     lat:24,  lng:45,   type:'oil',     radius:300000, notes:'Più grandi riserve mondiali (Ghawar field)' },
    { id:'r2',  name:'Petrolio: Iraq',               lat:33,  lng:44,   type:'oil',     radius:200000, notes:'Rumaila, West Qurna, Majnoon' },
    { id:'r3',  name:'Petrolio: Venezuela',          lat:8,   lng:-63,  type:'oil',     radius:250000, notes:'Riserve extra-pesanti Fascia dell\'Orinoco' },
    { id:'r4',  name:'Petrolio: Russia siberiana',   lat:61,  lng:75,   type:'oil',     radius:500000, notes:'Giacimenti Khanty-Mansiysk e Yamalo-Nenets' },
    { id:'r5',  name:'Gas: Russia (Siberia)',         lat:65,  lng:76,   type:'gas',     radius:450000, notes:'Urengoy, Yamburg, Bovanenko — principali giacimenti mondiali' },
    { id:'r6',  name:'Gas: Qatar (North Dome)',       lat:25,  lng:51,   type:'gas',     radius:180000, notes:'North Dome / South Pars — più grande giacimento gas al mondo' },
    { id:'r7',  name:'Gas: Iran (South Pars)',        lat:29,  lng:53,   type:'gas',     radius:250000, notes:'South Pars condiviso con Qatar' },
    { id:'r8',  name:'Litio: Bolivia (Uyuni)',        lat:-20, lng:-67,  type:'lithium', radius:200000, notes:'Salar de Uyuni — riserve stimate più grandi al mondo (~21 Mt)' },
    { id:'r9',  name:'Litio: Cile (Atacama)',         lat:-23, lng:-68,  type:'lithium', radius:180000, notes:'Salar de Atacama — produzione attiva' },
    { id:'r10', name:'Litio: Argentina (Puna)',       lat:-24, lng:-66,  type:'lithium', radius:180000, notes:'Jujuy e Salta — "Triangolo del Litio"' },
    { id:'r11', name:'Litio: Australia (Pilbara)',    lat:-29, lng:117,  type:'lithium', radius:200000, notes:'Greenbushes — primo produttore di spodumene' },
    { id:'r12', name:'Uranio: Kazakhstan',            lat:48,  lng:68,   type:'uranium', radius:350000, notes:'Primo produttore mondiale ~43% — ISL mining' },
    { id:'r13', name:'Uranio: Canada (Athabasca)',    lat:58,  lng:-104, type:'uranium', radius:250000, notes:'Cigar Lake, McArthur River — alto grado' },
    { id:'r14', name:'Uranio: Australia',             lat:-30, lng:135,  type:'uranium', radius:300000, notes:'Olympic Dam, Ranger, Beverly' },
    { id:'r15', name:'Uranio: Niger (Arlit)',         lat:17,  lng:8,    type:'uranium', radius:180000, notes:'Arlit — miniera storica Orano (ex Areva)' },
    { id:'r16', name:'Gas: Norvegia (Mare del Nord)', lat:61,  lng:2,    type:'gas',     radius:200000, notes:'Troll, Åsgard, Ormen Lange' },
    { id:'r17', name:'Petrolio: Nigeria (Delta)',     lat:5,   lng:6,    type:'oil',     radius:180000, notes:'Delta del Niger — maggiore produttore africano' },
    { id:'r18', name:'Litio: RD Congo (Katanga)',     lat:-4,  lng:29,   type:'lithium', radius:200000, notes:'Anche cobalto — Copperbelt' },
    { id:'r19', name:'Petrolio: Libia',               lat:27,  lng:17,   type:'oil',     radius:250000, notes:'Bacino Sirt — maggiori riserve Africa settentrionale' },
    { id:'r20', name:'Petrolio: Kuwait',              lat:29,  lng:47.5, type:'oil',     radius:120000, notes:'Greater Burgan — secondo giacimento più grande' },
  ];
}

/* ── INIT MAP ── */
function initSituationMap(containerId) {
  situationMap = L.map(containerId, {
    center: [20, 15],
    zoom: 3,
    zoomControl: false,
    minZoom: 2,
    maxZoom: 12,
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0
  });

  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    noWrap: true
  }).addTo(situationMap);

  // Init layer groups
  const layerKeys = ['events', 'resources_oil', 'resources_gas', 'resources_lithium', 'resources_uranium', 'migration', 'maritime', 'oil_trade', 'submarine'];
  layerKeys.forEach(k => {
    layerGroups[k] = L.layerGroup().addTo(situationMap);
    layerState[k] = true;
  });

  // Add all data
  loadEvents();
  loadResources();
  loadRoutes();

  return situationMap;
}

/* ── EVENTS ── */
function loadEvents() {
  layerGroups.events.clearLayers();
  const events = getMapEvents();
  events.forEach(ev => addEventMarker(ev));
}

function addEventMarker(ev) {
  const color = EVENT_COLORS[ev.category] || '#4f9eff';
  const mag = Math.min(Math.max(parseInt(ev.magnitude) || 2, 1), 4);
  const sizes = [10, 14, 18, 24];
  const sz = sizes[mag - 1];
  const ringCount = mag >= 3 ? 2 : 1;

  const rings = Array.from({length: ringCount}, (_, i) =>
    `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;border:2px solid ${color};transform:translate(-50%,-50%);animation:pulseRing 2s ease-out ${i*0.7}s infinite;pointer-events:none;"></div>`
  ).join('');

  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${sz}px;height:${sz}px;cursor:pointer;">
      ${rings}
      <div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};opacity:0.9;box-shadow:0 0 12px ${color}80,0 0 4px ${color};position:relative;z-index:2;"></div>
    </div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz/2, sz/2]
  });

  const marker = L.marker([ev.lat, ev.lng], { icon });
  marker.bindPopup(buildEventPopup(ev, color), { maxWidth: 240, className: 'analisy-popup' });
  marker.on('click', function() {
    document.dispatchEvent(new CustomEvent('mapEventSelected', { detail: ev }));
  });
  marker.on('popupopen', function() {
    if (window.innerWidth <= 768) marker.closePopup();
  });
  layerGroups.events.addLayer(marker);
}

function buildEventPopup(ev, color) {
  const mag = Math.min(Math.max(parseInt(ev.magnitude) || 1, 1), 4);
  const magLabels = ['', 'Bassa', 'Moderata', 'Alta', 'Critica'];
  const summary = ev.summary || ev.desc || '';
  const source  = ev.sourceUrl ? `<a href="${ev.sourceUrl}" target="_blank" rel="noopener" style="font-size:0.68rem;color:${color};opacity:0.75;text-decoration:none;margin-top:8px;display:inline-block;">↗ Fonte</a>` : '';
  return `
    <div style="font-family:-apple-system,Inter,sans-serif;min-width:200px;max-width:240px;">
      <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${color};margin-bottom:5px;">${EVENT_LABELS[ev.category] || ev.category}</div>
      <div style="font-size:0.88rem;font-weight:700;color:#f0f4ff;margin-bottom:7px;line-height:1.35;">${ev.title}</div>
      ${summary ? `<div style="font-size:0.78rem;color:#8fa8cc;line-height:1.55;margin-bottom:8px;">${summary}</div>` : ''}
      <div style="display:flex;align-items:center;gap:6px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.07);">
        <div style="display:flex;gap:2px;">
          ${Array.from({length:4},(_,i)=>`<span style="width:7px;height:7px;border-radius:50%;background:${i<mag?color:'rgba(255,255,255,0.12)'};display:inline-block;"></span>`).join('')}
        </div>
        <span style="font-size:0.68rem;color:rgba(255,255,255,0.4);">Magnitudo ${mag} — ${magLabels[mag]}</span>
      </div>
      ${source}
    </div>
  `;
}

/* ── RESOURCES ── */
function loadResources() {
  ['oil','gas','lithium','uranium'].forEach(type => layerGroups['resources_' + type].clearLayers());
  const resources = getMapResources();
  resources.forEach(r => addResourceZone(r));
}

function addResourceZone(r) {
  const color = RESOURCE_COLORS[r.type] || '#ffffff';
  const radius = (r.radius || 200) * 1000; // km to meters

  const circle = L.circle([r.lat, r.lng], {
    radius: radius,
    color: color,
    fillColor: color,
    fillOpacity: 0,
    weight: 1.5,
    opacity: 0.5,
    dashArray: '4 4'
  });

  circle.bindPopup(`
    <div style="font-family:Inter,sans-serif;">
      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin-bottom:4px;">${RESOURCE_LABELS[r.type] || r.type}</div>
      <div style="font-size:0.88rem;font-weight:700;color:#f0f4ff;margin-bottom:4px;">${r.name}</div>
      ${r.notes ? `<div style="font-size:0.8rem;color:#8fa8cc;">${r.notes}</div>` : ''}
    </div>
  `, { maxWidth: 220, className: 'analisy-popup' });

  layerGroups['resources_' + r.type].addLayer(circle);

  // Center dot
  const dotIcon = L.divIcon({
    className: '',
    html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};opacity:0.9;"></div>`,
    iconSize: [8, 8], iconAnchor: [4, 4]
  });
  const dot = L.marker([r.lat, r.lng], { icon: dotIcon });
  dot.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:0.82rem;color:#f0f4ff;font-weight:600;">${r.name}</div>`, { className: 'analisy-popup' });
  layerGroups['resources_' + r.type].addLayer(dot);
}

/* ── ROUTES ── */
/* Hotspot marker per tratte migratorie */
function addMigrationHotspot(point, role, layerGroup) {
  const isOrigin = role === 'origin';
  const color    = isOrigin ? '#ff4757' : '#22d47a';
  const roleLabel = isOrigin ? '🔴 PARTENZA' : '🟢 ARRIVO';
  const icon = L.divIcon({
    className: '',
    html: `<div class="migration-hotspot ${role}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="18" height="27">
        <circle cx="12" cy="5" r="4" fill="${color}"/>
        <path d="M6 14 Q6 10 12 10 Q18 10 18 14 L17 22 H13 L12 28 L11 22 H7 Z" fill="${color}"/>
        <line x1="7" y1="16" x2="4" y2="21" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="17" y1="16" x2="20" y2="21" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    </div>`,
    iconSize: [18, 27],
    iconAnchor: [9, 27]
  });
  L.marker(point.coords, { icon })
    .bindPopup(`
      <div style="font-family:Inter,sans-serif;min-width:140px;">
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.07em;color:${color};margin-bottom:5px;">${roleLabel}</div>
        <div style="font-size:0.88rem;font-weight:700;color:#f0f4ff;">${point.label}</div>
      </div>
    `, { className: 'analisy-popup' })
    .addTo(layerGroup);
}

/* Catmull-Rom spline: genera coordinate intermedie per curve fluide */
function catmullRom(coords, steps = 10) {
  if (coords.length < 2) return coords;
  const pts = [coords[0], ...coords, coords[coords.length - 1]];
  const out  = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i-1], pts[i], pts[i+1], pts[i+2]];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t*t, t3 = t2*t;
      out.push([
        0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
      ]);
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/* Inject SVG glow filter for fiber-optic cable effect */
(function injectCableGlowFilter() {
  const ns  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  svg.innerHTML = `
    <defs>
      <filter id="cable-glow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>`;
  document.body.appendChild(svg);
})();

function loadRoutes() {
  ['migration','maritime','oil_trade','submarine'].forEach(type => {
    layerGroups[type].clearLayers();
    const routes = ROUTES[type] || [];
    const color  = ROUTE_COLORS[type];
    const dashes = type === 'submarine' ? '6 4' : type === 'migration' ? '8 5' : null;

    routes.forEach(route => {
      const smoothed = catmullRom(route.coords, 32);
      const popupHTML = `
        <div style="font-family:Inter,sans-serif;">
          <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin-bottom:4px;">${ROUTE_LABELS[type]}</div>
          <div style="font-size:0.88rem;font-weight:700;color:#f0f4ff;">${route.name}</div>
        </div>`;

      if (type === 'submarine') {
        /* Fiber-optic effect: 3 overlapping layers — outer halo, mid glow, bright core */
        L.polyline(smoothed, {
          color: '#00c8e8', weight: 9, opacity: 0.10,
          smoothFactor: 1.2, className: 'cable-halo'
        }).addTo(layerGroups[type]);

        L.polyline(smoothed, {
          color: '#20dcf8', weight: 4, opacity: 0.28,
          smoothFactor: 1.2, className: 'cable-mid'
        }).addTo(layerGroups[type]);

        const core = L.polyline(smoothed, {
          color: '#c8f6ff', weight: 1.2, opacity: 0.95,
          smoothFactor: 1.2, className: 'cable-core'
        });
        core.bindPopup(popupHTML, { className: 'analisy-popup' });
        layerGroups[type].addLayer(core);

      } else {
        const line = L.polyline(smoothed, {
          color,
          weight: type === 'maritime' ? 2.5 : 2,
          opacity: type === 'migration' ? 0.7 : 0.65,
          dashArray: dashes,
          smoothFactor: 1.2
        });

        line.bindPopup(popupHTML, { className: 'analisy-popup' });

        if (type === 'migration' && route.origin && route.dest) {
          addMigrationHotspot(route.origin, 'origin', layerGroups[type]);
          addMigrationHotspot(route.dest,   'dest',   layerGroups[type]);
        }

        if ((type === 'maritime' || type === 'oil_trade') && window.L.polylineDecorator) {
          L.polylineDecorator(line, {
            patterns: [{ offset: '5%', repeat: '15%', symbol: L.Symbol.arrowHead({ pixelSize: 8, pathOptions: { color, fillOpacity: 0.6, weight: 0 } }) }]
          }).addTo(layerGroups[type]);
        }

        layerGroups[type].addLayer(line);
      }
    });
  });
}

/* ── TOGGLE LAYERS ── */
function toggleLayer(key, on) {
  layerState[key] = on;
  if (on) { situationMap.addLayer(layerGroups[key]); }
  else    { situationMap.removeLayer(layerGroups[key]); }
}

function toggleLayerGroup(prefix, on) {
  ['oil','gas','lithium','uranium'].forEach(t => toggleLayer(prefix + '_' + t, on));
}

/* ── RELOAD AFTER ADMIN EDIT ── */
function reloadMapData() {
  loadEvents();
  loadResources();
}

/* ── PULSE ANIMATION CSS (injected) ── */
(function injectMapCSS() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulseRing {
      0%   { transform: translate(-50%,-50%) scale(0.9); opacity: 0.8; }
      70%  { transform: translate(-50%,-50%) scale(2.8); opacity: 0; }
      100% { transform: translate(-50%,-50%) scale(2.8); opacity: 0; }
    }
    .analisy-popup .leaflet-popup-content-wrapper {
      background: rgba(11,24,41,0.97) !important;
      border: 1px solid rgba(79,158,255,0.3) !important;
      border-radius: 12px !important;
      backdrop-filter: blur(16px) !important;
    }
    .analisy-popup .leaflet-popup-tip { background: rgba(11,24,41,0.97) !important; }
  `;
  document.head.appendChild(style);
})();
