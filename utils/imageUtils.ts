/**
 * Converte links do Google Drive e outros formatos em links diretos de imagem
 */
export const getPublicImageUrl = (url: string): string => {
    if (!url) return '';

    const trimmedUrl = url.trim();

    // Se já for uma imagem base64 ou caminho local, retorna como está
    if (trimmedUrl.startsWith('data:image') || trimmedUrl.startsWith('/')) return trimmedUrl;

    // Se for Google Drive (drive.google, docs.google, drive.usercontent)
    if (trimmedUrl.includes('google.com')) {
        let fileId = '';

        // Padrão mais robusto para capturar o ID (33 a 40 chars alfanuméricos com traços e underscores)
        const idRegex = /([a-zA-Z0-9_-]{25,})/;
        const match = trimmedUrl.match(idRegex);

        if (match && match[1]) {
            fileId = match[1];

            // Verifica se o ID capturado não é uma palavra comum da URL
            if (['sharing', 'view', 'edit', 'drive', 'file', 'folders', 'preview'].includes(fileId.toLowerCase())) {
                // Tenta capturar novamente excluindo o que já pegou
                const secondaryMatch = trimmedUrl.substring(trimmedUrl.indexOf(fileId) + fileId.length).match(idRegex);
                if (secondaryMatch) fileId = secondaryMatch[1];
            }

            // O formato thumbnail é mais robusto e menos propenso a bloqueios de hotlinking/CORS do que o lh3 direto.
            // sz=w2000 garante uma boa resolu  o (até 2000px de largura).
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
        }
    }

    return trimmedUrl;
};
