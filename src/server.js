/**
 * GSXR404 — Shipping Schedule Aggregator
 * Web Server Version (Local Deployment)
 * Remove CLI/Agent/Menu - Pure REST API
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const ConfigLoader = require('./utils/config-loader');
const StealthScraper = require('./scrapers/stealth-scraper');
const DataPipeline = require('./pipeline/data-pipeline');
const PDFGenerator = require('./frontend/pdf-generator');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Initialize Services ────────────────────────────────────────────────────
const projectRoot = path.join(__dirname, '..');
const config = new ConfigLoader(projectRoot);
const pdfGen = new PDFGenerator(config);
const outDir = path.join(projectRoot, 'output');

let scraper = null;
let scraperReady = false;

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ── Health Check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    scraperReady,
    timestamp: new Date().toISOString(),
  });
});

// ── Get Ports ─────────────────────────────────────────────────────────────
app.get('/api/ports', (req, res) => {
  try {
    const ports = config.ports || {};
    res.json({
      success: true,
      ports: Object.keys(ports),
      count: Object.keys(ports).length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get Carriers ──────────────────────────────────────────────────────────
app.get('/api/carriers', (req, res) => {
  try {
    const carriers = config.carriers || [];
    res.json({
      success: true,
      carriers: carriers.map(c => ({
        name: c.name,
        displayName: c.displayName || c.name,
        url: c.url,
      })),
      count: carriers.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Initialize Scraper ────────────────────────────────────────────────────
app.post('/api/scraper/init', async (req, res) => {
  try {
    if (scraperReady) {
      return res.json({ success: true, message: 'Scraper already initialized' });
    }

    console.log('[GSXR404] Initializing stealth scraper...');
    scraper = new StealthScraper(config);
    await scraper.init();
    scraperReady = true;

    res.json({
      success: true,
      message: 'Scraper initialized',
      scraperReady: true,
    });
  } catch (err) {
    console.error('[GSXR404] Scraper init error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Main Scrape Endpoint ──────────────────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
  const { pol, pod } = req.body;

  if (!pol || !pod) {
    return res.status(400).json({
      success: false,
      error: 'Missing POL (port of loading) or POD (port of discharge)',
    });
  }

  try {
    console.log(`[GSXR404] Starting scrape: ${pol} → ${pod}`);

    // Initialize if not ready
    if (!scraperReady) {
      console.log('[GSXR404] Auto-initializing scraper...');
      scraper = new StealthScraper(config);
      await scraper.init();
      scraperReady = true;
    }

    // Scrape
    const { voyages, stats } = await scraper.scrapeAll(pol, pod);

    // Pipeline
    const pipeline = new DataPipeline(config);
    pipeline.load(voyages);
    const cleaned = pipeline.clean();
    const sorted = pipeline.sort();
    const pipeStats = pipeline.getStats();
    const byCarrier = pipeline.getRecordsByCarrier();

    res.json({
      success: true,
      route: { pol, pod },
      voyages: Object.values(byCarrier).flat(),
      stats: {
        scrape: stats,
        pipeline: pipeStats,
      },
      carriersCount: Object.keys(byCarrier).length,
      voyagesCount: Object.values(byCarrier).flat().length,
    });

    // Store for later retrieval
    app.locals.lastResults = {
      byCarrier,
      pipeStats,
      pol,
      pod,
    };
  } catch (err) {
    console.error('[GSXR404] Scrape error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      route: { pol, pod },
    });
  }
});

// ── Export PDF ────────────────────────────────────────────────────────────
app.post('/api/export/pdf', (req, res) => {
  try {
    const results = app.locals.lastResults;
    if (!results) {
      return res.status(400).json({
        success: false,
        error: 'No results available. Run scrape first.',
      });
    }

    const pdfPath = pdfGen.generate(results.byCarrier, results.pipeStats);

    res.json({
      success: true,
      message: 'PDF generated',
      path: pdfPath,
      url: `/output/${path.basename(pdfPath)}`,
    });
  } catch (err) {
    console.error('[GSXR404] PDF export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Export CSV ────────────────────────────────────────────────────────────
app.post('/api/export/csv', (req, res) => {
  try {
    const results = app.locals.lastResults;
    if (!results) {
      return res.status(400).json({
        success: false,
        error: 'No results available. Run scrape first.',
      });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fpath = path.join(outDir, `gsxr404_${ts}.csv`);
    const entries = Object.values(results.byCarrier).flat();

    const headers = 'carrier,vessel,imo,voyage,pol,pod,etd,eta,transitDays\n';
    const rows = entries
      .map(
        v =>
          `${v.carrier || ''},"${v.vesselName || ''}",${v.imo || ''},${v.voyageNo || ''},${v.pol || ''},${v.pod || ''},${v.etd || ''},${v.eta || ''},${v.transitTime || ''}`
      )
      .join('\n');

    fs.writeFileSync(fpath, headers + rows, 'utf8');

    res.json({
      success: true,
      message: 'CSV exported',
      path: fpath,
      url: `/output/${path.basename(fpath)}`,
    });
  } catch (err) {
    console.error('[GSXR404] CSV export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Export JSON ───────────────────────────────────────────────────────────
app.post('/api/export/json', (req, res) => {
  try {
    const results = app.locals.lastResults;
    if (!results) {
      return res.status(400).json({
        success: false,
        error: 'No results available. Run scrape first.',
      });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fpath = path.join(outDir, `gsxr404_${ts}.json`);
    const entries = Object.values(results.byCarrier).flat();

    fs.writeFileSync(fpath, JSON.stringify(entries, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'JSON exported',
      path: fpath,
      url: `/output/${path.basename(fpath)}`,
    });
  } catch (err) {
    console.error('[GSXR404] JSON export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get Last Results ──────────────────────────────────────────────────────
app.get('/api/results', (req, res) => {
  try {
    const results = app.locals.lastResults;
    if (!results) {
      return res.status(400).json({
        success: false,
        error: 'No results available',
      });
    }

    const entries = Object.values(results.byCarrier).flat();
    res.json({
      success: true,
      route: { pol: results.pol, pod: results.pod },
      voyages: entries,
      stats: results.pipeStats,
      carriersCount: Object.keys(results.byCarrier).length,
      voyagesCount: entries.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Shutdown Scraper ──────────────────────────────────────────────────────
app.post('/api/scraper/close', async (req, res) => {
  try {
    if (scraper && scraperReady) {
      await scraper.close();
      scraperReady = false;
      scraper = null;
    }

    res.json({
      success: true,
      message: 'Scraper closed',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Serve Output Files ────────────────────────────────────────────────��───
app.use('/output', express.static(outDir));

// ── 404 Handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// ── Error Handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[GSXR404] Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message,
  });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('[GSXR404] Shutting down...');
  if (scraper && scraperReady) {
    try {
      await scraper.close();
    } catch (err) {
      console.error('[GSXR404] Error closing scraper:', err.message);
    }
  }
  process.exit(0);
});

// ── Start Server ─────────────��────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║       GSXR404 - Web Server (v2.0.0)             ║
║                                                ║
║  Server running on: http://localhost:${PORT}        ║
║                                                ║
║  Endpoints:                                    ║
║  • POST /api/scrape                            ║
║  • GET  /api/results                           ║
║  • POST /api/export/pdf                        ║
║  • POST /api/export/csv                        ║
║  • POST /api/export/json                       ║
║  • GET  /api/ports                             ║
║  • GET  /api/carriers                          ║
║  • POST /api/scraper/init                      ║
║  • POST /api/scraper/close                     ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
  console.log(`[GSXR404] Ready to accept requests`);
});
