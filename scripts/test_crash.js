"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var emailService_1 = require("../services/emailService");
var fakeReservation = {
    "id": "2ac3f1a8-6d13-4c90-a123-b5350e282dab",
    "check_in": "2026-03-20",
    "check_out": "2026-03-21",
    "rooms": [{ "name": "LOFT", "priceSnapshot": 1310 }],
    "main_guest": {
        "name": "geraldo barros teste 1",
        "cpf": "52608735215",
        "phone": "telefone é esse",
        "email": "geraldo@hotelsolar.tur.br"
    },
    "additional_guests": [
        { "name": "luiza barros", "cpf": "52608735215" }
    ],
    "extras": [],
    "total_price": 1310,
    "observations": "",
    "payment_method": "PIX"
};
// Format as done in the handler (line 182)
var reservationForEmail = __assign(__assign({}, fakeReservation), { checkIn: fakeReservation.check_in, checkOut: fakeReservation.check_out, mainGuest: fakeReservation.main_guest, additionalGuests: fakeReservation.additional_guests, totalPrice: fakeReservation.total_price, paymentMethod: fakeReservation.payment_method });
try {
    console.log("Testing Client Email");
    (0, emailService_1.generateClientEmailHTML)(reservationForEmail);
    console.log("Success Client");
}
catch (e) {
    console.error("FATAL ERROR", e);
}
