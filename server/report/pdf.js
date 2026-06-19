'use strict';
const { renderReportHTML } = require('./render');

let _browser = null;
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return _browser;
}

// Returns a Buffer with the A4 PDF for the given assessment ({ state, meta, created_at }).
async function generatePDF(assessment) {
  const html = renderReportHTML(assessment);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    });
    return pdf;
  } finally {
    await page.close();
  }
}

async function closeBrowser() { if (_browser) { await _browser.close().catch(() => {}); _browser = null; } }

module.exports = { generatePDF, renderReportHTML, closeBrowser };
