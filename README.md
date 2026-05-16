# GSXR404 — Shipping Schedule Aggregator

> **[GSXR 404]** — Glitched.

A stealth-based web scraper for discovering shipping schedules from major and niche carriers. Features a terminal-style green-on-black UI and outputs results into a stylized PDF.

---

## Project Overview

GSXR404 (Glitched Stealth Xenon Rapid 404) is a production-ready Node.js shipping schedule aggregator designed to bypass modern anti-bot protections (Cloudflare, DataDome, Akamai) while providing a clean terminal interface and terminal-styled PDF output.

---

## System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          GSXR404 Core                               │
├───────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
│  │  Config Loader │───▶│Stealth Parser │───▶│Data Pipeline  │   │
│  │ config-loader ◀────│stealth-scraper│────│data-pipeline  │   │
│  │   .js          │   │ .js           │   │  .js           │   │
│  └───────────────┘   └───────────────┘    └───────────────┘   │
│          │                   │                   │               │
│          ▼                   ▼                   ▼               │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
│  │settings.json  │    │  Playwright  │    │  pdf-gen.js   │   │
│  │ports.json     │    │ + Chromium   │    │  (jsPDF)      │   │
│  │lines.txt      │    │ + Stealth    │    │               │   │
│  └───────────────┘    └───────────────┘    └───────────────┘   │
│                                                            │    │
├───────────────────────────────────────────────────────────+────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Terminal UI                                                │   │
│  │ • ASCII Glitch Logo                                        │   │
│  │ • Autocomplete POL/POD                                      │   │
│  │ • Real-time Progress Output                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                     │
└───────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. **ConfigLoader** loads `config/settings.json`, `data/ports.json`, and `data/lines.txt`
2. **StealthScraper** uses a Playwright-headed browser with fingerprint spoofing
3. **DataPipeline** applies cleaning: port standardization, deduplication, and sorting
4. **TerminalUI** renders progress and statistics in real-time
5. **PDFGenerator** creates a green-on-black landscape PDF with carrier groupings

---

## File Structure

```
gsxr404/
├── config/
│   └── settings.json          # Hardcoded parameters (time window, containers)
├── data/
│   ├── ports.json             # Port name variants → standard name mapping
│   └── lines.txt              # CarrierName, URL format
├── src/
│   ├── index.js               # Main entry — orchestrates pipeline
│   ├── utils/
│   │   └── config-loader.js   # Parses JSON/TXT, standardizes ports
│   ├── scrapers/
│   │   └── stealth-scraper.js  # Playwright + Stealth extraction engine
│   ├── pipeline/
│   │   └── data-pipeline.js    # Clean → Sort → Calculate transit
│   └── frontend/
│       ├── terminal-ui.js      # GLITCH logo, autocomplete, progress
│       └── pdf-generator.js    # jsPDF green-on-black PDF
├── output/                     # Generated PDF and CSV/JSON exports
├── logs/                       # Application logs
└── package.json
```

---

## Core Components

### 1. ConfigLoader (`src/utils/config-loader.js`)

```
new ConfigLoader(basePath)
  .loadSettings()       // parses config/settings.json
  .loadPorts()           // parses data/ports.json
  .loadCarriers()        // parses data/lines.txt
  .standardizePort(name) // "Rott.", "Rotterdam NL", "NLRTM" → "Rotterdam"
  .getSailingDateWindow() // ISO-formats date range based on timeWindowDays
  .getSummary()          // quick stats overview
```

| Method | Behavior |
|--------|---------|
| `loadPorts()` | Parses all variant → standard mapping |
| `standardizePort(raw)` | Case-insensitive lookup through all variants |
| `getSailingDateWindow()` | Returns `{ start, end, days }` for form queries |
| `getSummary()` | Returns loaded counts and active windowDays |

**Response:** `config-data-loaded` always, with fallback defaults.

---

### 2. StealthScraper (`src/scrapers/stealth-scraper.js`)

```
const scraper = new StealthScraper(configLoader);
await scraper.init();                        // Launches Chromium with stealth args
const { voyages, stats } = await scraper     // Iterates carriers, retries on failure
  .scrapeAll(standardizedPOL, standardizedPOD);
```

**Stealth Protection Stack:**

```js
// Anti-bot fingerprint bypass via Playwright initScript
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.challengeTimeout = 120000;
});

// Chromium launch arguments
'--no-sandbox',
'--disable-setuid-sandbox',
'--disable-dev-shm-usage',
'--disable-web-security',
'--disable-features=IsolateOrigins,site-per-process',
'--disable-blink-features=AutomationControlled'
```

**Carrier-Specific Adapters:** Each carrier gets its own `_scrape<Carrier>` method. The current implementation ships adapters for:
- **Maersk**, **MSC**, **CMA CGM**, **Hapag-Lloyd**, **COSCO**, **ONE**, **Evergreen**
- Additional adapters use `_scrapeGeneric()` — DOM-based table extraction with flexible cell labeling

**Per-Carrier Scrape Flow:**
```
1. navigate(carrier.url) [networkidle]
2. populate POL/POD fields via selectors
3. submit search
4. wait for results table
5. extract rows → voyage objects
6. filter by 30-day ETD window
```

---

### 3. DataPipeline (`src/pipeline/data-pipeline.js`)

```
const pipeline = new DataPipeline(configLoader);
pipeline.load(rawVoyages)
  .clean()    // returns cleaned array
  .sort()     // in-place sort by carrier volume, then ETD asc
  .getStats() // cleaning statistics
```

| Stage | Operation |
|-------|-----------|
| `_standardizeRecord()` | Normalizes vesselName, IMO, pol, pod using configLoader |
| `_filterDateWindow()` | Keeps only voyages within `timeWindowDays` of today |
| `_filterContainers()` | No-op when container list is empty |
| `_deduplicate()` | Case-insensitive key: `carrier\|vesselName\|imo\|etd\|pol\|pod` |
| `_computeTransitTimes()` | `Math.round((ETA - ETD) / msPerDay)` if missing |

**Carrier Volume Sorting:**
```
1. Count voyages per carrier
2. Sort carriers by count desc
3. Within each carrier, sort by ETD asc
```

---

### 4. TerminalUI (`src/frontend/terminal-ui.js`)

- **ASCII Glitch Logo** — Animated character-by-character output on startup
- **Port Autocomplete** — Filters `ports.json` variants on each keystroke
- **Progress Monitor** — Real-time progress bars and suspense-style counter

**Integration with Readline:**
```js
const ui = new TerminalUI(configLoader);
const { pol, pod } = await ui.runPromptCycle();
```

Output format:
```
╔════════════════════════════════════════════════╗
║   S  H  I  P  P  I  N  G   S  C  H  E  D  U  L  E ║
║         R    4     0     4                     ║
╚════════════════════════════════════════════════╝

> Enter POL (port of loading) [Rotterdam, Hamburg...]:
> Enter POD (port of discharge) [Barcelona, Antwerp...]:
```

---

### 5. PDFGenerator (`src/frontend/pdf-pdf.js`)

```js
const pdfGen = new PDFGenerator(configLoader);
const pdfPath = pdfGen.generate(recordsByCarrier, stats);
```

**Terminal PDF Spec:**
| Property | Value |
|----------|-------|
| Background | Black (`#000000`) |
| Text | Green (`#00FF00`) on black |
| Font | Courier New, 8pt |
| Columns | CARR, VESSEL, IMO, VOYAGE, POL, POD, ETD, ETA, TT |
| Border | Dark grey (`#1a1a1a`), 0.2pt |
| Footer | `CONFIDENTIAL — GSXR404 OUTPUT` |

Artifact path: `output/gsxr404_schedule_<timestamp>.pdf`

---

## Integration Guide

### Connect Local File System → Scraper Engine

**Hot-Reload on File Changes:**

Update `config-loader.js` (already supports it):

```js
// config-loader.js already exposes reload() method:
const config = new ConfigLoader();
config.reload(); // re-read ports.json, lines.txt, settings.json
```

**Watched Files → Live Auto-Refresh:**

Add a file watcher in `src/index.js`:

```js
const fs = require('fs');
const chokidar = require('chokidar');

// Auto-reload on file change
const watchPaths = [
  path.join(__base, 'config', 'settings.json'),
  path.join(__base, 'data', '*.json'),
  path.join(__base, 'data', '*.txt')
];
chokidar.watch(watchPaths)
  .on('change', () => {
    console.log('[GSXR404] Config changed, reloading...');
    config.reload();
  });
```

**Adding a New Carrier:**

Edit `data/lines.txt`:
```
YourCarrier Name,https://yourcarrier.com/schedules/sailing-schedules
```

Then add a `_scrapeYourCarrier` method in `stealth-scraper.js`:

```js
async _scrapeYourCarrier(carrier) {
  const page = this.page;
  await page.goto(carrier.url, { waitUntil: 'networkidle', timeout: 25000 });
  // Populate search form...
  // Extract table rows...
  return [/* voyage objects */];
}
```

**Adding a New Port:**

Add to `data/ports.json`:
```json
"YourPort Standard": ["YourPort", "YPORT", "YourPort abbreviation"]
```

The addition is **immediately available** via `configLoader.standardizePort("YPORT")`.

---

## Usage

```bash
# Install dependencies
npm install

# Install Playwright browser (one-time)
npx playwright install chromium

# Interactive mode (prompts for POL/POD)
npm start

# CLI mode (omit interactive prompts)
node src/index.js ROTTERDAM HAMBURG

# List all standardized ports
node src/index.js --list-ports

# List all carriers
node src/index.js --list-carriers

# Export CSV
node src/index.js ROTTERDAM HAMBURG --export-csv

# Export JSON
node src/index.js ROTTERDAM HAMBURG --export-json
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GSXR404_HOME` | Override project root path | `./` |
| `GSXR404_HEADFUL=1` | Disable headless mode (debug) | headless |
| `GSXR404_SLOW=1` | Enable debug slow-mo on browser | disabled |

---

## API Response Shape

Each voyage record follows this schema:

```json
{
  "carrier": "Maersk",
  "carrierDisplayName": "MAERSK",
  "vesselName": "MSC AMELIA",
  "imo": "9854321",
  "voyageNo": "235W",
  "pol": "Rotterdam",
  "pod": "Hamburg",
  "etd": "2026-06-01",
  "eta": "2026-06-03",
  "transitTimeDays": 2,
  "containerSizes": ["20ft", "40ft", "45ft"],
  "containerTypes": ["Dry", "Reefer"],
  "scrapedAt": "ISO string",
  "sourceUrl": "https://..."
}
```

---

## License

MIT

---

*GSXR404 — Glitched Stealth Xenon Rapid 404*  
v1.0.0 | 2026
