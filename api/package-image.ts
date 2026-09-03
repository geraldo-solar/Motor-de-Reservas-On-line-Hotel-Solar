import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type PackageRecord = {
  name?: string;
  image_url?: string;
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

const toDirectImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes('google.com')) return trimmed;

  const match = trimmed.match(/([a-zA-Z0-9_-]{25,})/);
  return match?.[1]
    ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`
    : trimmed;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  const reference = req.query.code;
  const packageId = parsePackageId(reference);
  const code = parsePackageCode(reference);
  if ((!packageId && !code) || !supabaseUrl || !supabaseKey) {
    return res.status(400).json({ error: 'Invalid package reference or missing configuration.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: packages, error } = await supabase.from('packages').select('*').eq('active', true);
  if (error) return res.status(500).json({ error: error.message });

  const pkg = packageId
    ? (packages || []).find(item => String(item.id) === packageId)
    : findPackageByCode(packages || [], code!);
  if (!pkg?.image_url) return res.status(404).json({ error: 'Package image not found.' });

  try {
    const image = pkg.image_url.trim();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    if (image.startsWith('data:image/')) {
      const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (!match) return res.status(422).json({ error: 'Invalid embedded image.' });
      res.setHeader('Content-Type', match[1]);
      return res.status(200).send(Buffer.from(match[2], 'base64'));
    }

    const imageUrl = image.startsWith('/')
      ? `https://reservas.hotelsolar.tur.br${image}`
      : toDirectImageUrl(image);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(502).json({ error: 'Unable to load package image.' });
    }

    res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'image/jpeg');
    return res.status(200).send(Buffer.from(await imageResponse.arrayBuffer()));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
