/**
 * Tenta converter um valor para um array de forma segura.
 * Lida com strings JSON, nulos e valores que já são arrays.
 */
export const safeArray = <T>(val: any): T[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            // Se não for JSON válido, talvez seja uma string simples ou CSV?
            // Por segurança, retorna array vazio ou tenta quebrar por vírgula se fizer sentido
            return [];
        }
    }
    return [];
};

/**
 * Tenta converter um valor para um objeto de forma segura.
 */
export const safeObject = <T>(val: any, defaultValue: T): T => {
    if (!val) return defaultValue;
    if (typeof val === 'object' && !Array.isArray(val)) return val as T;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return (typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }
    return defaultValue;
};
