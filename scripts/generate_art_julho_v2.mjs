import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const htmlPath = 'file:///tmp/arte-julho-meio-semana-v2.html';

(async () => {
    console.log("Iniciando Puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({
        width: 1080,
        height: 1350,
        deviceScaleFactor: 2,
    });
    
    await page.goto(htmlPath, {waitUntil: 'networkidle0'});
    
    const outPath = '/Users/geraldobarros/Documents/Motor de Reservas/arte-julho-meio-semana-v2.png';
    await page.screenshot({ path: outPath, clip: {x: 0, y: 0, width: 1080, height: 1350} });
    
    await browser.close();
    console.log("Arte gerada em:", outPath);
})();
