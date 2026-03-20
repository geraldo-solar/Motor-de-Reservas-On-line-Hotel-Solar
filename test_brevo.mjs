import dotenv from 'dotenv';

dotenv.config({ path: '/Users/geraldobarros/Documents/Motor de Reservas/.env' });

const HOTEL_CONFIG = {
  name: 'Hotel Solar',
  email: 'geraldo@hotelsolar.tur.br',
  adminEmail: 'reserva@hotelsolar.tur.br'
};

const apiKey = process.env.VITE_BREVO_API_KEY;

async function run() {
  const emailPromise = fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
      to: [{ email: 'geraldo@hotelsolar.tur.br', name: 'Geraldo Barros' }],
      subject: `Teste Simulado`,
      htmlContent: `<p>Teste Vercel Node Env</p>`,
    }),
  });

  const res = await emailPromise;
  const text = await res.text();
  console.log('Brevo Response Status:', res.status);
  console.log('Brevo Response Text:', text);
}

run();
