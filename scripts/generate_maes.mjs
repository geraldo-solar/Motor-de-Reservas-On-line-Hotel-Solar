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
    <title>Arte Dia das Mães</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0; padding: 0; width: 1080px; height: 1350px;
            font-family: 'Inter', sans-serif;
            background-image: url('file://${outDir}/public/semana-da-familia-premium.jpg');
            background-size: cover; background-position: center;
        }
        .overlay {
            width: 1080px; height: 1350px;
            background: linear-gradient(to bottom, rgba(50, 20, 30, 0.40) 0%, rgba(50, 20, 30, 0.95) 100%);
            display: flex; flex-direction: column; align-items: center;
            padding: 60px 80px; box-sizing: border-box; color: #ffffff;
        }
        .logo { width: 220px; margin-bottom: 20px; }
        .title {
            font-family: 'Cinzel', serif; font-size: 52px; color: #FFB6C1;
            text-align: center; margin-bottom: 15px; letter-spacing: 2px; text-transform: uppercase;
        }
        .subtitle {
            font-size: 26px; line-height: 1.6; text-align: center; font-weight: 300;
            margin-bottom: 40px; color: #fff; max-width: 800px; background: rgba(0,0,0,0.5);
            padding: 10px 30px; border-radius: 50px; border: 1px solid rgba(255, 182, 193, 0.3);
        }
        .pricing-container { display: flex; width: 100%; justify-content: center; }
        .pricing-column {
            width: 650px; background: rgba(255, 182, 193, 0.1); border: 2px solid rgba(255, 182, 193, 0.8);
            border-radius: 16px; padding: 40px; box-shadow: 0 0 40px rgba(255, 182, 193, 0.2);
            backdrop-filter: blur(10px);
        }
        .col-title {
            font-family: 'Cinzel', serif; font-size: 28px; color: #5a0a1a; background-color: #FFB6C1;
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
        .room-price { font-weight: 600; color: #FFB6C1; font-size: 30px; }
        .footer { margin-top: auto; font-size: 16px; color: #aaa; letter-spacing: 1px; text-transform: uppercase; }
        .benefits-banner {
            margin-top: 40px; background: rgba(255, 182, 193, 0.15);
            border: 1px dashed #FFB6C1; border-radius: 12px; padding: 20px 40px;
            text-align: center; width: 100%; display: flex; flex-direction: column; gap: 10px;
            max-width: 650px;
        }
        .benefits-title { color: #FFB6C1; font-size: 24px; font-family: 'Cinzel', serif; letter-spacing: 1px; }
        .benefits-text { color: #fff; font-size: 18px; font-weight: 300; }
        .highlight { color: #FFB6C1; font-weight: 600; }
    </style>
</head>
<body>
    <div class="overlay">
        <img src="file://${outDir}/public/logo-white.png" alt="Hotel Solar" class="logo">
        <div class="title">FINAL DE SEMANA DAS MÃES</div>
        <div class="subtitle">08 a 10 de Maio de 2026 (2 Noites)</div>
        <div class="pricing-container">
            <div class="pricing-column">
                <div class="col-title">PACOTE 2 DIÁRIAS (COMPLETO)</div>
                <div class="price-item"><span class="room-name">Suíte Casal</span><span class="room-price">R$ 1.100</span></div>
                <div class="price-item"><span class="room-name">Suíte Triplo</span><span class="room-price">R$ 1.280</span></div>
                <div class="price-item"><span class="room-name">Suíte Quádruplo</span><span class="room-price">R$ 1.470</span></div>
                <div class="price-item"><span class="room-name">Suíte Sacada Vista Mar</span><span class="room-price">R$ 1.470</span></div>
                <div class="price-item"><span class="room-name">Suíte Varanda Térreo</span><span class="room-price">R$ 1.670</span></div>
                <div class="price-item"><span class="room-name">LOFT</span><span class="room-price">R$ 2.640</span></div>
            </div>
        </div>
        <div class="benefits-banner">
            <div class="benefits-title">✨ PROGRAMAÇÃO DO FINAL DE SEMANA ✨</div>
            <div class="benefits-text">
                Aproveite nosso farto <span class="highlight">Café da Manhã Exclusivo</span> no Domingo (Incluso) e, mediante reserva, encante-se com nosso <span class="highlight">Jantar Especial Temático</span> de Sábado!
            </div>
        </div>
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
    
    const tempPath = path.resolve('/tmp', 'temp_art_maes.html');
    fs.writeFileSync(tempPath, html);
    
    await page.goto(`file://${tempPath}`, {waitUntil: 'networkidle0'});
    const outPath = path.resolve(outDir, 'arte-dia-das-maes.png');
    await page.screenshot({ path: outPath, clip: {x: 0, y: 0, width: 1080, height: 1350} });
    console.log(`Arte gerada: ${outPath}`);
    
    await browser.close();
})();
