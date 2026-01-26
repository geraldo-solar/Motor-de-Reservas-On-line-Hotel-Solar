
export interface RoomDateOverride {
  dateIso: string;
  price?: number;
  availableQuantity?: number;
  noCheckIn?: boolean;
  noCheckOut?: boolean;
  isClosed?: boolean;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  price: number;
  capacity: number;
  imageUrls: string[];
  address?: string;
  features: string[];
  totalQuantity: number;
  active: boolean;
  overrides?: RoomDateOverride[];
  inventory?: { [dateIso: string]: number };
  defaultInventory?: number;
}

export interface HolidayPackage {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  location?: string;
  includes: string[];
  benefits?: string[]; // Benefícios inclusos no pacote
  active: boolean;
  startIsoDate: string;
  endIsoDate: string;
  roomPrices: { roomId: string; price: number }[];
  noCheckoutDates: string[];
  noCheckInDates: string[];
  fullPeriodDiscountPct?: number;
  category?: 'SPECIAL' | 'JULY';
  isPromotional?: boolean;
}

export interface ExtraService {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
}

export interface DiscountCode {
  code: string;
  percentage: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
  minNights?: number;
  fullPeriodRequired?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum ViewState {
  HOME = 'HOME',
  ROOMS = 'ROOMS',
  PACKAGES = 'PACKAGES',
  BOOKING = 'BOOKING',
  ADMIN = 'ADMIN',
  SUCCESS = 'SUCCESS',
  REGULAMENTO = 'REGULAMENTO',
  CANCELAMENTO = 'CANCELAMENTO',
  PRE_CHECKIN = 'PRE_CHECKIN'
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface HotelConfig {
  minStay: number;
  contactEmail: string;
  aiKnowledgeBase: string;
  emailTemplates: EmailTemplate[];
  whatsappNumber?: string;
  notificationEmail?: string;
  allowOnlineBooking?: boolean;
  minBookingLeadTimeHours?: number;
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

export interface ReservationGuest {
  name: string;
  cpf: string;
  age?: string;
  email?: string;
  phone?: string;
}

export interface Reservation {
  id: string;
  createdAt: Date;
  checkIn: string;
  checkOut: string;
  nights: number;
  mainGuest: ReservationGuest;
  additionalGuests: ReservationGuest[];
  observations: string;
  rooms: { id: string; name: string; priceSnapshot: number }[];
  extras: { name: string; quantity: number; priceSnapshot: number }[];
  totalPrice: number;
  discountApplied?: { code: string; amount: number };
  packageDiscountApplied?: { percentage: number; amount: number };
  paymentMethod: 'PIX' | 'CREDIT_CARD';
  cardDetails?: {
    holderName: string;
    number: string;
    expiry: string;
    cvv: string;
    installments: number;
  };
  status: ReservationStatus;
  cancellationReason?: string;
}