import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type PackageRecord = {
  name?: string;
  image_url?: string;
  description?: string;
  start_iso_date?: string;
  active?: boolean;
};

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getPackageCode = (pkg: PackageRecord): string | null => {
  const name = normalize(pkg.name || '');
  const start = String(pkg.start_iso_date || '');
  if (name.includes('independencia')) return 'INDEPENDENCIA';
  if (name.includes('crianca')) return 'CRIANCAS';
  if (name.includes('finados')) return 'FINADOS';
  if (name.includes('ostrabeach')) return 'OSTRABEACH';
  if (name.includes('natal') && name.includes('reveillon')) return 'NATAL_REVEILLON';
  if (name.includes('reveillon') && start.endsWith('-12-31')) return 'REVEILLON';
  if (name.includes('natal')) return 'NATAL';
  return null;
};

const parsePackageCode = (value: unknown): string | null => {
  const raw = String(value || '').trim().toUpperCase();
  const code = raw.startsWith('PACKAGE|') ? raw.split('|')[1] : raw;
  return ['INDEPENDENCIA', 'CRIANCAS', 'FINADOS', 'OSTRABEACH', 'NATAL_REVEILLON', 'NATAL', 'REVEILLON'].includes(code)
    ? code
    : null;
};

const parsePackageId = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  const id = raw.toUpperCase().startsWith('PACKAGE_ID|') ? raw.slice('PACKAGE_ID|'.length) : raw;
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ? id : null;
};

const findPackageByCode = (packages: PackageRecord[], code: string) =>
  packages.find(pkg => pkg.active !== false && getPackageCode(pkg) === code);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const reference = req.body?.package_request || req.body?.quote_request;
  const packageId = parsePackageId(reference);
  const code = parsePackageCode(reference);
  if ((!packageId && !code) || !supabaseUrl || !supabaseKey) {
    return res.status(400).json({ error: 'Invalid package request or missing configuration.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: packages, error } = await supabase.from('packages').select('*').eq('active', true);
  if (error) return res.status(500).json({ error: error.message });

  const pkg = packageId
    ? (packages || []).find(item => String(item.id) === packageId)
    : findPackageByCode(packages || [], code!);
  if (!pkg) return res.status(404).json({ error: 'Active package not found.' });

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'reservas.hotelsolar.tur.br';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const imageUrl = `${protocol}://${host}/api/package-image?code=${encodeURIComponent(String(reference))}`;
  const responseText = String(req.body?.response_text || '').trim();
  const fallbackText = `🎉 ${pkg.name}\n${pkg.description || ''}`.trim();

  return res.status(200).json({
    version: 'v2',
    content: {
      type: 'whatsapp',
      messages: [
        ...(pkg.image_url ? [{ type: 'image', url: imageUrl }] : []),
        { type: 'text', text: responseText || fallbackText },
      ],
      actions: [],
      quick_replies: [],
    },
  });
}
