# GSXR404 — Shipping Schedule Aggregator v2.0.0

> **Web Server Edition** — Rest API-based shipping schedule aggregator with retro terminal UI

A stealth-based web scraper for discovering shipping schedules from major and niche carriers. Features a green-on-black web dashboard and outputs results into stylized PDFs, CSV, and JSON exports.

---

## ⚡ Quick Start (Web Version)

```bash
# 1. Install dependencies
npm install
npm run install-browser

# 2. Start web server
npm start

# 3. Open browser
http://localhost:3000
```

---

## 🌐 Web API Endpoints

### Core Scraping

**POST** `/api/scraper/init` - Initialize Playwright browser
```bash
curl -X POST http://localhost:3000/api/scraper/init
```

**POST** `/api/scrape` - Execute scrape with POL/POD
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"pol": "Rotterdam", "pod": "Shanghai"}'
```

Response:
```json
{
  "success": true,
  "route": {"pol": "Rotterdam", "pod": "Shanghai"},
  "voyages": [...],
  "stats": {...},
  "carriersCount": 7,
  "voyagesCount": 142
}
```

### Results & Export

**GET** `/api/results` - Retrieve last scrape results
```bash
curl http://localhost:3000/api/results
```

**POST** `/api/export/pdf` - Generate PDF report
```bash
curl -X POST http://localhost:3000/api/export/pdf
```

**POST** `/api/export/csv` - Export as CSV
```bash
curl -X POST http://localhost:3000/api/export/csv
```

**POST** `/api/export/json` - Export as JSON
```bash
curl -X POST http://localhost:3000/api/export/json
```

### Configuration

**GET** `/api/ports` - List available ports
```bash
curl http://localhost:3000/api/ports
```

Response:
```json
{
  "success": true,
  "ports": ["Rotterdam", "Hamburg", "Shanghai", ...],
  "count": 150
}
```

**GET** `/api/carriers` - List configured carriers
```bash
curl http://localhost:3000/api/carriers
```

Response:
```json
{
  "success": true,
  "carriers": [
    {"name": "maersk", "displayName": "Maersk", "url": "..."},
    {"name": "msc", "displayName": "MSC", "url": "..."}
  ],
  "count": 7
}
```

### System

**GET** `/api/health` - Check server status
```bash
curl http://localhost:3000/api/health
```

**POST** `/api/scraper/close` - Shutdown browser
```bash
curl -X POST http://localhost:3000/api/scraper/close
```

---

## 📊 Project Structure

```
gsxr404-scheduler/
├── src/
│   ├── server.js                 # Express web server (NEW)
│   ├── index.js                  # Legacy CLI entry (deprecated)
│   ├── utils/
│   │   └── config-loader.js      # Config manager
│   ├── scrapers/
│   │   └── stealth-scraper.js    # Playwright stealth engine
│   ├── pipeline/
│   │   └── data-pipeline.js      # Data processing
│   └── frontend/
│       ├── terminal-ui.js        # Legacy UI
│       └── pdf-generator.js      # PDF generation
├── public/
│   └── index.html                # Web dashboard (NEW)
├── config/
│   └── settings.json             # Global settings
├── data/
│   ├── ports.json                # Port mappings
│   └── lines.txt                 # Carrier URLs
├── output/                       # Generated files
├── package.json                  # v2.0.0
└── README.md
```

---

## 🎨 Web Dashboard Features

- **Green-on-Black Terminal Theme** - Retro 80s aesthetic
- **Real-time Status** - Server & scraper indicators
- **Port Autocomplete** - 150+ ports with instant matching
- **Live Results** - Tabular voyage data display
- **One-Click Exports** - PDF, CSV, JSON
- **Carrier Selection** - View all configured carriers
- **Responsive Design** - Desktop & mobile compatible

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `GSXR404_HOME` | Override project root | `./` |
| `GSXR404_HEADFUL=1` | Disable headless mode | headless |
| `GSXR404_SLOW=1` | Slow motion debug | disabled |

### Settings

Edit `config/settings.json`:
```json
{
  "timeWindowDays": 30,
  "containerTypes": ["Dry", "Reefer", "Tank"],
  "containerSizes": ["20ft", "40ft", "45ft"]
}
```

### Ports

Edit `data/ports.json`:
```json
{
  "Rotterdam": ["Rotterdam", "NLRTM", "Rotterdam NL", "Rott."],
  "Shanghai": ["Shanghai", "CNSHA", "Shanghai CN"]
}
```

### Carriers

Edit `data/lines.txt`:
```
Maersk,https://www.maersk.com/schedules
MSC,https://www.msc.com/en/sailing-schedules
CMA CGM,https://www.cma-cgm.com/sailing-schedules
```

---

## 📈 API Response Shape

Each voyage record contains:
```json
{
  "carrier": "Maersk",
  "carrierDisplayName": "MAERSK",
  "vesselName": "MAERSK ESSEX",
  "imo": "9854321",
  "voyageNo": "235W",
  "pol": "Rotterdam",
  "pod": "Shanghai",
  "etd": "2026-06-01",
  "eta": "2026-07-03",
  "transitTime": 32,
  "containerSizes": ["20ft", "40ft", "45ft"],
  "containerTypes": ["Dry", "Reefer"],
  "scrapedAt": "2026-05-16T22:00:00Z",
  "sourceUrl": "https://..."
}
```

---

## 🚀 Deployment

### Local Development
```bash
npm start
# Server runs on http://localhost:3000
```

### Production (Docker Example)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run install-browser
EXPOSE 3000
CMD ["npm", "start"]
```

Build & run:
```bash
docker build -t gsxr404 .
docker run -p 3000:3000 gsxr404
```

### Environment Setup

**On Linux/Mac:**
```bash
export PORT=3000
export GSXR404_HEADFUL=1
npm start
```

**On Windows (PowerShell):**
```powershell
$env:PORT = 3000
$env:GSXR404_HEADFUL = 1
npm start
```

---

## 🔐 Security Notes

- Runs on `localhost:3000` by default (local-only)
- No authentication configured (add your own middleware)
- Browser processes are headless by default
- No external API calls except to carrier websites
- PDF/CSV/JSON exports stored in `./output/`

---

## 📝 Changelog

### v2.0.0 (Web Edition)
- ✨ Express.js REST API server
- ✨ Modern web dashboard with green-on-black theme
- ✨ Real-time port autocomplete
- ✨ One-click exports (PDF, CSV, JSON)
- ✨ API health checks & status indicators
- 🗑️ Removed CLI menu system
- 🗑️ Removed agent loop
- 🗑️ Removed interactive readline prompts

### v1.0.0 (Original)
- Terminal UI with glitch logo
- Interactive CLI menu
- Playwright stealth scraper
- PDF/CSV exports

---

## 🛠️ Advanced Usage

### Programmatic API

```javascript
const fetch = require('node-fetch');

async function scrapeShippingSchedule() {
  // 1. Initialize
  await fetch('http://localhost:3000/api/scraper/init', { method: 'POST' });

  // 2. Run scrape
  const res = await fetch('http://localhost:3000/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pol: 'Rotterdam', pod: 'Shanghai' })
  });

  const data = await res.json();
  console.log(`Found ${data.voyagesCount} voyages`);

  // 3. Export
  await fetch('http://localhost:3000/api/export/pdf', { method: 'POST' });

  // 4. Shutdown
  await fetch('http://localhost:3000/api/scraper/close', { method: 'POST' });
}

scrapeShippingSchedule();
```

### Custom Port Mapping

Add to `data/ports.json`:
```json
{
  "Custom Port": ["Custom", "CUSTOM", "CUST", "Alias"]
}
```

Immediately available via autocomplete & API.

---

## 📦 Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `express` | Web framework | ^4.18.2 |
| `cors` | Cross-origin requests | ^2.8.5 |
| `playwright` | Browser automation | ^1.40.0 |
| `jspdf` | PDF generation | ^2.5.1 |
| `chokidar` | File watching | ^3.5.3 |

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Change port
PORT=3001 npm start
```

### Browser Won't Launch
```bash
npm run install-browser
GSXR404_HEADFUL=1 npm start
```

### No Results
- Check POL/POD spelling
- Verify carriers in `data/lines.txt`
- Check `timeWindowDays` in `config/settings.json`

---

## 📄 License

MIT

---

*GSXR404 — Glitched Stealth Xenon Rapid 404*  
Web Edition v2.0.0 | 2026
