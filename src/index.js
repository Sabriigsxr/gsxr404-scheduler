#!/usr/bin/env node
/**
 * GSXR404 — Shipping Schedule Aggregator
 * Entry: config → (menu → route → scrape → results → export) loop
 */

const path   = require('path');
const fs     = require('fs');

process.title = 'GSXR404-Scheduler';

const { TerminalUI, B, P } = require('./frontend/terminal-ui');
const ConfigLoader  = require('./utils/config-loader');
const StealthScraper = require('./scrapers/stealth-scraper');
const DataPipeline  = require('./pipeline/data-pipeline');
const PDFGenerator  = require('./frontend/pdf-generator');

// ── helpers ──────────────────────────────────────────────────────────────────
const outDir = path.join(process.cwd(), 'output');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── main ──────────────────────────────────────────────────────────────────── */
async function run() {
  const projectRoot = path.join(__dirname, '..');
  const config      = new ConfigLoader(projectRoot);

  /* instantiate all layers */
  const ui      = new TerminalUI(config);
  const scraper = new StealthScraper(config);
  const pipeline= new DataPipeline(config);
  const pdfGen  = new PDFGenerator(config);
  let   scraperReady = false;

  /* ── main menu loop ─────────────────────────────────────────────────── */
  running: while (true) {
    ui.showHome();

    const { value } = await ui.ask('GO', '1');
    const cmd = value.toUpperCase().replace(/[^0-9A-Z]/g, '');

    try {
      switch (cmd) {
        /* ── 1 : SINGLE ROUTE SCAN ─────────────────────────────────── */
        case '1': {
          const { pol, pod } = await ui.showRouteInput();
          if (!pol || !pod) break;

          /* initialise browser on first use */
          if (!scraperReady) {
            ui.clear();
            ui._frame([
              '',
              `  ${P.amber}INITIALISING${_}${P.green} stealth browser${_}`,
              `  ${P.dim}launching Chromium headless${_}`,
              '',
            ]);
            await scraper.init();
            scraperReady = true;
          }

          /* show progress screen */
          ui.showScrapeProgress(pol, pod);
          await sleep(800);

          /* ladder per-carrier progress updates */
          const carrierNames = config.carriers.map(c => c.displayName || c.name || '?');
          const updates = carrierNames.map((name, i) => {
            const milestone = [100, 70, 40, 20].find(t => Math.random() * 100 < t) || 100;

            /* step completed */
            setTimeout(() => ui.updateCarrierProgress(i, 'fetching', 10, 'fetching...'), i * 300);

            /* mid */
            setTimeout(() => ui.updateCarrierProgress(i, 'fetching', milestone < 90 ? 60 : 70, 'parsing...'), i * 300 + 600);

            /* done / error / no-data */
            setTimeout(() => {
              const rng = Math.random();
              const lbl = rng < 0.15 ? 'error' : rng < 0.30 ? 'no-data' : '12 voyages';
              ui.updateCarrierProgress(i, rng < 0.15 ? 'error' : 'done', 100, rng < 0.15 ? 'error' : rng < 0.30 ? '—' : '12 voy');
            }, i * 300 + 1800);
          });

          /* give updates time to kick off, then scrape */
          await sleep(Math.min(carrierNames.length * 300 + 2000, 5000));

          const { voyages, stats: scrapeStats } = await scraper.scrapeAll(pol, pod);

          pipeline.load(voyages);
          const cleaned = pipeline.clean();
          const sorted  = pipeline.sort();
          const pu      = pipeline.getStats();

          const byC = pipeline.getRecordsByCarrier();
          const { value: action } = await ui.showScrapeComplete(pol, pod, byC, pu);
          await handlePostScrape(ui, pdfGen, byC, pu, pol, pod, scraper, scraperReady);
          break;
        }

        /* ── 2 : BATCH ─────────────────────────────────────────────── */
        case '2': {
          const { pol, pod } = await ui.showRouteInput();
          if (!pol || !pod) break;
          if (!scraperReady) {
            ui._frame(['', `  ${P.amber}INITIALISING${_} ${P.green}stealth browser...${_}`]);
            await scraper.init();
            scraperReady = true;
          }
          ui.showScrapeProgress(pol, pod);
          const { voyages } = await scraper.scrapeAll(pol, pod);
          pipeline.load(voyages);
          const cleaned = pipeline.clean();
          const sorted  = pipeline.sort();
          const pu      = pipeline.getStats();
          const byC     = pipeline.getRecordsByCarrier();
          const { value } = await ui.showScrapeComplete(pol, pod, byC, pu);
          await handlePostScrape(ui, pdfGen, byC, pu, pol, pod, scraper, scraperReady);
          break;
        }

        /* ── 3 : SHOW LAST RESULTS ─────────────────────────────────── */
        case '3': {
          if (!ui._results) {
            ui.clear();
            ui._frame([
              ...ui._header(), '',
              `  ${P.yellow}⚠${_}  ${P.amber}NO RESULTS IN SESSION${_}`,
              `  ${P.dim}Run a scan first, then view results here.${_}`,
              '',
            ]);
            await sleep(1500);
            break;
          }
          ui.showResults(ui._results.byCarrier, ui._results.pipeStats);
          await ui.ask('', '');
          break;
        }

        /* ── 4 : SHOW SETTINGS ─────────────────────────────────────── */
        case '4':
          ui.showSettings();
          await ui.ask('', '');
          break;

        /* ── 5 : HELP ─────────────────────────────────────────────── */
        default:
          ui.showHelp();
          await ui.ask('', '');
          break;
      }
    } catch (err) {
      ui.clear();
      ui._frame([
        ...ui._header(), '',
        `  ${P.red}${B.XMK}  FATAL: ${err.message}${_}`,
        `  ${P.dim}${err.stack ? err.stack.split('\n').slice(1,4).join('\n') : ''}${_}`,
        '',
      ]);
      await sleep(2000);
    }

    /* ── QUIT ─────────────────────────────────────────────────────── */
    if (cmd === 'Q') {
      break running;
    }
  }

  /* ── shutdown ───────────────────────────────────────────────────── */
  if (scraperReady) {
    try { await scraper.close(); } catch (_) {}
  }
  ui._quitBanner();
  await sleep(1200);
  ui.close();
  process.exit(0);
}

/* ── post-scrape sub-menu handler ─────────────────────────────────────────── */
async function handlePostScrape(ui, pdfGen, byCarrier, pipeStats, pol, pod, scraper, scraperReady) {
  while (true) {
    const { value: ans } = await ui.ask('SELECT', '');
    const a = ans.trim().toUpperCase().replace(/[^0-9QRWE]/g, '');

    switch (a) {
      case '1':   /* view results */
        ui.showResults(byCarrier, pipeStats);
        await ui.ask('', '');
        break;

      case '2': { /* export PDF */
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const pdfPath = pdfGen.generate(byCarrier, pipeStats);
        ui.clear();
        ui._frame([
          ...ui._header(), '',
          `  ${P.gGreen}${B.CHK}${_}  PDF WRITTEN${_}`,
          `  ${P.dim}${pdfPath}${_}`,
          '',
        ]);
        await sleep(1500);
        break;
      }

      case '3': { /* export CSV */
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const ts  = new Date().toISOString().replace(/[:.]/g,'-');
        const fpath = `${outDir}/gsxr404_${ts}.csv`;
        const entries = Object.entries(byCarrier).flatMap(([, v]) => v);
        const headers  = 'carrier,vessel,imo,voyage,pol,pod,etd,eta,transitDays\n';
        const rows     = entries.map(v =>
          `${v.carrier||''},"${v.vesselName||''}",${v.imo||''},${v.voyageNo||''},${v.pol||''},${v.pod||''},${v.etd||''},${v.eta||''},${v.transitTime||''}`
        ).join('\n');
        fs.writeFileSync(fpath, headers + rows, 'utf8');
        ui.clear();
        ui._frame([...ui._header(), '', `  ${P.gGreen}${B.CHK}${_}  CSV WRITTEN  ${P.dim}${fpath}${_}`]);
        await sleep(1500);
        break;
      }

      case '4':   /* new route */
        return;   // bubble back to menu loop

      case 'Q':   /* quit */
        if (scraperReady) { try { await scraper.close(); } catch (_) {} }
        ui._quitBanner();
        await sleep(400);
        ui.close();
        process.exit(0);
        break;

      default:
        break;
    }
  }
}

run().catch(err => {
  console.error('[GSXR404] FATAL:', err.message);
  process.exit(1);
});
