/**
 * Converte links do Google Drive e outros formatos em links diretos de imagem
 */
export const getPublicImageUrl = (url: string): string => {
    if (!url) return '';

    const trimmedUrl = url.trim();

    // Se já for uma imagem base64, retorna como está
    if (trimmedUrl.startsWith('data:image')) return trimmedUrl;

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

            // O formato /d/ID é o mais estável para evitar bloqueios de Referer e CORS do Drive antigo
            // Ele aponta para o servidor de arquivos estáticos do Google.
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
    }

    return trimmedUrl;
};
