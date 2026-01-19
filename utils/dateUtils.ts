/**
 * Converte um objeto Date para uma string YYYY-MM-DD no fuso horário local.
 */
export const toLocalISO = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/**
 * Converte uma string YYYY-MM-DD para um objeto Date, 
 * evitando problemas de fuso horário ao definir o horário como meio-dia.
 */
export const parseISODate = (isoDate: string): Date => {
    return new Date(`${isoDate}T12:00:00`);
};

/**
 * Formata uma data ISO para o padrão brasileiro DD/MM/YYYY.
 */
export const formatDisplayDate = (isoDate: string): string => {
    if (!isoDate) return '---';
    // Se for um timestamp completo (com T), trata diferente do YYYY-MM-DD puro
    if (isoDate.includes('T')) {
        return new Date(isoDate).toLocaleDateString('pt-BR');
    }
    return parseISODate(isoDate).toLocaleDateString('pt-BR');
};

/**
 * Formata um timestamp ISO para DD/MM/YYYY às HH:mm.
 */
export const formatDisplayDateTime = (isoTimestamp: string | Date): string => {
    if (!isoTimestamp) return '---';
    const date = typeof isoTimestamp === 'string' ? new Date(isoTimestamp) : isoTimestamp;
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Calcula a diferença em noites entre duas datas ISO.
 */
export const calculateNights = (checkIn: string, checkOut: string): number => {
    if (!checkIn || !checkOut) return 0;
    const start = parseISODate(checkIn);
    const end = parseISODate(checkOut);
    const diff = end.getTime() - start.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

/**
 * Retorna uma lista de strings ISO para cada dia entre start e end (inclusive).
 */
export const getDatesInRange = (startDate: string, endDate: string): string[] => {
    const dates: string[] = [];
    let current = parseISODate(startDate);
    const end = parseISODate(endDate);

    while (current <= end) {
        dates.push(toLocalISO(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
};
