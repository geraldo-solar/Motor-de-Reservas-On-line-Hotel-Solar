import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const outDir = '/Users/geraldobarros/Documents/Motor de Reservas';

const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1350, initial-scale=1.0">
    <title>Arte Namorados</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0; padding: 0; width: 1080px; height: 1350px;
            font-family: 'Inter', sans-serif;
            background-image: url('file://${outDir}/public/namorados-premium.jpg');
            background-size: cover; background-position: center;
        }
        .overlay {
            width: 1080px; height: 1350px;
            background: linear-gradient(to bottom, rgba(50, 0, 10, 0.40) 0%, rgba(30, 0, 10, 0.95) 100%);
            display: flex; flex-direction: column; align-items: center;
            padding: 60px 80px; box-sizing: border-box; color: #ffffff;
        }
        .logo { width: 220px; margin-bottom: 20px; }
        .title {
            font-family: 'Cinzel', serif; font-size: 52px; color: #E5A9A9;
            text-align: center; margin-bottom: 15px; letter-spacing: 2px; text-transform: uppercase;
        }
        .subtitle {
            font-size: 26px; line-height: 1.6; text-align: center; font-weight: 300;
            margin-bottom: 50px; color: #fff; max-width: 800px; background: rgba(0,0,0,0.5);
            padding: 10px 30px; border-radius: 50px; border: 1px solid rgba(229, 169, 169, 0.3);
        }
        .pricing-container { display: flex; width: 100%; justify-content: center; }
        .pricing-column {
            width: 650px; background: rgba(229, 169, 169, 0.1); border: 2px solid rgba(229, 169, 169, 0.8);
            border-radius: 16px; padding: 40px; box-shadow: 0 0 40px rgba(229, 169, 169, 0.2);
            backdrop-filter: blur(10px);
        }
        .col-title {
            font-family: 'Cinzel', serif; font-size: 28px; color: #5a0000; background-color: #E5A9A9;
            margin-bottom: 30px; border-radius: 8px; padding: 15px; margin-top: -60px;
            margin-left: -20px; margin-right: -20px; box-shadow: 0 10px 20px rgba(0,0,0,0.3); text-align: center;
            font-weight: 600; text-transform: uppercase;
        }
        .price-item {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 25px; font-size: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;
        }
        .price-item:last-child { margin-bottom: 0; border-bottom: none; }
        .room-name { font-weight: 300; color: #f0f0f0; }
        .room-price { font-weight: 600; color: #E5A9A9; font-size: 30px; }
        .footer { margin-top: auto; font-size: 16px; color: #aaa; letter-spacing: 1px; text-transform: uppercase; }
        .benefits { margin-top: 35px; font-size: 22px; text-align: center; color: #E5A9A9; font-weight: 400; }
    </style>
</head>
<body>
    <div class="overlay">
        <img src="file://${outDir}/public/logo-white.png" alt="Hotel Solar" class="logo">
        <div class="title">FINAL DE SEMANA DOS NAMORADOS</div>
        <div class="subtitle">12 a 14 de Junho de 2026 (2 Noites)</div>
        <div class="pricing-container">
            <div class="pricing-column">
                <div class="col-title">PACOTE ROMÂNTICO</div>
                <div class="price-item"><span class="room-name">Suíte Casal</span><span class="room-price">R$ 1.100</span></div>
                <div class="price-item"><span class="room-name">Suíte Triplo</span><span class="room-price">R$ 1.280</span></div>
                <div class="price-item"><span class="room-name">Suíte Quádruplo</span><span class="room-price">R$ 1.470</span></div>
                <div class="price-item"><span class="room-name">Suíte Sacada Vista Mar</span><span class="room-price">R$ 1.470</span></div>
                <div class="price-item"><span class="room-name">Suíte Varanda Térreo</span><span class="room-price">R$ 1.670</span></div>
                <div class="price-item"><span class="room-name">LOFT</span><span class="room-price">R$ 2.640</span></div>
            </div>
        </div>
        <div class="benefits">❤️ Jantar Especial dos Namorados • Momentos a dois inesquecíveis ❤️</div>
        <div class="footer">www.hotelsolar.tur.br | @hotelsolar</div>
    </div>
</body>
</html>
`;

(async () => {
    console.log("Iniciando Puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
    
    const tempPath = path.resolve('/tmp', 'temp_art_namorados.html');
    fs.writeFileSync(tempPath, html);
    
    await page.goto(`file://${tempPath}`, {waitUntil: 'networkidle0'});
    const outPath = path.resolve(outDir, 'arte-namorados-2026.png');
    await page.screenshot({ path: outPath, clip: {x: 0, y: 0, width: 1080, height: 1350} });
    console.log(`Arte gerada: ${outPath}`);
    
    await browser.close();
})();
