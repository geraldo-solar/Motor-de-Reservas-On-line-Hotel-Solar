import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { roomImages } from '../utils/roomMedia.js';
import sharp from 'sharp';
import {extraCode,extraImage} from '../utils/extraMedia.js';
import {sitePhotoUrl} from '../utils/hotelInfo.js';

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
  const siteImage=sitePhotoUrl(String(reference||''));
  const extraMatch=String(reference||'').match(/^EXTRA_ID\|(BARCO|MESA|LUA|BIKE)(?:\|[A-Z,]*\|(INCLUDED|PAID))?$/);
  const serviceCode=extraMatch?.[1];
  const roomMatch = String(reference || '').match(/^ROOM_ID\|([0-9a-f]{8}-[0-9a-f-]{27,})(?:\|[0-9a-f,-]{1,800})?$/i);
  const roomId = roomMatch?.[1];
  const packageId = parsePackageId(reference);
  const code = parsePackageCode(reference);
  if ((!siteImage && !serviceCode && !roomId && !packageId && !code) || !supabaseUrl || !supabaseKey) {
    return res.status(400).json({ error: 'Invalid package reference or missing configuration.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase.from(serviceCode ? 'extras' : roomId ? 'room_types' : 'packages').select('*').eq('active', true);
  // Embedded photos are large: fetch the requested category, not every gallery.
  if (roomId || packageId) query = query.eq('id', roomId || packageId!);
  const { data: packages, error } = siteImage ? {data:[],error:null} : await query;
  if (error) return res.status(500).json({ error: error.message });

  const pkg = serviceCode ? (packages||[]).find(item=>extraCode(item.name||'')===serviceCode) : roomId
    ? (packages || []).find(item => String(item.id) === roomId)
    : packageId
    ? (packages || []).find(item => String(item.id) === packageId)
    : findPackageByCode(packages || [], code!);
  const selectedImage = siteImage || (serviceCode ? extraImage(pkg,serviceCode) : roomId && pkg ? roomImages(pkg)[0] : pkg?.image_url);
  if (!selectedImage) return res.status(404).json({ error: 'Image not found.' });

  try {
    const image = selectedImage.trim();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const sendImage = async (bytes: Buffer, contentType: string) => {
      if (!siteImage && !roomId && !serviceCode) {
        res.setHeader('Content-Type', contentType);
        return res.status(200).send(bytes);
      }
      // WhatsApp photos must be JPEG/PNG under 5 MB. Never modify the original.
      const optimized = await sharp(bytes, {limitInputPixels: 60_000_000})
        .rotate().resize({width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true})
        .flatten({background: '#ffffff'}).jpeg({quality: 80}).toBuffer();
      if (optimized.length > 4_500_000) return res.status(422).json({error: 'Image exceeds WhatsApp size limit.'});
      res.setHeader('Content-Type', 'image/jpeg');
      return res.status(200).send(optimized);
    };

    if (image.startsWith('data:image/')) {
      const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (!match) return res.status(422).json({ error: 'Invalid embedded image.' });
      return await sendImage(Buffer.from(match[2], 'base64'), match[1]);
    }

    const imageUrl = image.startsWith('/')
      ? `https://reservas.hotelsolar.tur.br${image}`
      : toDirectImageUrl(image);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(502).json({ error: 'Unable to load package image.' });
    }

    return await sendImage(Buffer.from(await imageResponse.arrayBuffer()), imageResponse.headers.get('content-type') || 'image/jpeg');
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
