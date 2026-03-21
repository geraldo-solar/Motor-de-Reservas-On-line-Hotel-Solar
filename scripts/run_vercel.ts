import handler from '../api/create-reservation.ts';
import dotenv from 'dotenv';
dotenv.config();

const req = {
  method: 'POST',
  body: {
    "checkIn": "2026-03-20",
    "checkOut": "2026-03-21",
    "rooms": [{"name": "LOFT", "priceSnapshot": 1310}],
    "mainGuest": {
      "name": "geraldo barros teste 1",
      "cpf": "52608735215",
      "phone": "telefone é esse",
      "email": "geraldo@hotelsolar.tur.br"
    },
    "additionalGuests": [
      {"name": "luiza barros", "cpf": "52608735215"}
    ],
    "totalPrice": 1310,
    "observations": "",
    "paymentMethod": "PIX"
  }
} as any;

const res = {
  setHeader: () => {},
  status: (code: number) => {
    console.log("STATUS:", code);
    return {
      json: (data: any) => console.log("JSON:", JSON.stringify(data, null, 2)),
      end: () => console.log("END")
    }
  }
} as any;

async function run() {
  try {
    await handler(req, res);
  } catch(e) {
    console.error("FATAL CRASH:", e);
  }
}

run();
