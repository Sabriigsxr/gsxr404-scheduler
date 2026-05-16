const { chromium } = require('playwright');
const ConfigLoader = require('../utils/config-loader');

class StealthScraper {
  constructor(configLoader) {
    this.configLoader = configLoader;
    this.config = configLoader.settings;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = [];
    this.errors = [];
  }

  async init() {
    const browserConfig = this.config?.browser || {};
    this.browser = await chromium.launch({
      headless: browserConfig.headless !== false
        ? 'new'
        : false,
      args: browserConfig.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      ...browserConfig.extraConfig
    });
    const context = await this.browser.newContext({
      viewport: browserConfig.viewport,
      userAgent: this.config?.scraper?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      locale: 'en-US',
      timezoneId: 'Europe/Amsterdam',
      permissions: []
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.challengeTimeout = 120000;
    });
    this.context = context;
    const page = await context.newPage();
    this.page = page;

    await this.page.setDefaultTimeout(this.config?.scraper?.requestTimeoutMs || 30000);
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  }

  async scrapeCarrier(carrier) {
    const maxRetries = this.config?.scraper?.maxRetries || 3;
    const retryDelay = this.config?.scraper?.retryDelayMs || 2000;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const page = this.page;
      if (!page) {
        lastError = new Error('Browser page not available');
        continue;
      }
      try {
        console.log(`[GSXR404][SCRAPE] Starting carrier: ${carrier.displayName} (try ${attempt + 1}/${maxRetries})`);
        await page.goto(carrier.url, { waitUntil: 'networkidle', timeout: 35000 });

        if (this._isPageBlocked(page)) {
          throw new Error('Blocked by anti-bot page');
        }

        const voyages = await this._extractScheduleData(carrier);
        console.log(`[GSXR404][SCRAPE] Extracted ${voyages.length} records for ${carrier.displayName}`);
        return voyages.map(v => ({
          ...v,
          carrier: carrier.name,
          carrierDisplayName: carrier.displayName,
          sourceUrl: carrier.url,
          scrapedAt: new Date().toISOString()
        }));
      } catch (err) {
        lastError = err;
        console.warn(`[GSXR404][WARN] Attempt ${attempt + 1} failed for ${carrier.name}: ${err.message}`);
        if (attempt < maxRetries - 1) {
          const backoff = retryDelay * Math.pow(1.5, attempt);
          await this._sleep(backoff);
          await this._refreshPage(carrier.url);
        }
      }
    }
    return [];
  }

  _isPageBlocked(page) {
    try {
      const host = new URL(page.url()).hostname;
      const blockedHosts = [
        'cloudflare.com',
        '__cf_chl_jschl_tk__',
        'datadome.co',
        'akamai.com',
        'js.datadome.co',
        'captcha-delivery.com',
        'challenges.cloudflare.com'
      ];
      if (blockedHosts.some(b => host.includes(b))) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  async _refreshPage(url) {
    try {
      const freshPage = await this.context.newPage();
      this.page = freshPage;
      await freshPage.setDefaultTimeout(this.config?.scraper?.requestTimeoutMs || 30000);
      await freshPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (_) {}
  }

  async _extractScheduleData(carrier) {
    const voyages = [];

    switch (carrier.name) {
      case 'Maersk':
        return this._scrapeMaersk(carrier);
      case 'MSC':
        return this._scrapeMSC(carrier);
      case 'CMA CGM':
        return this._scrapeCMACGM(carrier);
      case 'Hapag-Lloyd':
        return this._scrapeHapagLloyd(carrier);
      case 'COSCO':
        return this._scrapeCOSCO(carrier);
      case 'ONE':
        return this._scrapeONE(carrier);
      case 'Evergreen':
        return this._scrapeEvergreen(carrier);
      default:
        return await this._scrapeGeneric(carrier);
    }
  }

  async _scrapeMaersk(carrier) {
    const dateWindow = this.configLoader?.getSailingDateWindow() || { start: '', end: '' };
    const page = this.page;
    try {
      await page.goto(carrier.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('input[name="from"], input[data-testid="origin-input"], input[placeholder*="Port of loading"], input[class*="origin"]', { timeout: 10000 });
    } catch (_) {
      return [];
    }

    const selectors = {
      origin: 'input[name="from"], input[data-testid="origin-input"], input[placeholder*="Port of loading"], input[class*="origin"]',
      destination: 'input[name="to"], input[data-testid="destination-input"], input[placeholder*="Port of discharge"], input[class*="destination"]',
      searchBtn: 'button[type="submit"], button[class*="search"], button[data-testid*="search"]'
    };

    return await this._fillFormAndScrape(selectors, 'Maersk', carrier);
  }

  async _scrapeMSC(carrier) {
    const dateWindow = this.configLoader?.getSailingDateWindow() || { start: '', end: '' };
    const page = this.page;

    try {
      await page.goto(carrier.url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      const selectors = {
        origin: 'input[name="origin"], select[name="origin"], select[id*="Origin"]',
        destination: 'input[name="destination"], select[name="destination"], select[id*="Destination"]',
        searchBtn: 'button[class*="search-btn"], input[value="Search"], button[type="submit"]'
      };
      this.page = page;
      return await this._fillFormAndScrape(selectors, 'MSC', carrier);
    } catch (_) {
      return [];
    }
  }

  async _scrapeCMACGM(carrier) {
    return await this._scrapeGeneric(carrier);
  }

  async _scrapeHapagLloyd(carrier) {
    return await this._scrapeGeneric(carrier);
  }

  async _scrapeCOSCO(carrier) {
    return await this._scrapeGeneric(carrier);
  }

  async _scrapeONE(carrier) {
    return await this._scrapeGeneric(carrier);
  }

  async _scrapeEvergreen(carrier) {
    return await this._scrapeGeneric(carrier);
  }

  async _scrapeGeneric(carrier) {
    const page = this.page;
    const voyages = [];

    try {
      const standardUrl = carrier.url + `?from=ROTTERDAM&to=HAMBURG&date_range=${Date.now()}`;
      await page.goto(standardUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (_) {}

    try {
      const tableRows = await page.$$('table tbody tr, tbody > tr, .schedule-row, [class*="schedule"] tr, [class*="voyage"]');
      if (tableRows.length === 0) return voyages;

      for (const tr of tableRows.slice(1, 51)) {
        try {
          const cells = await tr.$$('td');
          if (cells.length < 5) continue;

          const texts = await Promise.all(cells.map(c => c.textContent().then(t => t.trim()).catch(() => '')));
          const voyage = this._parseRowCells(texts, carrier);
          if (voyage) voyages.push(voyage);
        } catch (_) {}
      }
    } catch (_) {}

    return voyages;
  }

  async _fillFormAndScrape(selectors, siteName, carrier) {
    const page = this.page;
    const voyages = [];

    try {
      for (const [field, sel] of Object.entries(selectors)) {
        if (!sel) continue;
        try {
          let el = await page.$(sel);
          if (el) {
            if (field === 'searchBtn') {
              await el.click({ force: true });
            } else {
              await el.fill('', { force: true });
              await this._sleep(200);
            }
          }
        } catch (_) {}
      }
      await this._sleep(1000);
      await page.evaluate(() => window.scrollBy(0, 500));
      return await this._scrapeGeneric(carrier);
    } catch (_) {
      return voyages;
    }
  }

  _parseRowCells(cells, carrier) {
    if (cells.length < 3) return null;
    const pickDate = (str) => {
      const m = str.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/);
      if (!m) return null;
      return new Date(m[0]);
    };
    const parseDateSafely = (val) => {
      if (!val) return null;
      return pickDate(val);
    };

    const voyageNo = cells[0] || '';
    const vesselName = cells[1] || '';
    const imoMatch = (vesselName.match(/(\d{7})/) || []);
    let etdRaw = '';
    let etaRaw = '';
    let podName = '';
    let transitDisplay = '';

    if (cells.length >= 8) {
      etdRaw = cells[2] || '';
      etaRaw = cells[3] || '';
      podName = cells[4] || '';
      transitDisplay = cells[5] || '';
    } else {
      etdRaw = cells.find(c => pickDate(c)) || cells[1] || '';
      etaRaw = cells.find((c, i) => i > 1 && pickDate(c) && i !== cells.indexOf(etdRaw)) || cells[2] || '';
    }

    const etd = parseDateSafely(etdRaw);
    const eta = parseDateSafely(etaRaw);
    if (!etd || !eta) return null;

    let transitTimeDays = null;
    if (transitDisplay) {
      const tm = transitDisplay.match(/(\d+)\s*days?/i);
      if (tm) transitTimeDays = parseInt(tm[1], 10);
    }
    if (transitTimeDays === null && eta && etd) {
      const diffMs = eta.getTime() - etd.getTime();
      transitTimeDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    const today = new Date();
    const cutoff = new Date(today.getTime() + (this.config?.scraper?.timeWindowDays || 30) * 24 * 60 * 60 * 1000);
    if (etd < today.getTime() - (3 * 24 * 60 * 60 * 1000)) return null;
    if (!(etd >= today.getTime() - 86400000 && etd <= cutoff)) return null;

    return {
      carrier: carrier.name,
      carrierDisplayName: carrier.displayName,
      vesselName: vesselName.slice(0, 50),
      imo: imoMatch[0] || null,
      voyageNo: voyageNo.slice(0, 30),
      pol: carrier.displayName.includes('MAERSK') ? 'ROTTERDAM' : 'GENERIC_POL',
      pod: podName || etdRaw.slice(0, 30),
      etd: this._formatDateISO(etd),
      eta: this._formatDateISO(eta),
      transitTimeDays: transitTimeDays,
      containerSizes: this.config?.containers?.sizes || [],
      containerTypes: this.config?.containers?.types || [],
      scrapedAt: new Date().toISOString(),
      sourceUrl: carrier.url
    };
  }

  _formatDateISO(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async scrapeAll(pol, pod) {
    if (!this.context || !this.page) {
      await this.init();
    } else {
      const freshPage = await this.context.newPage();
      this.page = freshPage;
    }

    console.log(`\n[GSXR404][RUN] Scraping ${this.configLoader.carriers.length} carriers...`);
    console.log(`[GSXR404][RUN] POL: ${pol} | POD: ${pod} | Window: ${this.config?.scraper?.timeWindowDays}d`);

    this.results = [];
    this.errors = [];

    for (let i = 0; i < this.configLoader.carriers.length; i++) {
      const carrier = this.configLoader.carriers[i];
      const voyages = await this.scrapeCarrier(carrier);
      this.results.push(...voyages);
      await this._sleep(300);
    }

    console.log(`\n[GSXR404][DONE] Total voyages scraped: ${this.results.length}`);
    return {
      voyages: this.results,
      stats: {
        carriersProcessed: this.configLoader.carriers.length,
        totalVoyages: this.results.length,
        errors: this.errors.length,
        errorDetails: this.errors.slice(0, 10)
      }
    };
  }

  async close() {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (_) {}
  }
}

module.exports = StealthScraper;
