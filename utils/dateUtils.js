"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatesInRange = exports.calculateNights = exports.formatDisplayDateTime = exports.formatDisplayDate = exports.parseISODate = exports.toLocalISO = void 0;
/**
 * Converte um objeto Date para uma string YYYY-MM-DD no fuso horário local.
 */
var toLocalISO = function (date) {
    if (!date || isNaN(date.getTime()))
        return '';
    var tzoffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzoffset).toISOString().split('T')[0];
};
exports.toLocalISO = toLocalISO;
/**
 * Converte uma string YYYY-MM-DD para um objeto Date,
 * evitando problemas de fuso horário ao definir o horário como meio-dia.
 */
var parseISODate = function (isoDate) {
    return new Date("".concat(isoDate, "T12:00:00"));
};
exports.parseISODate = parseISODate;
/**
 * Formata uma data ISO para o padrão brasileiro DD/MM/YYYY.
 */
var formatDisplayDate = function (isoDate) {
    if (!isoDate)
        return '---';
    var dateStr = typeof isoDate === 'object' ? isoDate.toISOString() : isoDate;
    // Se for um timestamp completo (com T) ou um objeto Date, usa toLocaleDateString direto
    if (dateStr.includes('T')) {
        return new Date(dateStr).toLocaleDateString('pt-BR');
    }
    return (0, exports.parseISODate)(dateStr).toLocaleDateString('pt-BR');
};
exports.formatDisplayDate = formatDisplayDate;
/**
 * Formata um timestamp ISO para DD/MM/YYYY às HH:mm.
 */
var formatDisplayDateTime = function (isoTimestamp) {
    if (!isoTimestamp)
        return '---';
    var date = typeof isoTimestamp === 'string' ? new Date(isoTimestamp) : isoTimestamp;
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};
exports.formatDisplayDateTime = formatDisplayDateTime;
/**
 * Calcula a diferença em noites entre duas datas ISO.
 */
var calculateNights = function (checkIn, checkOut) {
    if (!checkIn || !checkOut)
        return 0;
    var start = (0, exports.parseISODate)(checkIn);
    var end = (0, exports.parseISODate)(checkOut);
    var diff = end.getTime() - start.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};
exports.calculateNights = calculateNights;
/**
 * Retorna uma lista de strings ISO para cada dia entre start e end (inclusive).
 */
var getDatesInRange = function (startDate, endDate) {
    var dates = [];
    var current = (0, exports.parseISODate)(startDate);
    var end = (0, exports.parseISODate)(endDate);
    while (current <= end) {
        dates.push((0, exports.toLocalISO)(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
};
exports.getDatesInRange = getDatesInRange;
