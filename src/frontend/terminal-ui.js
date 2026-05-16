#!/usr/bin/env node
/**
 * GSXR404 — Retro Terminal UI  (terminator / 80s cargo-hacker aesthetic)
 * Style : amber/acid-green on black, box-drawing frames, scanlines
 */

const readline = require('readline');

// ── Palette ──────────────────────────────────────────────────────────────────

const P = {
  amber:    '\x1b[38;5;214m',
  amberDb:  '\x1b[38;5;130m',
  amberFb:  '\x1b[38;5;220m',
  gGreen:   '\x1b[1;38;5;22m',
  green:    '\x1b[32m',
  cyan:     '\x1b[1;36m',
  red:      '\x1b[1;31m',
  gray:     '\x1b[38;5;244m',
  magenta:  '\x1b[1;35m',
  yellow:   '\x1b[1;33m',
  bold:     '\x1b[1m',
  dim:      '\x1b[2m',
  reset:    '\x1b[0m',
};
const _ = P.reset;

// ── Box-drawing characters ──────────────────────────────────────────────────

const B = {
  TL: '╔',  TR: '╗',
  BL: '╚',  BR: '╝',
  ML: '╠',  MR: '╣',
  T:  '╦',  Bt: '╩',
  X:  '╬',
  H:  '═',  V:  '║',
  AR: '→',  AR2: '▸',
  CHK:'✓',  XMK:'✗',  DOT:'●',
  SP: ' ',
};

// ── Layout ──────────────────────────────────────────────────────────────────

const W = 76;   // inner text width

// ── ANSI helpers ────────────────────────────────────────────────────────────

const ansiStrip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const aLen      = s => ansiStrip(s).length;
const padR      = (s, n) => { const t = ansiStrip(String(s)); return t.length > n ? t.slice(0, n-1)+'…' : t.padEnd(n); };
const rep       = (c, n) => c.repeat(n);
const dim       = t   => `${P.dim}${t}${_}`;

// ── Border drawing helpers ──────────────────────────────────────────────────

const topBorder  = ()  => `${P.amber}${B.TL}${B.H.repeat(W+2)}${B.TR}${_}\n`;
const botBorder  = ()  => `${P.amberDb}${B.BL}${B.H.repeat(W+2)}${B.BR}${_}\n`;
const rowGreen   = line => `${P.gGreen}${B.V} ${padR(line, W)} ${P.amberDb}${B.V}${_}\n`;
const rowAmber   = line => `${P.amberDb}${B.V} ${padR(line, W)} ${P.amberDb}${B.V}${_}\n`;
const rowDim     = line => `${P.gGreen}${B.V} ${dim(padR(line, W))} ${P.amberDb}${B.V}${_}\n`;

// ── TerminalUI ──────────────────────────────────────────────────────────────

class TerminalUI {
  constructor(configLoader) {
    this.config  = configLoader;
    this.rl      = readline.createInterface({ input: process.stdin, output: process.stdout });
    this._results = null;
    this._route   = null;
  }

  clear()  { process.stdout.write('\x1b[2J\x1b[H'); }

  // ── internal: paint a full framed screen ──────────────────────────────────

  _frame(lines) {
    let out = '';
    out += topBorder();
    for (const row of lines) out += rowAmber(row);
    out += botBorder();
    process.stdout.write(out + '\n');
  }

  // ── single async prompt ───────────────────────────────────────────────────

  async ask(label, defaultVal, opts = {}) {
    const pfx  = opts.promptColor || P.amber;
    const hint = defaultVal ? ` ${P.dim}(${defaultVal})${_}` : '';
    process.stdout.write(`\r${pfx}${B.AR}${_}  ${label}${hint}: `);
    return new Promise(resolve => {
      this.rl.question('', raw => resolve(String(raw || defaultVal).trim()));
    });
  }

  /** raw readline prompt with given text */
  _read(prompt) {
    return new Promise(res => {
      process.stdout.write(prompt);
      this.rl.question('', raw => res(raw.trim()));
    });
  }

  // ── ENDPOINT: HOME ────────────────────────────────────────────────────────

  _getHomeMenu() {
    const n = this.config?.carriers?.length || 0;
    return [
      `${P.green}${B.DOT} GSXR404 ${P.amber}SHIPPING SCHED AGGREGATOR  ·  v2024.01${_}`,
      `${P.green} MEM ${P.amber}${((process.memoryUsage().rss/1048576)|0)}MB${P.green}  │  NODES ${P.amber}${n}${P.green}  │  UPTIME ${P.amber}${this._uptime()}${_}`,
    ];
  }

  showHome() {
    this.clear();
    const lines = [
      ...this._header(),
      '',
      ...this._getHomeMenu(),
      '',
      `${P.amber}${B.TL}${'═'.repeat(W+2)}${B.TR}${_}`,
      `${P.amberDb}${B.V}${padR('  MAIN MENU', W+2)}${P.amberDb}${B.V}${_}`,
      `${P.amber}${B.ML}${'═'.repeat(W+2)}${B.MR}${_}`,
    ];

    const items = [
      ['[ 1 ]', P.green, 'SCAN   Single Route Scan  (POL \u00bb POD \u00bb PDF)'],
      ['[ 2 ]', P.green, 'BATCH  Multi-Carrier Sweep  — all active routes'],
      ['[ 3 ]', P.green, 'SHOW   Last Results Table'],
      ['[ 4 ]', P.green, 'CONFIG View Settings / Ports / Lines'],
      ['[ Q ]', P.red,   'EXIT   Terminate session and quit'],
    ];
    for (let i = 0; i < items.length; i++) {
      const [key, color, label] = items[i];
      const divider = i < items.length - 1
        ? `${P.amber}${B.ML}${'═'.repeat(W+2)}${B.MR}${_}\n`
        : `${P.amberDb}${B.BL}${'═'.repeat(W+2)}${P.amber}${B.BR}${_}\n`;
      const right  = i < items.length - 1
        ? `${P.amberDb}${B.V}${_}\n`
        : `${P.amberDb}${B.V}  ${P.dim}GLITCH CORP  1984${_}${rep(' ', W - aLen('  GLITCH CORP  1984'))}${P.amberDb}${B.V}${_}\n`;
      lines.push(`${P.green} ${key}${_}  ${color}${label}${_}`);
      lines.push(divider);
      lines.push(right);
    }
    lines.push(`${P.dim}  | | |  GSXR404  | | |  www.glitch.example  | | |${_}`);
    this._frame(lines);
  }

  // ── ENDPOINT: ROUTE INPUT ─────────────────────────────────────────────────

  async showRouteInput() {
    this.clear();
    const hint = this.config?.ports
      ? Object.keys(this.config.ports.standardization).slice(0, 8).join(', ')
      : 'ROTTERDAM  HAMBURG  SHANGHAI  SINGAPORE  SANTOS  ...';

    const lines = [
      ...this._header(),
      '',
      `${P.amberDb}  ${P.amber}R  O  U  T  E     D  E  F  I  N  I  T  I  O  N${_}`,
      `${rep(B.H, W+2)}`,
      '',
      `${P.amberDb}  POL${_}  ${P.gGreen}${B.AR}${_}  ${dim('port of loading')}  quick: [1]=RTM  [2]=HAM  [3]=SHA`,
      `${P.amberDb}  POD${_}  ${P.gGreen}${B.AR}${_}  ${dim('port of discharge')}  quick: [4]=SIN  [5]=SANTOS  [6]=JEB`,
      '',
    ];
    this._frame(lines);

    let pol = '';
    let pod = '';

    while (!pol) {
      pol = await this._read(`  ${P.amberDb}POL${P.green}  >${_} `);
      if (this.config?.ports?.standardization) {
        const std = this.config.standardizePort(pol);
        if (std) pol = std;
      }
      if (!pol) this._warn('  POL cannot be empty — try again');
    }

    while (!pod) {
      pod = await this._read(`  ${P.amberDb}POD${P.green}  >${_} `);
      if (this.config?.ports?.standardization) {
        const std = this.config.standardizePort(pod);
        if (std) pod = std;
      }
      if (!pod) this._warn('  POD cannot be empty — try again');
    }

    return { pol, pod };
  }

  // ── ENDPOINT: SCRAPE PROGRESS ─────────────────────────────────────────────

  /**
   * Paint the initial carrier-listing progress screen.
   * Afterwards, call updateCarrierProgress() for each row update.
   */
  showScrapeProgress(pol, pod) {
    this.clear();
    const names = (this.config?.carriers || []).map(c => c.displayName || c.name || '?');
    const rows  = names.map((name, i) =>
      `${P.amberDb}  ${String(i+1).padStart(2,'0')}  ${P.green}${padR(name, 16)}${_}` +
      `${P.dim}${padR('[░░░░░░░░░░]  pending', 60)}${_}`
    );

    const lines = [
      ...this._header(),
      '',
      `${P.amberDb}  TRACE ${P.gGreen}${B.AR2}${_}  ${P.amber}ROUTE  ${P.gGreen}${pol} ${B.AR2}  ${pod}${_}`,
      '',
      ...rows,
      '',
      `${P.dim}  ● stealth browser active  ·  timestamps in Zulu  ·  jitter: random±250ms${_}`,
    ];
    this._frame(lines);
  }

  /**
   * Update one progress row in-place with ANSI cursor-up tricks.
   * Must be called after showScrapeProgress().
   * @param {number}  idx     0-based row index
   * @param {'fetching'|'done'|'error'|'no-data'} status
   * @param {number}  pct     0 – 100
   * @param {string}  label   right-side label
   */
  updateCarrierProgress(idx, status, pct, label) {
    const filled = Math.round(pct / 10);
    const empty  = 10 - filled;
    const col    = status === 'done'     ? P.gGreen
                 : status === 'error'    ? P.red
                 : status === 'fetching' ? P.amber
                 :                         P.amberDb;
    const bar   = col + B.H.repeat(filled) + '░'.repeat(empty) + _;
    const name  = (this.config?.carriers?.[idx]?.displayName || `CARRIER ${idx+1}`);
    const color = idx % 2 === 1 ? P.amberDb : '';
    const amt   = rep(B.H, pct);
    process.stdout.write(
      `\x1b[${idx + 4}A\r` +
      `${color}${P.amberDb}  ${String(idx+1).padStart(2,'0')}  ${P.green}${padR(name,16)}${_}  ` +
      `${bar}${color}  ${padR(label,20)}${_}\n`
    );
  }

  // ── ENDPOINT: SCRAPE COMPLETE ─────────────────────────────────────────────

  async showScrapeComplete(pol, pod, byCarrier, pipeStats) {
    this._results = { byCarrier, pipeStats };
    this._route   = { pol, pod };

    const nRec   = pipeStats?.outputRecords ?? Object.values(byCarrier).flat().length;
    const nCarr  = Object.keys(byCarrier).length;

    this.clear();
    const lines = [
      ...this._header(),
      '',
      `  ${P.gGreen}${B.CHK}${_}  ${P.amber}SCRAPE CYCLE COMPLETE${_}`,
      `${rep(B.H, W+2)}`,
      '',
      `${P.amberDb}  ROUTE  ${P.green}${pol}${P.amberDb}  ${B.AR2}  ${P.green}${pod}${_}`,
      `${P.amberDb}  FILES  ${P.green}${nRec}${_} records from ${P.green}${nCarr}${_} carriers`,
      `${P.amberDb}  @ ${P.dim}${new Date().toISOString().replace('T',' ').slice(0,19)} UTC${_}`,
      '',
      `${P.green}  [1]${_}  ${P.amber}VIEW RESULTS TABLE${_}`,
      `${P.green}  [2]${_}  ${P.amber}EXPORT PDF${_}`,
      `${P.green}  [3]${_}  ${P.amber}EXPORT CSV${_}`,
      `${P.green}  [4]${_}  ${P.amber}NEW ROUTE${_}`,
      `${P.green}  [Q]${_}  ${P.red}EXIT${_}`,
    ];
    this._frame(lines);
  }

  // ── ENDPOINT: RESULTS TABLE ───────────────────────────────────────────────

  showResults(byCarrier, pipeStats) {
    const entries = Object.entries(byCarrier || {});
    if (!entries.length) {
      this.clear();
      this._frame([
        ...this._header(), '',
        `  ${P.red}${B.XMK}  NO RESULTS — check POL / POD${_}`,
        '',
      ]);
      return;
    }

    entries.sort((a, b) => b[1].length - a[1].length);

    const lines = [];
    lines.push(
      `  ${P.green}${B.DOT}${_}  ${P.amber}R E S U L T S  D U M P${_}  ` +
      `${P.dim}${(pipeStats?.outputRecords || 0)} records  ·  ${entries.length} carriers${_}`
    );

    for (const [carrier, voyages] of entries) {
      const shown = voyages.slice(0, 5);
      lines.push(`${P.magenta}  ${B.AR2} ${P.amber}${padR(carrier.toUpperCase(), 56)}${P.magenta} (${String(voyages.length)}v)${_}`);

      for (const v of shown) {
        const bar = `${P.green}${rep(B.H, Math.min(+v.transitTime||0,7))}${'░'.repeat(10-Math.min(+v.transitTime||0,7))}${_}`;
        lines.push(
          `    ${P.green}${padR(v.voyageNo||'-', 10)}│${_}` +
          `${P.amber}${padR((v.vesselName||'-').slice(0,24), 24)}│${_}` +
          `${P.cyan}${padR(v.imo||'-', 10)}│${_}` +
          `${P.amber}${padR(v.etd||'—', 11)}│${_}` +
          `${P.amber}${padR(v.eta||'—', 11)}${_}  ` +
          `${bar}${P.dim} ${String(v.transitTime||'').padStart(3)}d${_}`
        );
      }
      if (voyages.length > 5)
        lines.push(`${P.dim}    ... +${voyages.length - 5} more${_}`);
    }
    lines.push('');
    this._frame(lines);
  }

  // ── ENDPOINT: SETTINGS / HELP ─────────────────────────────────────────────

  showSettings() {
    this.clear();
    const s = this.config?.settings || {};
    const cfg = [
      `${P.amberDb} [CFG]${P.amber} GSXR404 SETTINGS DUMP ${_}`,
      `${rep(B.H, W+2)}`,
      '',
      ...([
        ['Time Window', `${s.scraper?.timeWindowDays ?? '—'} days`],
        ['Retries',     `${s.scraper?.maxRetries ?? '—'}`],
        ['Concurrency', `${s.scraper?.concurrentScrapers ?? '—'}`],
        ['Headless',    `${String(s.browser?.headless ?? '—')}`],
        ['Stealth',     `${String(s.browser?.stealth ?? '—')}`],
        ['Container Sizes', `${(s.containers?.sizes||[]).join(', ')||'—'}`],
        ['Container Types', `${(s.containers?.types||[]).join(', ')||'—'}`],
        ['Output Format',   `${s.output?.format || '—'}`],
        ['Output Dir',      `${s.output?.directory || '—'}`],
      ].map(([k, v]) => `  ${P.amberDb}${k.padEnd(20)}${_}  ${P.green}${v}${_}`)),
      '',
      `${P.dim}  Files: config/settings.json  ·  config/ports.json  ·  data/lines.txt${_}`,
    ];
    this._frame(cfg);
  }

  showHelp() {
    this.clear();
    const lines = [
      `${P.amber}  GSXR404  —  QUICK REFERENCE  ·  Shipping Schedule Aggregator  ·  v2024.01${_}`,
      `${rep(B.H, W+2)}`,
      '',
      `${P.green}  [1]  SINGLE ROUTE${_}`,
      `${P.amberDb}        ${B.AR}  ${dim('Define POL / POD → scrape carriers → view PDF')}`,
      `${P.dim}  ─────────────────────────────────────────────────────────────────${_}`,
      `${P.green}  [2]  BATCH MODE${_}`,
      `${P.amberDb}        ${B.AR}  ${dim('Sweep all configured routes · staggered · retry/backoff')}`,
      `${P.dim}  ─────────────────────────────────────────────────────────────────${_}`,
      `${P.green}  [3]  SHOW RESULTS${_}`,
      `${P.amberDb}        ${B.AR}  ${dim('Replay last scrape table (this session only)')}`,
      `${P.dim}  ─────────────────────────────────────────────────────────────────${_}`,
      `${P.green}  [4]  CONFIG VIEW${_}`,
      `${P.amberDb}        ${B.AR}  ${dim('View settings/ports/lines — edit with any text editor')}`,
      `${P.dim}  ─────────────────────────────────────────────────────────────────${_}`,
      `${P.green}  [Q]  EXIT${_}`,
      `${P.amberDb}        ${B.AR}  ${dim('Close stealth browser · flush log · exit cleanly')}`,
      '',
      `${P.dim}  TIP: POL/POD are auto-normalised  e.g.  ROT  RTM  ROTTERDAM  all map to ROTTERDAM${_}`,
    ];
    this._frame(lines);
  }

  // ── EXIT shutdown banner ───────────────────────────────────────────────────

  _quitBanner() {
    this.clear();
    setTimeout(() => {
      const { amber, amberDb, magenta, magenta: magenta_, red, green, gray, dim } = P;
      const bars = [
        `${amber}╔═╗╔═╗╔╦╗ ╦═╗ ╦╦═╗╔═╗${_}`,
        `${amberDb}╠═╝║ ║ ║║ ║╔╩╦╝║║ ║║ ║${_}`,
        `${magenta_} ╩ ╚═╝ ╩╝ ╩╩ ╚═╩╚═╝╚═╝${_}`,
      ];
      process.stdout.write(`\n\r${bars.join('\n\r')}\n\r`);
      process.stdout.write(`${dim}session terminated  —  ${this._uptime()} uptime  —  output in ./output${_}\n\r`);
    }, 100);
  }

  // ── misc helpers ──────────────────────────────────────────────────────────

  _uptime() {
    const s = process.uptime();
    const m = (s / 60) | 0,  h = (m / 60) | 0;
    return `${String(h).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  }

  _warn(msg) { process.stdout.write(`\r${P.red}${B.XMK}${_}  ${msg}\n`); }
  _ok(msg)   { process.stdout.write(`\r${P.gGreen}${B.CHK}${_}  ${msg}\n`); }

  close() { this.rl.close(); }
}

// ── Private helper: header banner (static) ───────────────────────────────────

TerminalUI.prototype._header = function () {
  return [
    `${P.amber}   ██╗  ██╗██╗   ██╗ ██████╗ ██╗██████╗  ██████╗ ██╗    ██╗  ██╗   ██╗${_}`,
    `${P.amberDb}  ██║  ██║██║   ██║██╔═══██╗██║██╔══██╗██╔═══██╗██║    ██║  ╚██╗ ██╔╝${_}`,
    `${P.amberDb}   ███████║██║   ██║██║   ██║██║██████╔╝██║   ██║██║ █╗ ██║   ╚████╔╝${_}`,
    `${P.amber}    ╚════██║╚██████╔╝╚██████╔╝██║██║  ██╗╚██████╔╝██║╚███╗██║    ╚═══╝${_}`,
  ];
};

// ══════════════════════════════════════════════════════════════════════════════
module.exports = { TerminalUI, P, B, rep, _: _ };
