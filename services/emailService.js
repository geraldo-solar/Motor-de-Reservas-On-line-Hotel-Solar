"use strict";
// Serviço de envio de e-mails via Brevo (Sendinblue)
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPreCheckinAdminEmail = exports.getShortReservationId = exports.sendClientCancellationEmails = exports.sendReservationCanceledEmail = exports.sendPaymentConfirmedEmail = exports.sendPreCheckInEmail = exports.syncContactToBrevo = exports.sendReservationEmails = exports.generateHotelEmailHTML = exports.generateClientEmailHTML = exports.HOTEL_CONFIG = void 0;
var dateUtils_1 = require("../utils/dateUtils");
// --- MUDANÇA: WHATSAPP REMOVIDO TEMPORARIAMENTE ---
// --- NOTIFICAÇÃO PARA O HOTEL (MANTIDA via EMAIL) ---
// API Key agora é gerenciada no Serverless Function (/api/send-email)
// Não expomos mais a chave no cliente.
// Configurações do Hotel
exports.HOTEL_CONFIG = {
    name: 'Hotel Solar',
    email: 'geraldo@hotelsolar.tur.br',
    adminEmail: 'reserva@hotelsolar.tur.br',
    phone: '(91) 98100-0800',
    address: 'Belém, PA',
    logoUrl: 'https://motor-de-reservas-on-line-hotel-sol.vercel.app/logo-gold.png',
    regulamentoUrl: 'https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=regulamento',
    erpUrl: 'https://hotel-solar-erp.vercel.app', // URL do ERP para o pré-check-in
    // Dados PIX
    pix: {
        chave: '(91) 98100-0800',
        beneficiario: 'J Ramos Barros Hotelaria e Eventos Me',
        cnpj: '09.519.659/0001-90',
        banco: 'Caixa Econômica Federal',
        agencia: '3632',
        conta: '386-6',
        operacao: '003'
    }
};
// Formatar data para exibição sem erro de fuso horário
// Formatar valor em reais
var formatCurrency = function (value) {
    if (value === undefined || value === null)
        return 'R$ 0,00';
    var num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num))
        return 'R$ 0,00';
    return "R$ ".concat(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), " ");
};
// Gerar número da reserva curto (8 caracteres) - funciona com UUID ou RES-xxx
var getShortReservationId = function (id) {
    // Remove prefixo RES- se existir, remove hífens do UUID, e pega os primeiros 8 caracteres
    return id.replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();
};
exports.getShortReservationId = getShortReservationId;
// Template de e-mail para o cliente
var generateClientEmailHTML = function (reservation) {
    var _a;
    var shortId = getShortReservationId(reservation.id);
    var isPix = reservation.paymentMethod === 'PIX';
    // Gerar lista de acomodações
    var roomsHTML = reservation.rooms.map(function (room) {
        return "\n      <li style=\"margin-bottom: 8px;\">\n        <strong style=\"color: #1a3c34;\">".concat(room.name, "</strong> - ").concat(formatCurrency(room.priceSnapshot), "\n      </li>\n    ");
    }).join('');
    // Gerar lista de extras
    var extrasHTML = reservation.extras.length > 0
        ? reservation.extras.map(function (extra) { return "\n      <li style=\"margin-bottom: 4px;\">\n        ".concat(extra.name, " (").concat(extra.quantity, "x) - ").concat(formatCurrency(extra.priceSnapshot * extra.quantity), "\n      </li>\n  "); }).join('')
        : '<li style="color: #666;">Nenhum serviço extra</li>';
    // Agrupar acompanhantes por Quarto
    var guestsHTML = '<li style="color: #666;">Apenas o titular da reserva</li>';
    if (reservation.additionalGuests && reservation.additionalGuests.length > 0) {
        // Pegar nomes únicos dos quartos
        var uniqueRooms = Array.from(new Set(reservation.additionalGuests.map(function (g) { return g.roomName; })));
        guestsHTML = uniqueRooms.map(function (roomName) {
            var gInRoom = reservation.additionalGuests.filter(function (g) { return g.roomName === roomName; });
            var listItems = gInRoom.map(function (guest) { return "\n        <li style=\"margin-bottom: 4px;\">\n          <strong style=\"color: #1a3c34;\">".concat(guest.name, "</strong> - <span style=\"font-size: 13px; color: #64748b;\">").concat(guest.age, "</span>\n        </li>\n      "); }).join('');
            return "\n        <div style=\"margin-bottom: 12px;\">\n          <h4 style=\"color: #1a3c34; margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; font-weight: bold;\">Na ".concat(roomName, "</h4>\n          <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n            ").concat(listItems, "\n          </ul>\n        </div>\n      ");
        }).join('');
    }
    // Seção de pagamento
    var paymentSection = '';
    if (isPix) {
        paymentSection = "\n      <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;\">\n          \uD83D\uDCF1 Instru\u00E7\u00F5es de Pagamento via PIX\n        </h3>\n        <ol style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n          <li>Realize o pagamento via PIX no valor de <strong style=\"color: #1a3c34;\">".concat(formatCurrency(reservation.totalPrice), "</strong></li>\n          <li>Envie o comprovante para: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.email, "\" style=\"color: #d4a853; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.email, "</a></li>\n          <li>Ap\u00F3s recebermos o comprovante, enviaremos a confirma\u00E7\u00E3o</li>\n        </ol>\n      </div>\n\n      <div style=\"background: #ffffff; border: 2px solid #1a3c34; border-radius: 12px; padding: 24px; margin: 24px 0;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 20px 0; font-size: 18px;\">\n          \uD83D\uDCCB Dados para Transfer\u00EAncia PIX\n        </h3>\n        <table style=\"width: 100%; color: #1e293b; font-size: 14px; border-collapse: collapse;\">\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; width: 45%; border-bottom: 1px solid #f1f5f9;\">CHAVE PIX (CELULAR)</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.chave, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;\">BENEFICI\u00C1RIO</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.beneficiario, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;\">CNPJ</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.cnpj, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;\">BANCO</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.banco, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;\">AG\u00CANCIA</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.agencia, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;\">CONTA CORRENTE</td>\n            <td style=\"padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;\">").concat(exports.HOTEL_CONFIG.pix.conta, "</td>\n          </tr>\n          <tr>\n            <td style=\"padding: 12px 0; color: #1a3c34; font-weight: bold; font-size: 16px;\">VALOR TOTAL</td>\n            <td style=\"padding: 12px 0; text-align: right; color: #1a3c34; font-weight: bold; font-size: 20px;\">").concat(formatCurrency(reservation.totalPrice), "</td>\n          </tr>\n        </table>\n\n        <div style=\"margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;\">\n          <p style=\"color: #166534; margin: 0 0 12px 0; font-weight: bold;\">\u2705 Ap\u00F3s realizar a transfer\u00EAncia:</p>\n          <ol style=\"color: #166534; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n            <li>Envie o comprovante para: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.email, "\" style=\"color: #1a3c34; font-weight: bold; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.email, "</a></li>\n            <li>Sua reserva ser\u00E1 confirmada em at\u00E9 24 horas \u00FAteis.</li>\n          </ol>\n        </div>\n      </div>\n    ");
    }
    else {
        var installmentsText = ((_a = reservation.cardDetails) === null || _a === void 0 ? void 0 : _a.installments) && reservation.cardDetails.installments > 1
            ? "em ".concat(reservation.cardDetails.installments, " x")
            : 'à vista';
        paymentSection = "\n      <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;\">\n          \uD83D\uDCB3 Pagamento via Cart\u00E3o de Cr\u00E9dito\n        </h3>\n        <p style=\"color: #475569; margin: 0;\">\n          Pagamento ".concat(installmentsText, " no valor de <strong style=\"color: #1a3c34;\">").concat(formatCurrency(reservation.totalPrice), "</strong>\n        </p>\n        <p style=\"color: #64748b; margin: 12px 0 0 0; font-size: 13px;\">\n          Aguarde a confirma\u00E7\u00E3o do processamento do pagamento.\n        </p>\n      </div>\n    ");
    }
    // O Link de Pré-Check-in agora aponta para o Próprio Motor de Reservas
    var preCheckInUrl = "https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/".concat(reservation.id);
    return "\n<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n  <div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n    \n    <!-- Header com Logo -->\n    <div style=\"background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 40px 20px; text-align: center;\">\n      <img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 120px; margin-bottom: 20px;\">\n      <h1 style=\"color: #4ade80; margin: 0; font-size: 28px; font-weight: normal;\">\n        \u2705 Reserva Solicitada!\n      </h1>\n      <p style=\"color: #d4a853; margin: 10px 0 0 0; font-size: 16px;\">\n        Obrigado por nos escolher!\n      </p>\n    </div>\n    \n    <!-- Conte\u00FAdo Principal -->\n    <div style=\"background-color: #ffffff; padding: 32px 24px;\">\n      \n      <!-- Sauda\u00E7\u00E3o -->\n      <p style=\"color: #1e293b; font-size: 16px; margin: 0 0 24px 0;\">\n        Ol\u00E1 <strong>").concat(reservation.mainGuest.name, "</strong>,\n      </p>\n      <p style=\"color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;\">\n        Recebemos sua solicita\u00E7\u00E3o de reserva no Hotel Solar! Ficamos felizes com sua prefer\u00EAncia. Para sua comodidade, voc\u00EA j\u00E1 pode agilizar sua chegada realizando o pr\u00E9-check-in digital.\n      </p>\n\n      <!-- Bot\u00E3o de Pr\u00E9-Check-in -->\n      <div style=\"text-align: center; margin: 32px 0;\">\n        <a href=\"").concat(preCheckInUrl, "\" style=\"background-color: #1a3c34; color: #d4a853; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);\">AGILIZAR MEU CHECK-IN AGORA</a>\n        <p style=\"color: #64748b; font-size: 11px; margin-top: 12px;\">Preencha seus dados agora e ganhe tempo na recep\u00E7\u00E3o!</p>\n      </div>\n      \n      <!-- N\u00FAmero da Reserva -->\n      <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;\">\n        <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;\">\n          N\u00FAmero da Reserva\n        </p>\n        <p style=\"color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;\">\n          ").concat(shortId, "\n        </p>\n      </div>\n      \n      <!-- Detalhes da Reserva -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n          \uD83D\uDCCB Detalhes da Reserva\n        </h3>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n        <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">Noites:</strong> ").concat(reservation.nights, "</p>\n      </div>\n      \n      <!-- Acomoda\u00E7\u00F5es -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;\">\n          \uD83C\uDFE8 Acomoda\u00E7\u00F5es\n        </h3>\n        <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n          ").concat(roomsHTML, "\n        </ul>\n      </div>\n\n      <!-- Acompanhantes -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;\">\n          \uD83D\uDC65 Acompanhantes Inclu\u00EDdos\n        </h3>\n        ").concat(reservation.additionalGuests && reservation.additionalGuests.length > 0 ? guestsHTML : '<ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;"><li>Apenas o Titular</li></ul>', "\n      </div>\n      \n      <!-- Servi\u00E7os Extras -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;\">\n          \u2795 Servi\u00E7os Extras\n        </h3>\n        <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n          ").concat(extrasHTML, "\n        </ul>\n      </div>\n      \n      <!-- Observa\u00E7\u00F5es -->\n      ").concat(reservation.observations ? "\n      <div style=\"margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;\">\n          \uD83D\uDCDD Observa\u00E7\u00F5es\n        </h3>\n        <p style=\"color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;\">\n          \"".concat(reservation.observations, "\"\n        </p>\n      </div>\n      ") : '', "\n      \n      <!-- Valor Total -->\n      <div style=\"border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 24px;\">\n        ").concat(reservation.discountApplied ? "\n        <p style=\"color: #16a34a; margin: 0 0 8px 0; font-size: 14px;\">\n          <strong>Cupom (".concat(reservation.discountApplied.code, "):</strong> - ").concat(formatCurrency(reservation.discountApplied.amount), "\n        </p>\n        ") : '', "\n        ").concat(reservation.packageDiscountApplied ? "\n        <p style=\"color: #16a34a; margin: 0 0 8px 0; font-size: 14px;\">\n          <strong>Desconto Pacote (".concat(reservation.packageDiscountApplied.percentage, "%):</strong> - ").concat(formatCurrency(reservation.packageDiscountApplied.amount), "\n        </p>\n        ") : '', "\n        <p style=\"color: #1e293b; margin: 0; font-size: 18px;\">\n          <strong>Valor Total:</strong> \n          <span style=\"color: #1a3c34; font-size: 24px; font-weight: bold;\">").concat(formatCurrency(reservation.totalPrice), "</span>\n        </p>\n      </div>\n      \n      <!-- Se\u00E7\u00E3o de Pagamento -->\n      <div style=\"color: #1e293b\">\n        ").concat(paymentSection.replace(/color: #fff/g, 'color: #1e293b').replace(/color: #ccc/g, 'color: #475569').replace(/background: rgba\(255,255,255,0.1\)/g, 'background: #f1f5f9'), "\n      </div>\n      \n      <!-- Links -->\n      <div style=\"text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;\">\n        <a href=\"").concat(exports.HOTEL_CONFIG.regulamentoUrl, "\" style=\"color: #d4a853; text-decoration: none; font-size: 14px;\">\n          \uD83D\uDCC4 Pol\u00EDtica de Reservas e Cancelamento\n        </a>\n        <p style=\"color: #64748b; margin: 16px 0 0 0; font-size: 12px;\">\n          Precisa cancelar sua reserva? \n          <a href=\"https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=cancelamento&reserva=").concat(reservation.id, "\" style=\"color: #ef4444; text-decoration: none;\">\n            Cancelar Reserva\n          </a>\n        </p>\n      </div>\n      \n    </div>\n    \n    <!-- Footer -->\n    <div style=\"background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;\">\n      <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 13px;\">\n        ").concat(exports.HOTEL_CONFIG.name, " - ").concat(exports.HOTEL_CONFIG.address, "\n      </p>\n      <p style=\"color: #64748b; margin: 0; font-size: 13px;\">\n        Email: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.adminEmail, "\" style=\"color: #d4a853; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.adminEmail, "</a>\n      </p>\n    </div>\n    \n  </div>\n</body>\n</html>\n  ");
};
exports.generateClientEmailHTML = generateClientEmailHTML;
// Template de e-mail para o hotel (notificação de nova reserva)
var generateHotelEmailHTML = function (reservation) {
    var _a;
    var shortId = getShortReservationId(reservation.id);
    // Determinar forma de pagamento
    var paymentMethodText = 'PIX';
    if (reservation.paymentMethod === 'CREDIT_CARD') {
        var installments = ((_a = reservation.cardDetails) === null || _a === void 0 ? void 0 : _a.installments) || 1;
        paymentMethodText = installments > 1
            ? "Cart\u00E3o de Cr\u00E9dito (".concat(installments, "x)")
            : 'Cartão de Crédito (à vista)';
    }
    // Gerar lista de acomodações
    var roomsHTML = reservation.rooms.map(function (room) { return "\n    <li style=\"margin-bottom: 4px;\">".concat(room.name, " - ").concat(formatCurrency(room.priceSnapshot), "</li>\n  "); }).join('');
    // Gerar lista de extras
    var extrasHTML = reservation.extras.length > 0
        ? reservation.extras.map(function (extra) { return "\n        <li style=\"margin-bottom: 4px;\">".concat(extra.name, " (").concat(extra.quantity, "x) - ").concat(formatCurrency(extra.priceSnapshot * extra.quantity), "</li>\n      "); }).join('')
        : '<li>Nenhum serviço extra</li>';
    // Agrupar acompanhantes por quarto (Recepção)
    var adminGuestsHTML = '<li>Apenas o titular</li>';
    if (reservation.additionalGuests && reservation.additionalGuests.length > 0) {
        var uniqueRooms = Array.from(new Set(reservation.additionalGuests.map(function (g) { return g.roomName; })));
        adminGuestsHTML = uniqueRooms.map(function (roomName) {
            var gInRoom = reservation.additionalGuests.filter(function (g) { return g.roomName === roomName; });
            var listItems = gInRoom.map(function (guest) { return "\n        <li style=\"margin-bottom: 4px;\"><strong>".concat(guest.name, "</strong> (").concat(guest.age, ")</li>\n      "); }).join('');
            return "\n        <div style=\"margin-bottom: 8px;\">\n          <h4 style=\"color: #1e293b; margin: 0 0 6px 0; font-size: 14px; text-decoration: underline;\">".concat(roomName, "</h4>\n          <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.4;\">\n            ").concat(listItems, "\n          </ul>\n        </div>\n      ");
        }).join('');
    }
    return "\n<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n  <div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n    \n    <!-- Header com Logo -->\n    <div style=\"background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 30px 20px; text-align: center;\">\n      <img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 100px;\">\n    </div>\n    \n    <!-- Linha dourada -->\n    <div style=\"height: 3px; background: linear-gradient(90deg, transparent, #d4a853, transparent);\"></div>\n    \n    <!-- Conte\u00FAdo Principal -->\n    <div style=\"background-color: #ffffff; padding: 32px 24px;\">\n      \n      <!-- T\u00EDtulo -->\n      <h1 style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 24px;\">\n        \uD83D\uDD14 Nova Reserva\n      </h1>\n      <p style=\"color: #64748b; margin: 0 0 24px 0; font-size: 14px;\">\n        <strong style=\"color: #1e293b;\">N\u00FAmero da Reserva:</strong> ").concat(shortId, "\n      </p>\n      \n      <!-- Dados do H\u00F3spede -->\n      <div style=\"margin-bottom: 24px;\">\n        <h2 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n          Dados do Titular\n        </h2>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Nome:</strong> ").concat(reservation.mainGuest.name, "</p>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Email:</strong> <a href=\"mailto:").concat(reservation.mainGuest.email, "\" style=\"color: #d4a853;\">").concat(reservation.mainGuest.email, "</a></p>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Telefone:</strong> ").concat(reservation.mainGuest.phone, "</p>\n        <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">CPF:</strong> ").concat(reservation.mainGuest.cpf, "</p>\n      </div>\n\n      <!-- Acompanhantes -->\n      <div style=\"margin-bottom: 24px;\">\n        <h2 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n          Acompanhantes Cadastrados\n        </h2>\n        ").concat(reservation.additionalGuests && reservation.additionalGuests.length > 0 ? adminGuestsHTML : '<ul style="color: #475569; margin: 0; padding-left: 20px;"><li>Apenas o Titular</li></ul>', "\n      </div>\n      \n      <!-- Detalhes da Reserva -->\n      <div style=\"margin-bottom: 24px;\">\n        <h2 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n          Detalhes da Reserva\n        </h2>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n        <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n        <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">Noites:</strong> ").concat(reservation.nights, "</p>\n      </div>\n      \n      <!-- Acomoda\u00E7\u00F5es -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;\">Acomoda\u00E7\u00F5es:</h3>\n        <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n          ").concat(roomsHTML, "\n        </ul>\n      </div>\n      \n      <!-- Servi\u00E7os Extras -->\n      <div style=\"margin-bottom: 24px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;\">Servi\u00E7os Extras:</h3>\n        <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;\">\n          ").concat(extrasHTML, "\n        </ul>\n      </div>\n      \n      <!-- Observa\u00E7\u00F5es do Cliente -->\n      ").concat(reservation.observations ? "\n      <div style=\"margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;\">\n        <h3 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;\">\uD83D\uDCDD Observa\u00E7\u00F5es do Cliente:</h3>\n        <p style=\"color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;\">\n          \"".concat(reservation.observations, "\"\n        </p>\n      </div>\n      ") : '', "\n      \n      <!-- Valor e Pagamento -->\n      <div style=\"margin-bottom: 24px;\">\n        ").concat(reservation.discountApplied ? "\n        <p style=\"color: #16a34a; margin: 0 0 4px 0; font-size: 14px;\"> Cupom: - ".concat(formatCurrency(reservation.discountApplied.amount), " (").concat(reservation.discountApplied.code, ")</p>\n        ") : '', "\n        ").concat(reservation.packageDiscountApplied ? "\n        <p style=\"color: #16a34a; margin: 0 0 4px 0; font-size: 14px;\"> Desconto Pacote: - ".concat(formatCurrency(reservation.packageDiscountApplied.amount), " (").concat(reservation.packageDiscountApplied.percentage, "%)</p>\n        ") : '', "\n        <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 16px;\">\n          <strong>Valor Total:</strong> ").concat(formatCurrency(reservation.totalPrice), "\n        </p>\n        <p style=\"color: #475569; margin: 0;\">\n          <strong style=\"color: #1e293b;\">Forma de Pagamento:</strong> ").concat(paymentMethodText, "\n        </p>\n      </div>\n      \n      <!-- Alerta de A\u00E7\u00E3o -->\n      <div style=\"background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0;\">\n        <p style=\"color: #d4a853; margin: 0; font-size: 14px;\">\n          <strong>\u26A0\uFE0F A\u00E7\u00E3o Necess\u00E1ria:</strong> Confirme o pagamento no painel administrativo.\n        </p>\n      </div>\n      \n    </div>\n    \n  </div>\n</body>\n</html>\n  ");
};
exports.generateHotelEmailHTML = generateHotelEmailHTML;
// Função principal para enviar e-mails
var sendReservationEmails = function (reservation) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, results, hotelEmailResult, clientEmailResult, brevoResult, preCheckinResult, msg, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                shortId = getShortReservationId(reservation.id);
                console.log('[Notification] 🚀 INICIANDO PROCESSO DE NOTIFICAÇÃO (PARALELO)...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, Promise.allSettled([
                        // TAREFA 1: Manychat (REMOVIDO)
                        // (async () => { return true; })(),
                        // TAREFA 2: Email Hotel (Proxy)
                        (function () { return __awaiter(void 0, void 0, void 0, function () {
                            var res, txt;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        console.log('[Email-Hotel] Tentando enviar...');
                                        return [4 /*yield*/, fetch('/api/send-email', {
                                                method: 'POST',
                                                headers: { 'content-type': 'application/json' },
                                                body: JSON.stringify({
                                                    sender: { name: 'Sistema de Reservas', email: exports.HOTEL_CONFIG.email },
                                                    to: [{ email: exports.HOTEL_CONFIG.adminEmail, name: 'Administração Hotel Solar' }],
                                                    subject: "\uD83D\uDD14 Nova Reserva #".concat(shortId, " - ").concat(reservation.mainGuest.name),
                                                    htmlContent: (0, exports.generateHotelEmailHTML)(reservation),
                                                }),
                                            })];
                                    case 1:
                                        res = _a.sent();
                                        if (!!res.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, res.text()];
                                    case 2:
                                        txt = _a.sent();
                                        console.error('[Email-Hotel] ❌ ERRO:', res.status, txt);
                                        throw new Error("Hotel Email Failed: ".concat(txt));
                                    case 3:
                                        console.log('[Email-Hotel] ✅ Sucesso!');
                                        return [2 /*return*/];
                                }
                            });
                        }); })(),
                        // TAREFA 3: Email Cliente (Proxy)
                        (function () { return __awaiter(void 0, void 0, void 0, function () {
                            var res, txt;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        console.log('[Email-Cliente] Tentando enviar...');
                                        return [4 /*yield*/, fetch('/api/send-email', {
                                                method: 'POST',
                                                headers: { 'content-type': 'application/json' },
                                                body: JSON.stringify({
                                                    sender: { name: exports.HOTEL_CONFIG.name, email: exports.HOTEL_CONFIG.email },
                                                    to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
                                                    subject: "Confirma\u00E7\u00E3o de Reserva #".concat(shortId, " - Hotel Solar"),
                                                    htmlContent: (0, exports.generateClientEmailHTML)(reservation),
                                                }),
                                            })];
                                    case 1:
                                        res = _a.sent();
                                        if (!!res.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, res.text()];
                                    case 2:
                                        txt = _a.sent();
                                        console.error('[Email-Cliente] ❌ ERRO:', res.status, txt);
                                        throw new Error("Client Email Failed: ".concat(txt));
                                    case 3:
                                        console.log('[Email-Cliente] ✅ Sucesso!');
                                        return [2 /*return*/];
                                }
                            });
                        }); })(),
                        // TAREFA 4: Brevo Sync
                        (0, exports.syncContactToBrevo)({
                            name: reservation.mainGuest.name,
                            email: reservation.mainGuest.email,
                            phone: reservation.mainGuest.phone,
                            checkInDate: reservation.checkIn
                        }, ['HOSPEDE', 'ORIGEM_ONLINE', "STATUS_".concat(reservation.status), "ANO_".concat(new Date().getFullYear())]),
                        // TAREFA 5: Pré-Checkin (Se aplicável)
                        (function () { return __awaiter(void 0, void 0, void 0, function () {
                            var checkInDay, checkInDate, now, diffInHours;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        checkInDay = reservation.checkIn.split('T')[0];
                                        checkInDate = new Date("".concat(checkInDay, "T14:00:00"));
                                        now = new Date();
                                        diffInHours = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                                        if (!(diffInHours > -24 && diffInHours < 48)) return [3 /*break*/, 2];
                                        console.log('[PreCheckin] Enviando email automático...');
                                        return [4 /*yield*/, (0, exports.sendPreCheckInEmail)(reservation)];
                                    case 1:
                                        _a.sent();
                                        _a.label = 2;
                                    case 2: return [2 /*return*/];
                                }
                            });
                        }); })()
                    ])];
            case 2:
                results = _a.sent();
                // Verificar se houve falhas críticas (apenas para log)
                results.forEach(function (result, index) {
                    if (result.status === 'rejected') {
                        console.error("[Notification] Falha na Tarefa ".concat(index + 1, ":"), result.reason);
                    }
                });
                hotelEmailResult = results[0], clientEmailResult = results[1], brevoResult = results[2], preCheckinResult = results[3];
                // Se quiser alertar o usuário sobre falhas REAIS de email:
                if (clientEmailResult.status === 'rejected') {
                    msg = "\u26A0\uFE0F O sistema tentou enviar o e-mail, mas falhou. Erro: ".concat(clientEmailResult.reason);
                    alert(msg); // ALERTA VISUAL PARA O USUÁRIO DEBUGAR
                }
                if (hotelEmailResult.status === 'rejected') {
                    console.error('Falha ao enviar email do hotel:', hotelEmailResult.reason);
                }
                return [2 /*return*/, { success: true }];
            case 3:
                error_1 = _a.sent();
                console.error('[Email] Erro CRÍTICO no processo de e-mails:', error_1);
                return [2 /*return*/, { success: false, error: "Erro geral: ".concat(error_1) }];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.sendReservationEmails = sendReservationEmails;
// Sincronizar contato com Brevo (Marketing)
var syncContactToBrevo = function (guest_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([guest_1], args_1, true), void 0, function (guest, tags) {
        var cleanPhone, newTags, monthIndex, months, response, err_1;
        if (tags === void 0) { tags = ['HOSPEDE']; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Agora usando Proxy Serverless para evitar CORS e ocultar API Key
                    if (!guest.email)
                        return [2 /*return*/, { success: false, error: 'E-mail obrigatório' }];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    cleanPhone = guest.phone.replace(/\D/g, '');
                    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
                        cleanPhone = '55' + cleanPhone;
                    }
                    newTags = __spreadArray([], tags, true);
                    if (guest.birthDate) {
                        try {
                            monthIndex = parseInt(guest.birthDate.split('-')[1]) - 1;
                            months = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
                            if (!isNaN(monthIndex) && months[monthIndex]) {
                                newTags.push("NASC_".concat(months[monthIndex]));
                            }
                        }
                        catch (e) {
                            console.error('[Brevo] Erro ao gerar tag de mês:', e);
                        }
                    }
                    return [4 /*yield*/, fetch('/api/sync-brevo-contact', {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json'
                            },
                            body: JSON.stringify({
                                email: guest.email,
                                attributes: {
                                    NOME: guest.name,
                                    SMS: cleanPhone,
                                    TELEFONE: cleanPhone,
                                    CHECKIN: new Date(guest.checkInDate || Date.now()).toISOString().split('T')[0], // Formato YYYY-MM-DD
                                    NASCIMENTO: guest.birthDate ? guest.birthDate : undefined
                                },
                                listIds: [2],
                                updateEnabled: true,
                                ext_id: guest.email,
                                tags: newTags
                            })
                        })];
                case 2:
                    response = _a.sent();
                    return [2 /*return*/, { success: response.ok }];
                case 3:
                    err_1 = _a.sent();
                    console.error('Erro de rede Brevo Sync:', err_1);
                    return [2 /*return*/, { success: false, error: err_1.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
};
exports.syncContactToBrevo = syncContactToBrevo;
exports.default = exports.sendReservationEmails;
// Template de e-mail para confirmação de pagamento
var generatePaymentConfirmedEmailHTML = function (reservation) {
    var _a, _b;
    var shortId = getShortReservationId(reservation.id);
    var isPix = reservation.paymentMethod === 'PIX';
    var paymentMethodText = isPix
        ? 'PIX Confirmado'
        : ((_a = reservation.cardDetails) === null || _a === void 0 ? void 0 : _a.installments) && reservation.cardDetails.installments > 1
            ? "Cart\u00E3o Aprovado (".concat(reservation.cardDetails.installments, "x)")
            : 'Cartão Aprovado';
    var amountPaid = (_b = reservation.amountPaid) !== null && _b !== void 0 ? _b : reservation.totalPrice;
    var remainingBalance = reservation.totalPrice - amountPaid;
    // Gerar lista de acomodações
    var roomsHTML = reservation.rooms.map(function (room) { return "\n<li style=\"margin-bottom: 4px;\">".concat(room.name, "</li>\n"); }).join('');
    return "\n<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n<div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n \n<!-- Header com Logo -->\n<div style=\"background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 40px 20px; text-align: center;\">\n  <img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 120px; margin-bottom: 20px;\">\n  <h1 style=\"color: #4ade80; margin: 0; font-size: 28px; font-weight: normal;\">\n    \u2705 Pagamento Confirmado!\n  </h1>\n  <p style=\"color: #d4a853; margin: 10px 0 0 0; font-size: 16px;\">\n    Sua reserva est\u00E1 garantida!\n  </p>\n</div>\n \n<!-- Conte\u00FAdo Principal -->\n<div style=\"background-color: #ffffff; padding: 32px 24px;\">\n  \n  <!-- Sauda\u00E7\u00E3o -->\n  <p style=\"color: #1e293b; font-size: 16px; margin: 0 0 24px 0;\">\n    Ol\u00E1 <strong>").concat(reservation.mainGuest.name, "</strong>,\n  </p>\n  <p style=\"color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;\">\n    Temos o prazer de informar que seu pagamento foi confirmado com sucesso! Sua reserva no Hotel Solar est\u00E1 garantida.\n  </p>\n  \n  <!-- Status do Pagamento -->\n  <div style=\"background: linear-gradient(135deg, #166534 0%, #15803d 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;\">\n    <p style=\"color: rgba(255,255,255,0.8); margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;\">\n      Status do Pagamento\n    </p>\n    <p style=\"color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;\">\n      ").concat(paymentMethodText, "\n    </p>\n    <div style=\"margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px;\">\n      ").concat(reservation.discountApplied ? "\n        <p style=\"color: #86efac; margin: 4px 0; font-size: 12px;\">Cupom: - ".concat(formatCurrency(reservation.discountApplied.amount), "</p>\n      ") : '', "\n      ").concat(reservation.packageDiscountApplied ? "\n        <p style=\"color: #86efac; margin: 4px 0; font-size: 12px;\">Desconto Pacote: - ".concat(formatCurrency(reservation.packageDiscountApplied.amount), "</p>\n      ") : '', "\n      <div style=\"margin: 16px 0; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; text-align: left;\">\n        <p style=\"color: rgba(255,255,255,0.8); margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase;\">Hist\u00F3rico de Pagamentos:</p>\n        ").concat(reservation.paymentHistory && reservation.paymentHistory.length > 0 ?
        reservation.paymentHistory.map(function (p) { return "\n            <div style=\"display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; color: #fff;\">\n              <span>".concat((0, dateUtils_1.formatDisplayDate)(p.date), "</span>\n              <strong>").concat(formatCurrency(p.amount), "</strong>\n            </div>\n          "); }).join('')
        :
            // Fallback para pagamentos antigos
            "<div style=\"display: flex; justify-content: space-between; font-size: 13px; color: #fff;\">\n             <span>Pagamento Inicial</span>\n             <strong>".concat(formatCurrency(amountPaid), "</strong>\n           </div>"), "\n      </div>\n\n      <p style=\"color: rgba(255,255,255,0.9); margin: 0; font-size: 14px; border-top: 1px solid rgba(255,255,255,0.2); paddingTop: 12px; margin-top: 12px;\">\n        Valor Total da Reserva: <strong>").concat(formatCurrency(reservation.totalPrice), "</strong>\n      </p>\n      <p style=\"color: #ffffff; margin: 4px 0 0 0; font-size: 18px; font-weight: bold;\">\n        Total Pago: ").concat(formatCurrency(amountPaid), "\n      </p>\n      <p style=\"color: ").concat(remainingBalance > 0 ? '#fca5a5' : '#86efac', "; margin: 4px 0 0 0; font-size: 14px;\">\n        Saldo Restante: <strong>").concat(formatCurrency(remainingBalance), "</strong>\n      </p>\n    </div>\n  </div>\n  \n  <!-- N\u00FAmero da Reserva -->\n  <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;\">\n    <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;\">\n      N\u00FAmero da Reserva\n    </p>\n    <p style=\"color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;\">\n      ").concat(shortId, "\n    </p>\n  </div>\n  \n  <!-- Detalhes da Reserva -->\n  <div style=\"margin-bottom: 24px;\">\n    <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n      \uD83D\uDCCB Detalhes da Reserva\n    </h3>\n    <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;\">\n      <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n      <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n      <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Noites:</strong> ").concat(reservation.nights, "</p>\n      <p style=\"color: #475569; margin: 12px 0 8px 0; border-top: 1px solid #e2e8f0; padding-top: 8px;\"><strong style=\"color: #1e293b;\">Acomoda\u00E7\u00F5es:</strong></p>\n      <ul style=\"color: #475569; margin: 8px 0 0 0; padding-left: 20px;\">\n        ").concat(roomsHTML, "\n      </ul>\n    </div>\n  </div>\n  \n  <!-- Informa\u00E7\u00F5es Importantes -->\n  <div style=\"background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n    <h4 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDCCC Informa\u00E7\u00F5es Importantes</h4>\n    <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n      <li>Check-in a partir das 14h</li>\n      <li>Check-out at\u00E9 \u00E0s 12h</li>\n      <li>Apresente um documento de identifica\u00E7\u00E3o no check-in</li>\n    </ul>\n  </div>\n  \n  <!-- Rodap\u00E9 -->\n  <div style=\"text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;\">\n    <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;\">\n      Estamos ansiosos para receb\u00EA-lo!\n    </p>\n    <p style=\"color: #64748b; margin: 0; font-size: 12px;\">\n      ").concat(exports.HOTEL_CONFIG.name, " - ").concat(exports.HOTEL_CONFIG.address, "\n    </p>\n    <p style=\"color: #64748b; margin: 8px 0 0 0; font-size: 12px;\">\n      Email: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.email, "\" style=\"color: #d4a853; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.email, "</a>\n    </p>\n  </div>\n  \n</div>\n \n</div>\n</body>\n</html>\n");
};
// Template de e-mail para cancelamento de reserva
var generateReservationCanceledEmailHTML = function (reservation, customReason) {
    var shortId = getShortReservationId(reservation.id);
    var isPix = reservation.paymentMethod === 'PIX';
    var cancelReasonText = customReason || (isPix
        ? 'Não recebemos o comprovante de pagamento PIX dentro do prazo estabelecido.'
        : 'O pagamento via cartão de crédito não foi aprovado pela operadora.');
    return "\n<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #fef2f2; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n<div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n \n<!-- Header com Logo -->\n<div style=\"background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 40px 20px; text-align: center;\">\n  <img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 120px; margin-bottom: 20px;\">\n  <h1 style=\"color: #fca5a5; margin: 0; font-size: 28px; font-weight: normal;\">\n    \u274C Reserva Cancelada\n  </h1>\n  <p style=\"color: #fecaca; margin: 10px 0 0 0; font-size: 16px;\">\n    Sua reserva n\u00E3o p\u00F4de ser confirmada\n  </p>\n</div>\n \n<!-- Conte\u00FAdo Principal -->\n<div style=\"background-color: #ffffff; padding: 32px 24px;\">\n  \n  <!-- Sauda\u00E7\u00E3o -->\n  <p style=\"color: #1e293b; font-size: 16px; margin: 0 0 24px 0;\">\n    Ol\u00E1 <strong>").concat(reservation.mainGuest.name, "</strong>,\n  </p>\n  <p style=\"color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;\">\n    Infelizmente, precisamos informar que sua reserva no Hotel Solar foi cancelada.\n  </p>\n  \n  <!-- Motivo do Cancelamento -->\n  <div style=\"background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 24px; margin-bottom: 24px;\">\n    <h3 style=\"color: #991b1b; margin: 0 0 12px 0; font-size: 16px;\">\n      \u26A0\uFE0F Motivo do Cancelamento\n    </h3>\n    <p style=\"color: #b91c1c; margin: 0; font-size: 14px; line-height: 1.6;\">\n      ").concat(cancelReasonText, "\n    </p>\n  </div>\n  \n  <!-- N\u00FAmero da Reserva -->\n  <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;\">\n    <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;\">\n      Reserva Cancelada\n    </p>\n    <p style=\"color: #ef4444; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-decoration: line-through;\">\n      ").concat(shortId, "\n    </p>\n  </div>\n  \n  <!-- Detalhes da Reserva -->\n  <div style=\"margin-bottom: 24px; opacity: 0.7;\">\n    <h3 style=\"color: #1e293b; margin: 0 0 16px 0; font-size: 16px;\">\n      \uD83D\uDCCB Detalhes da Reserva Cancelada\n    </h3>\n    <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;\">\n      <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n      <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n      <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">Valor:</strong> ").concat(formatCurrency(reservation.totalPrice), "</p>\n    </div>\n  </div>\n  \n  <!-- Nova Reserva -->\n  <div style=\"background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n    <h4 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDD04 Deseja fazer uma nova reserva?</h4>\n    <p style=\"color: #475569; margin: 0; font-size: 13px; line-height: 1.6;\">\n      Voc\u00EA pode realizar uma nova reserva a qualquer momento atrav\u00E9s do nosso site ou entrando em contato conosco.\n    </p>\n  </div>\n  \n  <!-- Bot\u00E3o Nova Reserva -->\n  <div style=\"text-align: center; margin-bottom: 24px;\">\n    <a href=\"https://motor-de-reservas-on-line-hotel-sol.vercel.app\" style=\"display: inline-block; background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); color: #4ade80; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;\">\n      Fazer Nova Reserva\n    </a>\n  </div>\n  \n  <!-- Rodap\u00E9 -->\n  <div style=\"text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;\">\n    <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 12px;\">\n      Lamentamos o ocorrido e esperamos atend\u00EA-lo em breve!\n    </p>\n    <p style=\"color: #64748b; margin: 0; font-size: 12px;\">\n      ").concat(exports.HOTEL_CONFIG.name, " - ").concat(exports.HOTEL_CONFIG.address, "\n    </p>\n    <p style=\"color: #64748b; margin: 8px 0 0 0; font-size: 12px;\">\n      Email: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.email, "\" style=\"color: #d4a853; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.email, "</a>\n    </p>\n  </div>\n  \n</div>\n \n</div>\n</body>\n</html>\n");
};
// Template de e-mail para pré-check-in (Copiado do ERP conforme pedido)
var generatePreCheckInEmailHTML = function (reservation) {
    var shortId = getShortReservationId(reservation.id);
    // URL corrigida para o Motor de Reservas (onde criamos a página nova)
    var preCheckInUrl = "https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/".concat(reservation.id);
    return "\n<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"></head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n<div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n<div style=\"background: linear-gradient(135deg, #d4a853 0%, #b88a3e 100%); padding: 40px 20px; text-align: center;\">\n  <img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 120px; margin-bottom: 20px;\">\n  <h1 style=\"color: #ffffff; margin: 0; font-size: 28px; font-weight: normal;\">\uD83D\uDCCB Agilize seu Check-in!</h1>\n  <p style=\"color: #1a3c34; margin: 10px 0 0 0; font-size: 16px;\">Sua chegada est\u00E1 pr\u00F3xima no Hotel Solar.</p>\n</div>\n<div style=\"background-color: #ffffff; padding: 32px 24px;\">\n  <p style=\"color: #1e293b; font-size: 16px; margin: 0 0 24px 0;\">Ol\u00E1 <strong>").concat(reservation.mainGuest.name, "</strong>,</p>\n  <p style=\"color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;\">Para garantir uma entrada mais r\u00E1pida e tranquila no hotel, convidamos voc\u00EA a realizar o seu <strong>Pr\u00E9-Check-in Digital</strong>. Leva menos de 2 minutos!</p>\n  \n  <div style=\"text-align: center; margin: 32px 0;\">\n    <a href=\"").concat(preCheckInUrl, "\" style=\"background-color: #1a3c34; color: #d4a853; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);\">FAZER PR\u00C9-CHECK-IN AGORA</a>\n  </div>\n \n  <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;\">\n    <h3 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDCC5 Sua Reserva: #").concat(shortId, "</h3>\n    <p style=\"color: #475569; margin: 0; font-size: 13px;\">Previs\u00E3o de Check-in: <strong>").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</strong></p>\n  </div>\n \n  <div style=\"background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n    <h4 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDCA1 Por que fazer o pr\u00E9-check-in?</h4>\n    <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.6; font-size: 13px;\">\n      <li>Menos tempo preenchendo fichas no balc\u00E3o</li>\n      <li>Garante que todos os seus dados estejam corretos</li>\n      <li>Cumprimento da legisla\u00E7\u00E3o FNRH eletronicamente</li>\n    </ul>\n  </div>\n \n  <div style=\"text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;\">\n    <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;\">Nos vemos em breve!</p>\n    <p style=\"color: #64748b; margin: 0; font-size: 12px;\">").concat(exports.HOTEL_CONFIG.name, " - ").concat(exports.HOTEL_CONFIG.address, "</p>\n  </div>\n</div>\n</div>\n</body>\n</html>");
};
// Função para enviar e e-mail de pré-check-in
var sendPreCheckInEmail = function (reservation) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, emailResponse, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                shortId = getShortReservationId(reservation.id);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            sender: { name: exports.HOTEL_CONFIG.name, email: exports.HOTEL_CONFIG.email },
                            to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
                            subject: "\uD83D\uDCCB Pr\u00E9-Check-in Digital - Reserva #".concat(shortId),
                            htmlContent: generatePreCheckInEmailHTML(reservation),
                        }),
                    })];
            case 2:
                emailResponse = _a.sent();
                if (emailResponse.ok) {
                    console.log('[Email] Pré-checkin por e-mail enviado para', reservation.mainGuest.email);
                }
                return [2 /*return*/, { success: true }];
            case 3:
                error_2 = _a.sent();
                console.error('[Email] Erro ao enviar notificação de pré-check-in:', error_2);
                return [2 /*return*/, { success: false, error: "Erro ao enviar notifica\u00E7\u00E3o: ".concat(error_2) }];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.sendPreCheckInEmail = sendPreCheckInEmail;
// Função para enviar e-mail de confirmação de pagamento
var sendPaymentConfirmedEmail = function (reservation) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, emailResponse, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                shortId = getShortReservationId(reservation.id);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            sender: { name: exports.HOTEL_CONFIG.name, email: exports.HOTEL_CONFIG.email },
                            to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
                            subject: "\u2705 Pagamento Confirmado - Reserva #".concat(shortId),
                            htmlContent: generatePaymentConfirmedEmailHTML(reservation),
                        }),
                    })];
            case 2:
                emailResponse = _a.sent();
                if (emailResponse.ok) {
                    console.log('[Email] Pagamento confirmado por e-mail enviado para', reservation.mainGuest.email);
                }
                return [2 /*return*/, { success: true }];
            case 3:
                error_3 = _a.sent();
                console.error('[Email] Erro ao enviar e-mail de confirmação:', error_3);
                return [2 /*return*/, { success: false, error: "Erro ao enviar e-mail: ".concat(error_3) }];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.sendPaymentConfirmedEmail = sendPaymentConfirmedEmail;
// Função para enviar e-mail de cancelamento de reserva
var sendReservationCanceledEmail = function (reservation, reason) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, emailResponse, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                shortId = getShortReservationId(reservation.id);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            sender: { name: exports.HOTEL_CONFIG.name, email: exports.HOTEL_CONFIG.email },
                            to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
                            subject: "\u274C Reserva Cancelada - #".concat(shortId),
                            htmlContent: generateReservationCanceledEmailHTML(reservation, reason),
                        }),
                    })];
            case 2:
                emailResponse = _a.sent();
                if (emailResponse.ok) {
                    console.log('[Email] Cancelamento por e-mail enviado para', reservation.mainGuest.email);
                }
                return [2 /*return*/, { success: true }];
            case 3:
                error_4 = _a.sent();
                console.error('[Email] Erro ao enviar e-mail de cancelamento:', error_4);
                return [2 /*return*/, { success: false, error: "Erro ao enviar e-mail: ".concat(error_4) }];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.sendReservationCanceledEmail = sendReservationCanceledEmail;
// Template de e-mail para cancelamento feito pelo cliente
var generateClientCancellationEmailHTML = function (reservation, cancelledItems) {
    var _a, _b, _c, _d;
    var shortId = getShortReservationId(reservation.id);
    var isPartialCancellation = cancelledItems && (((_a = cancelledItems.rooms) === null || _a === void 0 ? void 0 : _a.length) || ((_b = cancelledItems.extras) === null || _b === void 0 ? void 0 : _b.length));
    var cancelledRoomsHTML = ((_c = cancelledItems === null || cancelledItems === void 0 ? void 0 : cancelledItems.rooms) === null || _c === void 0 ? void 0 : _c.map(function (room) { return "<li style=\"margin-bottom: 4px;\">".concat(room, "</li>"); }).join('')) || '';
    var cancelledExtrasHTML = ((_d = cancelledItems === null || cancelledItems === void 0 ? void 0 : cancelledItems.extras) === null || _d === void 0 ? void 0 : _d.map(function (extra) { return "<li style=\"margin-bottom: 4px;\">".concat(extra, "</li>"); }).join('')) || '';
    return "\n<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n<div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);\">\n \n<!-- Header com Logo -->\n<div style=\"background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 40px 20px; text-align: center;\">\n<img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 120px; margin-bottom: 20px;\">\n<h1 style=\"color: #f97316; margin: 0; font-size: 28px; font-weight: normal;\">\n  ").concat(isPartialCancellation ? '⚠️ Cancelamento Parcial Confirmado' : '❌ Cancelamento Confirmado', "\n</h1>\n<p style=\"color: #d4a853; margin: 10px 0 0 0; font-size: 16px;\">\n  Seu cancelamento foi processado com sucesso\n</p>\n</div>\n \n<!-- Conte\u00FAdo Principal -->\n<div style=\"background-color: #ffffff; padding: 32px 24px;\">\n \n<!-- Sauda\u00E7\u00E3o -->\n<p style=\"color: #1e293b; font-size: 16px; margin: 0 0 24px 0;\">\n  Ol\u00E1 <strong>").concat(reservation.mainGuest.name, "</strong>,\n</p>\n<p style=\"color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;\">\n  ").concat(isPartialCancellation
        ? 'Confirmamos o cancelamento parcial da sua reserva conforme solicitado. Veja abaixo os itens cancelados.'
        : 'Confirmamos o cancelamento completo da sua reserva conforme solicitado. Lamentamos que não poderemos recebê-lo desta vez.', "\n</p>\n \n<!-- N\u00FAmero da Reserva -->\n<div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;\">\n  <p style=\"color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;\">\n    N\u00FAmero da Reserva\n  </p>\n  <p style=\"color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;\">\n    ").concat(shortId, "\n  </p>\n</div>\n \n").concat(isPartialCancellation ? "\n<!-- Itens Cancelados -->\n<div style=\"background: rgba(249, 115, 22, 0.05); border-left: 4px solid #f97316; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n  <h4 style=\"color: #f97316; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDEAB Itens Cancelados:</h4>\n  ".concat(cancelledRoomsHTML ? "\n  <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;\"><strong>Acomoda\u00E7\u00F5es:</strong></p>\n  <ul style=\"color: #475569; margin: 0 0 12px 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n    ".concat(cancelledRoomsHTML, "\n  </ul>\n  ") : '', "\n  ").concat(cancelledExtrasHTML ? "\n  <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;\"><strong>Servi\u00E7os Extras:</strong></p>\n  <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n    ".concat(cancelledExtrasHTML, "\n  </ul>\n  ") : '', "\n</div>\n") : "\n<!-- Detalhes da Reserva Cancelada -->\n<div style=\"margin-bottom: 24px;\">\n  <h3 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n    \uD83D\uDCCB Detalhes da Reserva Cancelada\n  </h3>\n  <div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;\">\n    <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ".concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n    <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n    <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">Valor:</strong> ").concat(formatCurrency(reservation.totalPrice), "</p>\n  </div>\n</div>\n"), "\n \n<!-- Pol\u00EDtica de Cancelamento -->\n<div style=\"background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n  <h4 style=\"color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDCCC Pol\u00EDtica de Cancelamento</h4>\n  <p style=\"color: #475569; margin: 0; font-size: 13px; line-height: 1.6;\">\n    Conforme nossa pol\u00EDtica, cancelamentos est\u00E3o sujeitos \u00E0s condi\u00E7\u00F5es descritas no momento da reserva. \n    Para mais informa\u00E7\u00F5es sobre reembolsos, entre em contato conosco.\n  </p>\n</div>\n \n<!-- Bot\u00E3o Nova Reserva -->\n<div style=\"text-align: center; margin: 32px 0;\">\n  <a href=\"https://motor-de-reservas-on-line-hotel-sol.vercel.app\" style=\"display: inline-block; background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); color: #4ade80; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 14px;\">\n    Fazer Nova Reserva\n  </a>\n</div>\n \n<!-- Rodap\u00E9 -->\n<div style=\"text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;\">\n  <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;\">\n    Esperamos v\u00EA-lo em breve!\n  </p>\n  <p style=\"color: #64748b; margin: 0; font-size: 12px;\">\n    ").concat(exports.HOTEL_CONFIG.name, " - ").concat(exports.HOTEL_CONFIG.address, "\n  </p>\n  <p style=\"color: #64748b; margin: 8px 0 0 0; font-size: 12px;\">\n    Email: <a href=\"mailto:").concat(exports.HOTEL_CONFIG.email, "\" style=\"color: #d4a853; text-decoration: none;\">").concat(exports.HOTEL_CONFIG.email, "</a>\n  </p>\n</div>\n \n</div>\n \n</div>\n</body>\n</html>\n");
};
// Template de e-mail para notificar o hotel sobre cancelamento feito pelo cliente
var generateAdminCancellationNotificationHTML = function (reservation, cancelledItems) {
    var _a, _b, _c, _d;
    var shortId = getShortReservationId(reservation.id);
    var isPartialCancellation = cancelledItems && (((_a = cancelledItems.rooms) === null || _a === void 0 ? void 0 : _a.length) || ((_b = cancelledItems.extras) === null || _b === void 0 ? void 0 : _b.length));
    var cancelledRoomsHTML = ((_c = cancelledItems === null || cancelledItems === void 0 ? void 0 : cancelledItems.rooms) === null || _c === void 0 ? void 0 : _c.map(function (room) { return "<li style=\"margin-bottom: 4px;\">".concat(room, "</li>"); }).join('')) || '';
    var cancelledExtrasHTML = ((_d = cancelledItems === null || cancelledItems === void 0 ? void 0 : cancelledItems.extras) === null || _d === void 0 ? void 0 : _d.map(function (extra) { return "<li style=\"margin-bottom: 4px;\">".concat(extra, "</li>"); }).join('')) || '';
    return "\n<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n</head>\n<body style=\"margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\">\n<div style=\"max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden;\">\n \n<!-- Header com Logo -->\n<div style=\"background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 30px 20px; text-align: center; border-bottom: 3px solid #d4a853;\">\n<img src=\"".concat(exports.HOTEL_CONFIG.logoUrl, "\" alt=\"Hotel Solar\" style=\"height: 100px; margin-bottom: 10px;\">\n</div>\n \n<!-- Conte\u00FAdo Principal -->\n<div style=\"background-color: #ffffff; padding: 32px 24px;\">\n \n<!-- Alerta -->\n<div style=\"text-align: center; margin-bottom: 24px;\">\n  <span style=\"font-size: 48px;\">\u26A0\uFE0F</span>\n  <h1 style=\"color: #f97316; margin: 16px 0 0 0; font-size: 24px;\">\n    ").concat(isPartialCancellation ? 'Cancelamento Parcial pelo Cliente' : 'Cancelamento pelo Cliente', "\n  </h1>\n</div>\n \n<!-- N\u00FAmero da Reserva -->\n<div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;\">\n  <p style=\"color: #64748b; margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;\">\n    N\u00FAmero da Reserva\n  </p>\n  <p style=\"color: #d4a853; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;\">\n    ").concat(shortId, "\n  </p>\n</div>\n \n<!-- Dados do H\u00F3spede -->\n<div style=\"margin-bottom: 24px;\">\n  <h2 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n    Dados do H\u00F3spede\n  </h2>\n  <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Nome:</strong> ").concat(reservation.mainGuest.name, "</p>\n  <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Email:</strong> ").concat(reservation.mainGuest.email, "</p>\n  <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Telefone:</strong> ").concat(reservation.mainGuest.phone, "</p>\n</div>\n \n<!-- Detalhes da Reserva -->\n<div style=\"margin-bottom: 24px;\">\n  <h2 style=\"color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;\">\n    Detalhes da Reserva\n  </h2>\n  <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n  <p style=\"color: #475569; margin: 0 0 8px 0;\"><strong style=\"color: #1e293b;\">Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n  <p style=\"color: #475569; margin: 0;\"><strong style=\"color: #1e293b;\">Valor Total:</strong> ").concat(formatCurrency(reservation.totalPrice), "</p>\n</div>\n \n").concat(isPartialCancellation ? "\n<!-- Itens Cancelados -->\n<div style=\"background: rgba(249, 115, 22, 0.05); border-left: 4px solid #f97316; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;\">\n  <h4 style=\"color: #f97316; margin: 0 0 12px 0; font-size: 14px;\">\uD83D\uDEAB Itens Cancelados pelo Cliente:</h4>\n  ".concat(cancelledRoomsHTML ? "\n  <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;\"><strong>Acomoda\u00E7\u00F5es:</strong></p>\n  <ul style=\"color: #475569; margin: 0 0 12px 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n    ".concat(cancelledRoomsHTML, "\n  </ul>\n  ") : '', "\n  ").concat(cancelledExtrasHTML ? "\n  <p style=\"color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;\"><strong>Servi\u00E7os Extras:</strong></p>\n  <ul style=\"color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;\">\n    ".concat(cancelledExtrasHTML, "\n  </ul>\n  ") : '', "\n</div>\n") : "\n<!-- Alerta de Cancelamento Total -->\n<div style=\"background: rgba(239, 68, 68, 0.05); border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0;\">\n  <p style=\"color: #ef4444; margin: 0; font-size: 14px;\">\n    <strong>\u26A0\uFE0F Reserva Cancelada:</strong> O cliente cancelou toda a reserva atrav\u00E9s do link no e-mail.\n  </p>\n</div>\n", "\n \n</div>\n \n</div>\n</body>\n</html>\n");
};
// Função para enviar e-mails de cancelamento feito pelo cliente
var sendClientCancellationEmails = function (reservation, cancelledItems) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, isPartialCancellation, whatsSuccess, clientEmailResponse, hotelEmailResponse, error_5;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                shortId = getShortReservationId(reservation.id);
                isPartialCancellation = cancelledItems && (((_a = cancelledItems.rooms) === null || _a === void 0 ? void 0 : _a.length) || ((_b = cancelledItems.extras) === null || _b === void 0 ? void 0 : _b.length));
                _c.label = 1;
            case 1:
                _c.trys.push([1, 4, , 5]);
                whatsSuccess = false;
                // --- MUDANÇA: EMAIL PARA O CLIENTE ---
                // O cliente DEVE receber um e-mail confirmando o cancelamento que ele acabou de fazer.
                console.log('[Email-Cliente] Enviando confirmação de cancelamento...');
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                            sender: { name: exports.HOTEL_CONFIG.name, email: exports.HOTEL_CONFIG.email },
                            to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
                            subject: "\u274C Reserva Cancelada - #".concat(shortId),
                            htmlContent: generateReservationCanceledEmailHTML(reservation, 'Cancelamento realizado com sucesso através do nosso portal de autoatendimento.'),
                        }),
                    })];
            case 2:
                clientEmailResponse = _c.sent();
                if (clientEmailResponse.ok) {
                    console.log('[Email-Cliente] ✅ Confirmação enviada para', reservation.mainGuest.email);
                }
                else {
                    console.warn('[Email-Cliente] ❌ Falha ao enviar confirmação.');
                }
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            sender: {
                                name: exports.HOTEL_CONFIG.name,
                                email: exports.HOTEL_CONFIG.email,
                            },
                            to: [
                                {
                                    email: exports.HOTEL_CONFIG.adminEmail,
                                    name: 'Recepção Hotel Solar',
                                },
                            ],
                            subject: isPartialCancellation
                                ? "\u26A0\uFE0F Cancelamento Parcial pelo Cliente - Reserva #".concat(shortId)
                                : "\u26A0\uFE0F Cancelamento pelo Cliente - Reserva #".concat(shortId),
                            htmlContent: generateAdminCancellationNotificationHTML(reservation, cancelledItems),
                        }),
                    })];
            case 3:
                hotelEmailResponse = _c.sent();
                if (!hotelEmailResponse.ok) {
                    console.warn('[Email] Aviso: Não foi possível enviar notificação para o hotel');
                }
                else {
                    console.log('[Email] Notificação de cancelamento enviada para hotel:', exports.HOTEL_CONFIG.adminEmail);
                }
                return [2 /*return*/, { success: true }];
            case 4:
                error_5 = _c.sent();
                console.error('[Email] Erro ao enviar e-mails de cancelamento:', error_5);
                return [2 /*return*/, { success: false, error: "Erro ao enviar e-mails: ".concat(error_5) }];
            case 5: return [2 /*return*/];
        }
    });
}); };
exports.sendClientCancellationEmails = sendClientCancellationEmails;
// Enviar e-mail com dados do Pré-Check-in para a recepção
var sendPreCheckinAdminEmail = function (reservation, formData) { return __awaiter(void 0, void 0, void 0, function () {
    var shortId, htmlContent, response, errData, err_2, _i, _a, companion, err_3, error_6;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 13, , 14]);
                shortId = getShortReservationId(reservation.id);
                htmlContent = "\n<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n</head>\n<body style=\"font-family: sans-serif; padding: 20px; color: #333;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;\">\n    <div style=\"background: #1a3c34; color: #fff; padding: 20px; text-align: center;\">\n      <h2 style=\"margin: 0;\">\uD83D\uDCCB Pr\u00E9-Check-in Realizado</h2>\n      <p style=\"margin: 5px 0 0;\">Reserva #".concat(shortId, "</p>\n    </div>\n    <div style=\"padding: 24px;\">\n      <h3 style=\"color: #1a3c34; border-bottom: 2px solid #d4a853; padding-bottom: 8px;\">Dados da Reserva</h3>\n      <p><strong>H\u00F3spede Principal:</strong> ").concat(reservation.mainGuest.name, "</p>\n      <p><strong>Check-in:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkIn), "</p>\n      <p><strong>Check-out:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(reservation.checkOut), "</p>\n      \n      <h3 style=\"color: #1a3c34; border-bottom: 2px solid #d4a853; padding-bottom: 8px; margin-top: 24px;\">Fichas FNRH (Dados)</h3>\n      \n      <div style=\"background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;\">\n        <p><strong>Nome Completo:</strong> ").concat(formData.nomeCompleto, "</p>\n        <p><strong>Email:</strong> ").concat(formData.email, "</p>\n        <p><strong>Telefone:</strong> ").concat(formData.telefone, "</p>\n        <p><strong>CPF:</strong> ").concat(formData.cpf, "</p>\n        <p><strong>RG:</strong> ").concat(formData.rg, " (").concat(formData.orgaoEmissor, ")</p>\n        <p><strong>Data de Nascimento:</strong> ").concat((0, dateUtils_1.formatDisplayDate)(formData.dataNascimento), "</p>\n        <p><strong>G\u00EAnero:</strong> ").concat(formData.genero, "</p>\n        <p><strong>Profiss\u00E3o:</strong> ").concat(formData.profissao, "</p>\n        <p><strong>Nacionalidade:</strong> ").concat(formData.nacionalidade, "</p>\n      </div>\n      \n      <h4 style=\"margin-bottom: 8px;\">Endere\u00E7o</h4>\n      <p style=\"margin: 4px 0;\">").concat(formData.endereco.logradouro, ", ").concat(formData.endereco.numero, " ").concat(formData.endereco.complemento || '', "</p>\n      <p style=\"margin: 4px 0;\">").concat(formData.endereco.bairro, " - ").concat(formData.endereco.cidade, "/").concat(formData.endereco.estado, "</p>\n      <p style=\"margin: 4px 0;\">CEP: ").concat(formData.endereco.cep, "</p>\n      <p style=\"margin: 4px 0;\">Pa\u00EDs: ").concat(formData.endereco.pais, "</p>\n\n      <h4 style=\"margin-bottom: 8px;\">Dados da Viagem</h4>\n      <p style=\"margin: 4px 0;\"><strong>Motivo:</strong> ").concat(formData.motivoViagem, "</p>\n      <p style=\"margin: 4px 0;\"><strong>Transporte:</strong> ").concat(formData.meioTransporte, "</p>\n      ").concat(formData.placaVeiculo ? "<p style=\"margin: 4px 0;\"><strong>Placa:</strong> <span style=\"background:#eab308; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;\">".concat(formData.placaVeiculo, "</span></p>") : '', "\n      <p style=\"margin: 4px 0;\"><strong>Proced\u00EAncia:</strong> ").concat(formData.ultimaProcedencia, "</p>\n      <p style=\"margin: 4px 0;\"><strong>Destino:</strong> ").concat(formData.proximoDestino, "</p>\n\n      ").concat(formData.acompanhantes && formData.acompanhantes.length > 0 ? "\n      <h4 style=\"margin-bottom: 8px; margin-top: 16px; border-top: 1px solid #eee; padding-top: 16px;\">H\u00F3spedes Acompanhantes</h4>\n      <ul style=\"padding-left: 20px; list-style-type: none; padding: 0;\">\n        ".concat(formData.acompanhantes
                    .filter(function (guest) { return guest.nome && guest.nome.trim() !== ''; })
                    .map(function (guest) { return "\n            <li style=\"margin-bottom: 12px; border-bottom: 1px dashed #eee; padding-bottom: 8px;\">\n                <strong>Nome:</strong> ".concat(guest.nome, "<br>\n                <strong>CPF:</strong> ").concat(guest.cpf || '-', "<br>\n                <strong>Nascimento:</strong> ").concat(guest.dataNascimento ? (0, dateUtils_1.formatDisplayDate)(guest.dataNascimento) : '-', "<br>\n                <strong>Email:</strong> ").concat(guest.email || '-', "<br>\n                <strong>Telefone:</strong> ").concat(guest.telefone || '-', "<br>\n                ").concat(!guest.mesmoEndereco && guest.endereco ? "\n                    <div style=\"margin-top:4px; font-size:12px; color:#555;\">\n                        <strong>Endere\u00E7o Diferente:</strong><br>\n                        ".concat(guest.endereco.logradouro || '', ", ").concat(guest.endereco.cidade || '', " - CEP: ").concat(guest.endereco.cep || '', "\n                    </div>\n                ") : '<span style="font-size:12px; color:#888;">(Mesmo endereço do titular)</span>', "\n            </li>\n            "); }).join(''), "\n      </ul>\n      ") : '', "\n\n      <div style=\"margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px;\">\n        <p>Hotel Solar - Sistema de Reservas</p>\n      </div>\n    </div>\n  </div>\n</body>\n</html>\n    ");
                return [4 /*yield*/, fetch('/api/send-email', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            sender: { name: 'Sistema de Reservas', email: exports.HOTEL_CONFIG.email },
                            to: [{ email: exports.HOTEL_CONFIG.adminEmail, name: 'Recepção Hotel Solar' }],
                            subject: "\uD83D\uDCCB Pr\u00E9-Check-in: ".concat(formData.nomeCompleto, " - Ref #").concat(shortId),
                            htmlContent: htmlContent,
                        }),
                    })];
            case 1:
                response = _b.sent();
                if (!!response.ok) return [3 /*break*/, 3];
                return [4 /*yield*/, response.json()];
            case 2:
                errData = _b.sent();
                console.error('[Email] Erro ao enviar pré-check-in:', errData);
                return [2 /*return*/, { success: false, error: 'Falha ao enviar e-mail administrativo.' }];
            case 3:
                _b.trys.push([3, 5, , 6]);
                return [4 /*yield*/, (0, exports.syncContactToBrevo)({
                        name: formData.nomeCompleto,
                        email: formData.email,
                        phone: formData.telefone,
                        birthDate: formData.dataNascimento
                    }, ['HOSPEDE', 'PRE_CHECKIN_OK'])];
            case 4:
                _b.sent();
                console.log('[Brevo] Dados do pré-check-in sincronizados com sucesso.');
                return [3 /*break*/, 6];
            case 5:
                err_2 = _b.sent();
                console.error('[Brevo] Erro ao sincronizar dados do pré-check-in:', err_2);
                return [3 /*break*/, 6];
            case 6:
                if (!(formData.acompanhantes && formData.acompanhantes.length > 0)) return [3 /*break*/, 12];
                console.log('[Brevo] Iniciando sincronização de acompanhantes...');
                _i = 0, _a = formData.acompanhantes;
                _b.label = 7;
            case 7:
                if (!(_i < _a.length)) return [3 /*break*/, 12];
                companion = _a[_i];
                if (!(companion.email && companion.nome)) return [3 /*break*/, 11];
                _b.label = 8;
            case 8:
                _b.trys.push([8, 10, , 11]);
                return [4 /*yield*/, (0, exports.syncContactToBrevo)({
                        name: companion.nome,
                        email: companion.email,
                        phone: companion.telefone || '',
                        birthDate: companion.dataNascimento
                    }, ['HOSPEDE', 'PRE_CHECKIN_OK'])];
            case 9:
                _b.sent();
                console.log("[Brevo] Acompanhante ".concat(companion.nome, " sincronizado."));
                return [3 /*break*/, 11];
            case 10:
                err_3 = _b.sent();
                console.error("[Brevo] Erro ao sincronizar acompanhante ".concat(companion.nome, ":"), err_3);
                return [3 /*break*/, 11];
            case 11:
                _i++;
                return [3 /*break*/, 7];
            case 12: return [2 /*return*/, { success: true }];
            case 13:
                error_6 = _b.sent();
                console.error('Erro ao processar pré-check-in:', error_6);
                return [2 /*return*/, { success: false, error: error_6.message }];
            case 14: return [2 /*return*/];
        }
    });
}); };
exports.sendPreCheckinAdminEmail = sendPreCheckinAdminEmail;
