
import { Room, HolidayPackage, DiscountCode, HotelConfig, ExtraService, Reservation } from './types';

export const ADMIN_CREDENTIALS = {
  email: 'geraldo@hotelsolar.tur.br',
  password: 'metron82'
};

const DEFAULT_HOTEL_INFO = `
Nome: Hotel Solar
Localização: Praia do Sol, Bahia, Brasil.
Descrição: Um refúgio paradisíaco de frente para o mar, focado em sustentabilidade, conforto e sol o ano todo.
Comodidades Gerais: Piscina infinita, acesso direto à praia, Spa Solar, Restaurante Gastronômico, Wi-Fi gratuito de alta velocidade, Bar molhado.
Políticas: Check-in 14h, Check-out 12h. Cancelamento grátis até 48h antes.
Café da manhã: Incluso em todas as diárias, servido das 07h às 10h.
Estacionamento: Gratuito e monitorado 24h.
Pet Friendly: Sim, aceitamos pets de pequeno porte (taxa extra de R$ 50/dia).
`;

export const INITIAL_CONFIG: HotelConfig = {
  minStay: 2,
  contactEmail: 'reservas@hotelsolar.tur.br',
  aiKnowledgeBase: DEFAULT_HOTEL_INFO,
  emailTemplates: [
    {
      id: 'confirmation',
      name: 'Confirmação de Reserva',
      subject: 'Reserva Confirmada - Hotel Solar (Protocolo {{id_reserva}})',
      body: 'Olá, {{nome_hospede}}!\n\nÉ um prazer confirmar sua reserva no Hotel Solar.\n\nDetalhes:\nCheck-in: {{data_checkin}}\nCheck-out: {{data_checkout}}\nValor Total: {{valor_total}}\n\nEstamos ansiosos para recebê-lo!'
    },
    {
      id: 'cancellation',
      name: 'Cancelamento de Reserva',
      subject: 'Atualização de Reserva - Cancelamento (Protocolo {{id_reserva}})',
      body: 'Olá, {{nome_hospede}}.\n\nInformamos que sua reserva {{id_reserva}} foi cancelada conforme solicitado ou por falta de pagamento.\n\nEsperamos vê-lo em uma próxima oportunidade.'
    },
    {
      id: 'pix_received',
      name: 'Pagamento Recebido (PIX)',
      subject: 'Pagamento Confirmado - Hotel Solar',
      body: 'Olá, {{nome_hospede}}!\n\nRecebemos o seu pagamento via PIX referente à reserva {{id_reserva}}.\n\nSua estadia está garantida!'
    }
  ],
  whatsappNumber: '557399999999',
  notificationEmail: 'reservas@hotelsolar.tur.br',
  allowOnlineBooking: true,
  minBookingLeadTimeHours: 24
};

export const INITIAL_EXTRAS: ExtraService[] = [
  {
    id: 'lua-de-mel',
    name: 'Kit Lua de Mel',
    description: 'Decoração romântica com pétalas, espumante gelado e morangos.',
    price: 350,
    imageUrl: 'https://images.unsplash.com/photo-1544124499-58912cbddaad?q=80&w=600',
    active: true
  },
  {
    id: 'mesa-posta',
    name: 'Mesa Posta Tropical',
    description: 'Montagem exclusiva para jantar na varanda.',
    price: 180,
    imageUrl: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?q=80&w=600',
    active: true
  }
];

export const INITIAL_ROOMS: Room[] = [
  {
    id: 'casal',
    name: 'Suíte Casal Standard',
    description: 'Aconchego e privacidade ideal para casais. Vista para o jardim interno.',
    price: 0,
    capacity: 2,
    imageUrls: ['https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=800'],
    features: ['Cama Queen', 'Ar Condicionado', 'Smart TV', 'Frigobar'],
    totalQuantity: 0,
    active: true,
    overrides: []
  },
  {
    id: 'sacada-mar',
    name: 'Suíte Sacada Vista Mar',
    description: 'Acorde com a brisa do oceano e uma vista deslumbrante diretamente da sua sacada.',
    price: 0,
    capacity: 2,
    imageUrls: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=800'],
    features: ['Vista Mar Frontal', 'Varanda Privativa', 'Rede de Descanso', 'Cafeteira'],
    totalQuantity: 0,
    active: true,
    overrides: []
  },
  {
    id: 'varanda-terreo',
    name: 'Suíte Varanda Térreo',
    description: 'Acomodação prática e confortável no térreo, com varanda privativa e fácil acesso às áreas comuns.',
    price: 550,
    capacity: 3,
    imageUrls: ['https://images.unsplash.com/photo-1578683010236-d716f9a3f461?q=80&w=800'],
    features: ['Varanda Térrea', 'Fácil Acesso', 'Ar Condicionado', 'Rede de Descanso', 'Smart TV'],
    totalQuantity: 4,
    active: true,
    overrides: []
  },
  {
    id: 'quadruplo',
    name: 'Suíte Família Quádrupla',
    description: 'Amplo espaço para acomodar toda a família com conforto e praticidade.',
    price: 0,
    capacity: 4,
    imageUrls: ['https://images.unsplash.com/photo-1566665797739-1674de7a421a?q=80&w=800'],
    features: ['2 Camas Casal', 'Ar Condicionado', 'Armários Amplos', 'Cozinha Compacta'],
    totalQuantity: 0,
    active: true,
    overrides: []
  },
  {
    id: 'loft',
    name: 'LOFT Exclusivo Solar',
    description: 'Sofisticação e design moderno com pé direito alto. Vista panorâmica da praia.',
    price: 0,
    capacity: 4,
    imageUrls: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=800'],
    features: ['Design Duplex', 'Sala de Estar', 'Cozinha Completa', 'Hidromassagem'],
    totalQuantity: 0,
    active: true,
    overrides: []
  }
];

export const INITIAL_PACKAGES: HolidayPackage[] = [
  {
    id: 'carnaval-2025',
    name: 'Pacote Carnaval 2025',
    description: '5 dias de festa e relaxamento com café da manhã e transfer.',
    imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=800',
    includes: ['Café da Manhã Premium', 'Transfer In/Out', 'Brinde Especial de Carnaval'],
    active: true,
    startIsoDate: '2025-02-28',
    endIsoDate: '2025-03-05',
    roomPrices: [
      { roomId: 'casal', price: 0 },
      { roomId: 'sacada-mar', price: 0 },
      { roomId: 'loft', price: 0 }
    ],
    noCheckoutDates: [],
    noCheckInDates: []
  }
];

export const INITIAL_DISCOUNTS: DiscountCode[] = [
  {
    code: 'SOLAR10',
    percentage: 10,
    active: true
  }
];

export const INITIAL_RESERVATIONS: Reservation[] = [];
