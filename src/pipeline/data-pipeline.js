const ConfigLoader = require('../utils/config-loader');

class DataPipeline {
  constructor(configLoader) {
    this.config = configLoader;
    this.rawData = [];
    this.cleanedData = [];
    this.sortStats = {};
  }

  load(rawVoyages) {
    this.rawData = Array.isArray(rawVoyages) ? rawVoyages : [];
    return this;
  }

  clean() {
    this.cleanedData = this.rawData.map(v => this._standardizeRecord(v)).filter(Boolean);
    this.cleanedData = this._filterDateWindow(this.cleanedData);
    this.cleanedData = this._filterContainers(this.cleanedData);
    this.cleanedData = this._deduplicate(this.cleanedData);
    this.cleanedData = this._computeTransitTimes(this.cleanedData);
    return this.cleanedData;
  }

  sort() {
    const carrierCounts = {};
    for (const v of this.cleanedData) {
      const key = v.carrier || 'unknown';
      carrierCounts[key] = (carrierCounts[key] || 0) + 1;
    }

    const sortedKeys = Object.entries(carrierCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([k]) => k);

    const keySort = {};
    sortedKeys.forEach((k, i) => { keySort[k] = i; });

    this.cleanedData.sort((a, b) => {
      const aKey = a.carrier || 'unknown';
      const bKey = b.carrier || 'unknown';
      const keyDiff = (keySort[aKey] || 99) - (keySort[bKey] || 99);
      if (keyDiff !== 0) return keyDiff;

      const aEtd = new Date(a.etd || '').getTime();
      const bEtd = new Date(b.etd || '').getTime();
      if (!isNaN(aEtd) && !isNaN(bEtd)) return aEtd - bEtd;
      return 0;
    });

    this.sortStats = {
      totalRecords: this.cleanedData.length,
      carriersSorted: Object.keys(carrierCounts).length,
      topCarriers: Object.entries(carrierCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([c, n]) => ({ carrier: c, voyageCount: n }))
    };

    return this.cleanedData;
  }

  getStats() {
    return {
      inputRecords: this.rawData.length,
      outputRecords: this.cleanedData.length,
      removedInClean: this.rawData.length - this.cleanedData.length,
      cleanRemoved: this.rawData.length - this.cleanedData.length,
      sortStats: this.sortStats,
      windowDays: this.config.settings?.scraper?.timeWindowDays
    };
  }

  getCleanData() {
    return this.cleanedData;
  }

  getCleanedRecords() {
    return this.cleanedData;
  }

  getUniqueCarriers() {
    return [...new Set(this.cleanedData.map(v => v.carrierDisplayName))];
  }

  getRecordsByCarrier() {
    const grouped = {};
    for (const v of this.cleanedData) {
      const carrier = v.carrierDisplayName || v.carrier || 'Unknown';
      if (!grouped[carrier]) grouped[carrier] = [];
      grouped[carrier].push(v);
    }
    return grouped;
  }

  _standardizeRecord(v) {
    if (!v || typeof v !== 'object') return null;
    const standardized = {
      carrier: v.carrier || 'Unknown',
      carrierDisplayName: v.carrierDisplayName || v.carrier || 'Unknown',
      vesselName: this._sanitize(v.vesselName) || '',
      imo: this._normalizeIMO(v.imo),
      voyageNo: this._sanitize(v.voyageNo) || '',
      pol: this.config.standardizePort(v.pod || v.pol || v.origin || ''),
      pod: this.config.standardizePort(v.pod || v.pod || v.destination || ''),
      etd: this._parseDate(v.etd),
      eta: this._parseDate(v.eta),
      transitTime: v.transitTime || v.transitTimeDays,
      scrapedAt: v.scrapedAt,
      sourceUrl: v.sourceUrl
    };
    return standardized;
  }

  _sanitize(input) {
    if (!input || typeof input !== 'string') return '';
    return input.replace(/\s+/g, ' ').trim();
  }

  _normalizeIMO(raw) {
    if (!raw) return null;
    const num = String(raw).replace(/\D/g, '');
    return num.length === 7 ? num : null;
  }

  _parseDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  _filterDateWindow(records) {
    const today = new Date();
    const windowDays = this.config.settings?.scraper?.timeWindowDays || 30;
    const cutoff = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const pastCutoff = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

    return records.filter(v => {
      const etdMs = v.etd ? new Date(v.etd).getTime() : NaN;
      return !isNaN(etdMs) && etdMs >= pastCutoff.getTime() && etdMs <= cutoff.getTime();
    });
  }

  _filterContainers(records) {
    if (this.config.settings?.containers?.sizes?.length === 0) return records;
    return records;
  }

  _deduplicate(records) {
    const seen = new Set();
    const deduped = [];
    for (const v of records) {
      const idParts = [v.carrier, v.vesselName, v.imo, v.etd, v.pol, v.pod].join('|');
      const id = idParts.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(v);
    }
    return deduped;
  }

  _computeTransitTimes(records) {
    for (const v of records) {
      if (!v.transitTime && v.etd && v.eta) {
        try {
          const etdMs = new Date(v.etd).getTime();
          const etaMs = new Date(v.eta).getTime();
          if (!isNaN(etdMs) && !isNaN(etaMs)) {
            const days = Math.round((etaMs - etdMs) / (1000 * 60 * 60 * 24));
            v.transitTime = Math.max(1, days);
          }
        } catch (_) {}
      }
    }
    return records;
  }
}

module.exports = DataPipeline;
