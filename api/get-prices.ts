import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { checkIn, checkOut, guests } = req.body;

  if (!checkIn || !checkOut) {
    return res.status(400).json({ error: 'Missing checkIn or checkOut dates.' });
  }

  try {
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    
    // Calcula o número de diárias
    const diffTime = Math.abs(co.getTime() - ci.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
    }

    // Busca quartos e pacotes do Supabase
    const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
    const { data: packages } = await supabase.from('packages').select('*').eq('active', true);

    if (!rooms) {
      return res.status(500).json({ error: 'Failed to fetch rooms from Supabase.' });
    }

    // Verifica se algum pacote ativo casa exatamente com as datas pesquisadas
    const activePackage = packages?.find(p => p.start_iso_date === checkIn && p.end_iso_date === checkOut);

    let summaryText = `Orçamento para ${nights} ${nights === 1 ? 'diária' : 'diárias'} (${checkIn} a ${checkOut}):\n\n`;
    let availableCount = 0;

    for (const room of rooms) {
      // Filtragem por capacidade se quiser restrição forte, mas como o Assistente já sabe, ele pode lidar com isso.
      // let capacity = room.capacity || 2;
      // if (guests && guests > capacity) continue;

      let total = 0;
      let isAvailable = true;
      let reason = '';
      
      const current = new Date(ci);
      
      // Checa restrição de checkin (no primeiro dia)
      const ciIso = current.toISOString().split('T')[0];
      const ciOverride = room.overrides?.find((o: any) => o.dateIso === ciIso);
      if (ciOverride?.noCheckIn || ciOverride?.isClosed) {
          isAvailable = false;
          reason = 'Fechado para Check-in nessa data';
      }

      for (let i = 0; i < nights; i++) {
        const iso = current.toISOString().split('T')[0];
        const override = room.overrides?.find((o: any) => o.dateIso === iso);
        
        if (override?.isClosed) {
          isAvailable = false;
          reason = 'Esgotado em uma das datas';
          break;
        }

        const availableQty = override?.availableQuantity !== undefined ? override.availableQuantity : room.totalQuantity;
        if (availableQty <= 0) {
          isAvailable = false;
          reason = 'Esgotado em uma das datas';
          break;
        }

        total += override?.price !== undefined ? override.price : room.base_price;
        
        // avança o dia
        current.setDate(current.getDate() + 1);
      }

      if (isAvailable) {
        // Aplica o desconto do pacote se houver
        let finalPrice = total;
        if (activePackage && activePackage.discount_percentage) {
            finalPrice = total * (1 - (activePackage.discount_percentage / 100));
        }
        
        // Verifica restrição de checkout no último dia
        const coIso = co.toISOString().split('T')[0];
        const coOverride = room.overrides?.find((o: any) => o.dateIso === coIso);
        if (coOverride?.noCheckOut) {
            isAvailable = false;
            reason = 'Check-out restrito nessa data';
        }

        if (isAvailable) {
            summaryText += `- **${room.name}** (Até ${room.capacity} pessoas): R$ ${Math.round(finalPrice).toLocaleString('pt-BR')} total.\n`;
            availableCount++;
        }
      }
    }

    if (availableCount === 0) {
      summaryText += "Não há quartos disponíveis para este período.";
    }

    const safeSummary = summaryText.replace(/\n/g, " ||| ");

    return res.status(200).json({ 
        message: 'Success', 
        prices_summary: safeSummary,
        discount_applied: activePackage ? true : false,
        package_name: activePackage ? activePackage.name : null
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
