import dotenv from 'dotenv';
dotenv.config(); // Must load BEFORE importing the api handler!

async function run() {
  const { default: handler } = await import('../api/create-reservation.ts');

  const req = {
    method: 'POST',
    body: {
      checkIn: "2026-03-20",
      checkOut: "2026-03-21",
      rooms: [{ name: "LOFT", priceSnapshot: 1310 }],
      mainGuest: {
        name: "geraldo barros teste 1",
        cpf: "52608735215",
        phone: "telefone é esse que estou falando com vc",
        email: "geraldo@hotelsolar.tur.br"
      },
      additionalGuests: [
        { name: "luiza barros", cpf: "52608735215" }
      ],
      totalPrice: 1310,
      observations: "",
      paymentMethod: "PIX"
    }
  };

  const res = {
    setHeader: (k: string, v: string) => console.log('SetHeader', k, v),
    status: (code: number) => {
      console.log('Status', code);
      return {
        json: (data: any) => console.log('JSON', JSON.stringify(data, null, 2)),
        end: () => console.log('End')
      };
    }
  };

  try {
    await handler(req as any, res as any);
  } catch (error) {
    console.error('Unhandled Rejection Caught Locally:', error);
  }
}

run();
