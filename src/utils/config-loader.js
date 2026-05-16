const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
    this.settings = null;
    this.ports = null;
    this.carriers = [];
    this._loadAll();
  }

  _loadAll() {
    this.settings = this.loadSettings();
    this.ports = this.loadPorts();
    this.carriers = this.loadCarriers();
  }

  loadSettings() {
    const settingsPath = path.join(this.basePath, 'config', 'settings.json');
    try {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[GSXR404] Failed to load settings.json: ${err.message}`);
      return null;
    }
  }

  loadPorts() {
    const portsPath = path.join(this.basePath, 'data', 'ports.json');
    try {
      const raw = fs.readFileSync(portsPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[GSXR404] Failed to load ports.json: ${err.message}`);
      return null;
    }
  }

  loadCarriers() {
    const carriersPath = path.join(this.basePath, 'data', 'lines.txt');
    try {
      const raw = fs.readFileSync(carriersPath, 'utf8');
      const lines = raw
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const [name, url] = line.split(',');
          return {
            name: name ? name.trim() : null,
            url: url ? url.trim() : null,
            displayName: this._buildDisplayName(name ? name.trim() : 'Unknown')
          };
        })
        .filter(c => c.name && c.url);
      return lines;
    } catch (err) {
      console.error(`[GSXR404] Failed to load lines.txt: ${err.message}`);
      return [];
    }
  }

  standardizePort(rawPortName) {
    if (!this.ports || !rawPortName) return rawPortName;
    const trimmed = String(rawPortName).trim();
    if (!trimmed) return rawPortName;
    const lower = trimmed.toLowerCase();
    for (const [standard, variants] of Object.entries(this.ports.standardization)) {
      for (const variant of variants) {
        if (lower === variant.toLowerCase()) {
          return standard;
        }
      }
    }
    return trimmed;
  }

  getPortVariants(standardName) {
    if (!this.ports) return [standardName];
    const entry = this.ports.standardization[standardName];
    if (!entry) return [standardName];
    return [standardName, ...entry.filter(v => v !== standardName)];
  }

  getDateWindow() {
    const days = this.settings?.scraper?.timeWindowDays || 30;
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate());
    return {
      startDate: this._toISOString(start),
      endDate: this._toISOString(new Date(start.getTime() + days * 24 * 60 * 60 * 1000)),
      days
    };
  }

  _toISOString(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _formatForSailing(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  getSailingDateWindow() {
    const win = this.getDateWindow();
    const today = new Date();
    return {
      start: this._formatForSailing(today),
      end: this._formatForSailing(new Date(today.getTime() + win.days * 24 * 60 * 60 * 1000)),
      days: win.days
    };
  }

  _buildDisplayName(name) {
    const commonShortened = {
      'Maersk': 'MAERSK',
      'MSC': 'MSC',
      'CMA CGM': 'CMA CGM',
      'Hapag-Lloyd': 'HAPAG-LLOYD',
      'COSCO': 'COSCO',
      'ONE': 'ONE',
      'Evergreen': 'EVERGREEN',
      'Yang Ming': 'YANG MING',
      'HMM': 'HMM',
      'PIL': 'PIL',
      'OOCL': 'OOCL',
      'APL': 'APL',
      'ZIM': 'ZIM',
      'Wan Hai': 'WAN HAI',
      'TS Lines': 'TS LINES',
      'SITC': 'SITC',
      'Wei Lei': 'WEI LEI',
      'X-Press Feeders': 'X-PRESS FEEDERS',
      'RCL': 'RCL',
      'RCL Feeder': 'RCL FEEDER',
      'Sealift': 'SEALIFT',
      'Samudera': 'SAMUDERA'
    };
    return commonShortened[name] || name.toUpperCase();
  }

  reload() {
    this._loadAll();
    return this;
  }

  getSummary() {
    return {
      settingsLoaded: !!this.settings,
      portsLoaded: Object.keys(this.ports?.standardization || {}).length,
      carriersLoaded: this.carriers.length,
      timeWindowDays: this.settings?.scraper?.timeWindowDays,
      containerSizes: this.settings?.containers?.sizes,
      containerTypes: this.settings?.containers?.types
    };
  }
}

module.exports = ConfigLoader;
