import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const outDir = '/Users/geraldobarros/Documents/Motor de Reservas';

const packages = [
    {
        id: '1',
        title: 'Celebração Solar',
        dates: '02 a 05/07 (3 Noites - Abertura & Aniversário)',
        bg: 'celebracao-solar-afonso.png',
        prices: [
            { n: 'Suíte Casal', v: 'R$ 2.422' },
            { n: 'Suíte Triplo', v: 'R$ 2.686' },
            { n: 'Suíte Sacada Vista Mar', v: 'R$ 3.080' },
            { n: 'Suíte Quádruplo', v: 'R$ 3.080' },
            { n: 'Suíte Varanda Térreo', v: 'R$ 3.521' },
            { n: 'LOFT', v: 'R$ 4.125' },
        ]
    },
    {
        id: '2',
        title: 'Solarize-se',
        dates: '09 a 12/07 (3 Noites - O Verão de Salinas)',
        bg: 'solarize-se-premium-final.jpg',
        prices: [
            { n: 'Suíte Casal', v: 'R$ 3.990' },
            { n: 'Suíte Triplo', v: 'R$ 4.490' },
            { n: 'Suíte Sacada Vista Mar', v: 'R$ 5.150' },
            { n: 'Suíte Quádruplo', v: 'R$ 5.349' },
            { n: 'Suíte Varanda Térreo', v: 'R$ 5.949' },
            { n: 'LOFT', v: 'R$ 6.450' },
        ]
    },
    {
        id: '3',
        title: 'Auge do Verão I',
        dates: '16 a 19/07 (3 Noites - Alta Temporada)',
        bg: 'auge-verao-parte-1-premium.jpg',
        prices: [
            { n: 'Suíte Casal', v: 'R$ 4.089' },
            { n: 'Suíte Triplo', v: 'R$ 4.650' },
            { n: 'Suíte Sacada Vista Mar', v: 'R$ 5.390' },
            { n: 'Suíte Quádruplo', v: 'R$ 5.550' },
            { n: 'Suíte Varanda Térreo', v: 'R$ 6.189' },
            { n: 'LOFT', v: 'R$ 6.789' },
        ]
    },
    {
        id: '4',
        title: 'Auge do Verão II',
        dates: '23 a 26/07 (3 Noites - Peak Season)',
        bg: 'auge-verao-parte-2-premium.jpg',
        prices: [
            { n: 'Suíte Casal', v: 'R$ 4.209' },
            { n: 'Suíte Triplo', v: 'R$ 4.790' },
            { n: 'Suíte Sacada Vista Mar', v: 'R$ 5.550' },
            { n: 'Suíte Quádruplo', v: 'R$ 5.720' },
            { n: 'Suíte Varanda Térreo', v: 'R$ 6.380' },
            { n: 'LOFT', v: 'R$ 6.990' },
        ]
    },
    {
        id: '5',
        title: 'Bye Bye July',
        dates: '30/07 a 02/08 (3 Noites - A Saideira)',
        bg: 'bye-bye-july-final.jpg',
        prices: [
            { n: 'Suíte Casal', v: 'R$ 1.815' },
            { n: 'Suíte Triplo', v: 'R$ 2.112' },
            { n: 'Suíte Sacada Vista Mar', v: 'R$ 2.427' },
            { n: 'Suíte Quádruplo', v: 'R$ 2.427' },
            { n: 'Suíte Varanda Térreo', v: 'R$ 2.757' },
            { n: 'LOFT', v: 'R$ 3.993' },
        ]
    }
];

const generateHtml = (pkg) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1350, initial-scale=1.0">
    <title>Arte Diárias Julho</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0; padding: 0; width: 1080px; height: 1350px;
            font-family: 'Inter', sans-serif;
            background-image: url('file://${outDir}/public/${pkg.bg}');
            background-size: cover; background-position: center;
        }
        .overlay {
            width: 1080px; height: 1350px;
            background: linear-gradient(to bottom, rgba(10, 25, 20, 0.40) 0%, rgba(10, 25, 20, 0.95) 100%);
            display: flex; flex-direction: column; align-items: center;
            padding: 60px 80px; box-sizing: border-box; color: #ffffff;
        }
        .logo { width: 200px; margin-bottom: 20px; }
        .title {
            font-family: 'Cinzel', serif; font-size: 52px; color: #D4AF37;
            text-align: center; margin-bottom: 15px; letter-spacing: 2px; text-transform: uppercase;
        }
        .subtitle {
            font-size: 26px; line-height: 1.6; text-align: center; font-weight: 300;
            margin-bottom: 50px; color: #fff; max-width: 800px; background: rgba(0,0,0,0.4);
            padding: 10px 30px; border-radius: 50px; border: 1px solid rgba(212, 175, 55, 0.3);
        }
        .pricing-container { display: flex; width: 100%; justify-content: center; }
        .pricing-column {
            width: 650px; background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.8);
            border-radius: 16px; padding: 40px; box-shadow: 0 0 30px rgba(212, 175, 55, 0.15);
            backdrop-filter: blur(10px);
        }
        .col-title {
            font-family: 'Cinzel', serif; font-size: 28px; color: #fff; background-color: #D4AF37;
            margin-bottom: 30px; border-radius: 8px; padding: 15px; margin-top: -60px;
            margin-left: -20px; margin-right: -20px; box-shadow: 0 10px 20px rgba(0,0,0,0.3); text-align: center;
        }
        .price-item {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 25px; font-size: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;
        }
        .price-item:last-child { margin-bottom: 0; border-bottom: none; }
        .room-name { font-weight: 300; color: #f0f0f0; }
        .room-price { font-weight: 600; color: #ffffff; font-size: 30px; }
        .footer { margin-top: auto; font-size: 16px; color: #888; letter-spacing: 1px; text-transform: uppercase; }
        .benefits { margin-top: 35px; font-size: 22px; text-align: center; color: #D4AF37; font-weight: 400; }
    </style>
</head>
<body>
    <div class="overlay">
        <img src="file://${outDir}/public/logo-gold.png" alt="Hotel Solar" class="logo">
        <div class="title">${pkg.title}</div>
        <div class="subtitle">${pkg.dates}</div>
        <div class="pricing-container">
            <div class="pricing-column">
                <div class="col-title">PACOTE FINAL DE SEMANA</div>
                ${pkg.prices.map(p => `
                <div class="price-item">
                    <span class="room-name">${p.n}</span>
                    <span class="room-price">${p.v}</span>
                </div>
                `).join('')}
            </div>
        </div>
        <div class="benefits">✨ Programação Exclusiva + Experiências Gastronômicas ✨</div>
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
    
    for (const pkg of packages) {
        const html = generateHtml(pkg);
        const tempPath = path.resolve('/tmp', `temp_art_${pkg.id}.html`);
        fs.writeFileSync(tempPath, html);
        
        await page.goto(`file://${tempPath}`, {waitUntil: 'networkidle0'});
        const outPath = path.resolve(outDir, `arte-julho-fds-${pkg.id}.png`);
        await page.screenshot({ path: outPath, clip: {x: 0, y: 0, width: 1080, height: 1350} });
        console.log(`Arte gerada: ${outPath}`);
    }
    
    await browser.close();
    console.log("Todas as artes concluídas!");
})();
