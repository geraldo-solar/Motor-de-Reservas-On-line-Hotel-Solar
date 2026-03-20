import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testHandler(checkIn: string, checkOut: string, guests: number) {
  try {
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    
    // Calcula o número de diárias
    const diffTime = Math.abs(co.getTime() - ci.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      console.log('Error: Check-out date must be after check-in date.');
      return;
    }

    // Busca quartos e pacotes do Supabase
    const { data: rooms, error: roomsError } = await supabase.from('room_types').select('*').eq('active', true);
    const { data: packages, error: packagesError } = await supabase.from('packages').select('*').eq('active', true);

    if (roomsError) {
      console.log('Failed to fetch rooms from Supabase.', roomsError);
      return;
    }

    // Verifica se algum pacote ativo casa exatamente com as datas pesquisadas
    const activePackage = packages?.find(p => p.start_iso_date === checkIn && p.end_iso_date === checkOut);

    let summaryText = `Orçamento para ${nights} ${nights === 1 ? 'diária' : 'diárias'} (${checkIn} a ${checkOut}):\n\n`;
    let availableCount = 0;

    for (const room of rooms) {
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

    console.log(JSON.stringify({ 
        message: 'Success', 
        prices_summary: summaryText,
        discount_applied: activePackage ? true : false,
        package_name: activePackage ? activePackage.name : null
    }, null, 2));

  } catch (error: any) {
    console.error("API Error:", error);
  }
}

testHandler('2026-05-12', '2026-05-15', 2);
