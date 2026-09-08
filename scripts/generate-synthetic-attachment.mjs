import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Synthetic public smoke-test material only. No bank, customer or real transaction data.
const directory = fileURLToPath(new URL('../public/fixtures/', import.meta.url));
const output = fileURLToPath(new URL('../public/fixtures/synthetic-attachment-receipt.png', import.meta.url));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1240" viewBox="0 0 1080 1240">
  <rect width="1080" height="1240" fill="#f1f5f9"/>
  <rect x="60" y="60" width="960" height="1120" rx="28" fill="white" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="60" y="60" width="960" height="170" rx="28" fill="#7f1d1d"/>
  <rect x="60" y="170" width="960" height="60" fill="#7f1d1d"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="#0f172a">
    <text x="540" y="132" text-anchor="middle" fill="white" font-size="39" font-weight="700">TESTE SEM VALOR FINANCEIRO</text>
    <text x="540" y="185" text-anchor="middle" fill="white" font-size="27">Documento inteiramente fictício</text>
    <text x="115" y="316" font-size="47" font-weight="700">Comprovante de pagamento</text>
    <text x="115" y="372" font-size="29" fill="#475569">Simulação de transferência para uma reserva</text>
    <line x1="115" y1="414" x2="965" y2="414" stroke="#cbd5e1" stroke-width="2"/>
    <text x="115" y="477" font-size="26" fill="#475569">OPERAÇÃO ILUSTRATIVA</text>
    <text x="115" y="530" font-size="38" font-weight="700">Transferência fictícia concluída</text>
    <text x="115" y="611" font-size="27" fill="#475569">Valor de exemplo, sem movimentação real</text>
    <text x="115" y="671" font-size="52" font-weight="700">R$ 1,00</text>
    <text x="115" y="752" font-size="26" fill="#475569">PAGADOR FICTÍCIO</text>
    <text x="115" y="799" font-size="34" font-weight="700">Cliente de Teste</text>
    <text x="115" y="871" font-size="26" fill="#475569">DESTINATÁRIO FICTÍCIO</text>
    <text x="115" y="918" font-size="34" font-weight="700">Hotel de Exemplo</text>
    <line x1="115" y1="960" x2="965" y2="960" stroke="#cbd5e1" stroke-width="2"/>
    <text x="115" y="1020" font-size="27" font-weight="700" fill="#991b1b">Nenhum pagamento foi realizado.</text>
    <text x="115" y="1067" font-size="25" fill="#475569">Não comprova saldo, quitação ou reserva.</text>
    <text x="115" y="1110" font-size="25" fill="#475569">Sem banco, conta, CPF, chave Pix ou dado real.</text>
  </g>
</svg>`;

await mkdir(directory, { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
const metadata = await sharp(output).metadata();
if (metadata.format !== 'png' || metadata.width !== 1080 || metadata.height !== 1240) {
  throw new Error('A imagem sintética não foi gerada no formato esperado.');
}
console.log(`Fixture sintética gerada: ${output} (${metadata.width}x${metadata.height}, PNG)`);
