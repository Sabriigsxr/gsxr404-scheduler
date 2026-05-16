const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

class PDFGenerator {
  constructor(configLoader) {
    this.config = configLoader.settings;
    this.pdfCfg = this.config?.pdf || {};
    this.pageCount = 0;
  }

  generate(recordsByCarrier, stats) {
    const width = 297;
    const height = 210;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const textCol = this.pdfCfg.textColor || '#00FF00';
    const fontFam = this.pdfCfg.fontFamily || 'Courier New';
    const fSize = this.pdfCfg.fontSize || 7;

    pdf.setFont(fontFam, 'normal');
    pdf.setTextColor(textCol);

    let yPos = 10;
    const LH = fSize + 2;
    const pageH = 180;
    const LM = this.pdfCfg.marginLeft || 15;
    const RM = this.pdfCfg.marginRight || 15;
    const availW = width - LM - RM;
    const colW = availW / 9;

    const cols = [
      { label: 'CARR', w: colW * 1.5 },
      { label: 'VESSEL', w: colW * 2.5 },
      { label: 'IMO', w: colW * 1 },
      { label: 'VOYAGE', w: colW * 1 },
      { label: 'POL', w: colW * 1.2 },
      { label: 'POD', w: colW * 1.2 },
      { label: 'ETD', w: colW * 0.9 },
      { label: 'ETA', w: colW * 0.9 },
      { label: 'TT', w: colW * 0.8 }
    ];

    const drawHeader = () => {
      pdf.setFontSize(fSize + 1);
      const title = 'GSXR404 — MARITIME SCHEDULES';
      pdf.text(title, LM, yPos);
      yPos += LH;

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const totalRecs = Object.values(recordsByCarrier).reduce((a, b) => a + b.length, 0);
      const meta = `Generated: ${nowStr} | Carriers: ${Object.keys(recordsByCarrier).length} | Voyages: ${totalRecs}`;
      pdf.setFontSize(fSize);
      pdf.text(meta, LM, yPos);
      yPos += LH;

      pdf.setFontSize(fSize);
      pdf.setDrawColor(26, 26, 26);
      pdf.setFillColor(1, 1, 1);
      pdf.setLineWidth(0.2);
    };

    drawHeader();

    for (const [carrierName, voyages] of Object.entries(recordsByCarrier) || []) {
      for (const voyage of voyages || []) {
        if (yPos > pageH) {
          pdf.addPage();
          this.pageCount++;
          pdf.setPage(this.pageCount + 1);
          yPos = 10;
          pdf.setFontSize(fSize);
          pdf.setFont(fontFam, 'normal');
          pdf.setTextColor(textCol);
        }

        const trData = [
          voyage.carrierDisplayName || '',
          (voyage.vesselName || '').slice(0, 30),
          voyage.imo || '',
          (voyage.voyageNo || '').slice(0, 15),
          (voyage.pol || voyage.pol || '').slice(0, 12),
          (voyage.pod || voyage.pod || '').slice(0, 12),
          voyage.etd || '',
          voyage.eta || '',
          String(voyage.transitTime || voyage.transitTime || '')
        ];

        let xOff = LM;
        cols.forEach((col, i) => {
          pdf.setDrawColor(26, 26, 26);
          pdf.setFillColor(26, 26, 26);
          pdf.rect(xOff - 1, yPos - (fSize / 3.5), col.w + 1, fSize * 0.7, 'FD');
          pdf.setFillColor(0, 255, 0);
          pdf.setTextColor(0, 255, 0);
          pdf.text(trData[i] || '', xOff, yPos);
          xOff += col.w;
        });
        yPos += LH;
      }
    }

    pdf.setFontSize(fSize - 2);
    const footer = this.pdfCfg.footer || 'CONFIDENTIAL — GSXR404 OUTPUT';
    pdf.setTextColor(0, 100, 0);
    pdf.text(footer, LM, height - 10);

    const ts = this.config?.output?.includeTimestamp !== false
      ? (new Date()).toISOString().replace(/[:.]/g, '-')
      : 'manual';
    const outDir = this.config?.output?.directory || './output';
    const dirPath = path.resolve(path.join(__dirname, '..', outDir));
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    const fname = `gsxr404_schedule_${ts}.pdf`;
    const fpath = path.join(dirPath, fname);
    fs.writeFileSync(fpath, pdf.output('arraybuffer'));
    return fpath;
  }
}

module.exports = PDFGenerator;
