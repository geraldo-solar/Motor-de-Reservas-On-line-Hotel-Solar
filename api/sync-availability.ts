import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Map of room category name (from ERP/rooms table) to room type name (from booking site/room_types table)
const categoryToRoomType: Record<string, string> = {
  "Varanda Térreo": "Suíte Varanda Térreo",
  "LOFT": "LOFT",
  "Suíte Casal": "Suíte Casal",
  "Suíte Triplo": "Suíte Triplo",
  "Suíte Quádruplo": "Suíte Quádruplo",
  "Suíte Sacada Vista Mar": "Suíte Sacada Vista Mar",
  "Bloco A (Quádruplo)": "Suíte Quádruplo",
  "Bloco A (Varanda Térreo)": "Suíte Varanda Térreo",
  "Bloco B (Triplo)": "Suíte Triplo",
  "Bloco B (Sacada Vista Mar)": "Suíte Sacada Vista Mar",
  "Bloco C (Casal)": "Suíte Casal"
};

// Map of direct IDs to room type name
const idToRoomType: Record<string, string> = {
  "suite-casal": "Suíte Casal",
  "suite-triplo": "Suíte Triplo",
  "suite-sacada-vista-mar": "Suíte Sacada Vista Mar",
  "suite-quadruplo": "Suíte Quádruplo",
  "suite-varanda-terreo": "Suíte Varanda Térreo",
  "loft": "LOFT"
};

interface RoomEntry {
  id?: string;
  name?: string;
  priceSnapshot?: number;
}

interface Reservation {
  id: string;
  check_in: string;
  check_out: string;
  rooms: RoomEntry[];
  status: string;
}

interface RoomType {
  id: string;
  name: string;
  total_quantity: number;
  base_price: number;
  overrides: any[];
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    // Configure CORS
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseKey) {
        return response.status(500).json({ error: 'Server misconfiguration: Supabase credentials missing' });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch Room Types
        const { data: roomTypesData, error: rtErr } = await supabase
          .from('room_types')
          .select('id, name, total_quantity, base_price, overrides');
          
        if (rtErr || !roomTypesData) {
          throw new Error(`Failed to fetch room types: ${rtErr?.message}`);
        }
        const roomTypes: RoomType[] = roomTypesData;
        const roomTypesByName = new Map<string, RoomType>();
        roomTypes.forEach(rt => roomTypesByName.set(rt.name, rt));

        // 2. Fetch Room Categories
        const { data: categoriesData, error: catErr } = await supabase
          .from('room_categories')
          .select('id, name');
          
        if (catErr || !categoriesData) {
          throw new Error(`Failed to fetch room categories: ${catErr?.message}`);
        }
        const categoryMap: Record<string, string> = {};
        categoriesData.forEach((cat: any) => {
          categoryMap[cat.id] = cat.name;
        });

        // 3. Fetch Physical Rooms
        const { data: physicalRoomsData, error: prErr } = await supabase
          .from('rooms')
          .select('id, number, category_id');
          
        if (prErr || !physicalRoomsData) {
          throw new Error(`Failed to fetch physical rooms: ${prErr?.message}`);
        }
        
        const physicalRoomsMap: Record<string, { number: string; categoryName: string }> = {};
        physicalRoomsData.forEach((room: any) => {
          const categoryName = categoryMap[room.category_id] || "";
          physicalRoomsMap[room.id] = {
            number: room.number,
            categoryName: categoryName
          };
        });

        // 4. Fetch All Reservations from 2026-06-01 to 2027-12-31
        const startDateStr = "2026-06-01";
        const endDateStr = "2027-12-31";
        
        const { data: reservationsData, error: resErr } = await supabase
          .from('reservations')
          .select('id, check_in, check_out, rooms, status')
          .gte('check_out', startDateStr)
          .lte('check_in', endDateStr);

        if (resErr || !reservationsData) {
          throw new Error(`Failed to fetch reservations: ${resErr?.message}`);
        }
        
        const reservations: Reservation[] = reservationsData;

        // Filter out canceled or inactive statuses
        const inactiveStatuses = new Set(['canceled', 'cancellation', 'no_show', 'no-show', 'noshow', 'draft']);
        const activeReservations = reservations.filter(res => {
          if (!res.status) return true;
          const statusLower = res.status.toLowerCase();
          return !inactiveStatuses.has(statusLower);
        });

        // 5. Calculate occupancy per room type per date
        const occupancyMap: Record<string, Record<string, number>> = {};
        roomTypes.forEach(rt => {
          occupancyMap[rt.name] = {};
        });

        // Helper to resolve room type name
        function resolveRoomTypeName(roomEntry: RoomEntry): string | null {
          const name = roomEntry.name ? roomEntry.name.trim() : '';
          const id = roomEntry.id ? roomEntry.id.trim() : '';
          
          if (roomTypesByName.has(name)) {
            return name;
          }
          if (idToRoomType[id.toLowerCase()]) {
            return idToRoomType[id.toLowerCase()];
          }
          const roomTypeByUuid = roomTypes.find(rt => rt.id === id);
          if (roomTypeByUuid) {
            return roomTypeByUuid.name;
          }
          if (physicalRoomsMap[id]) {
            const catName = physicalRoomsMap[id].categoryName;
            if (categoryToRoomType[catName]) {
              return categoryToRoomType[catName];
            }
          }
          const normName = name.replace(/^(Quarto|Apto|Apartamento|Room)\s*/i, '').replace(/[-\s]/g, '').toUpperCase();
          const physicalRoom = Object.values(physicalRoomsMap).find(r => r.number.replace(/[-\s]/g, '').toUpperCase() === normName);
          if (physicalRoom) {
            const catName = physicalRoom.categoryName;
            if (categoryToRoomType[catName]) {
              return categoryToRoomType[catName];
            }
          }
          for (const catName of Object.keys(categoryToRoomType)) {
            if (name.toLowerCase().includes(catName.toLowerCase())) {
              return categoryToRoomType[catName];
            }
          }
          return null;
        }

        activeReservations.forEach(res => {
          if (!res.rooms || !Array.isArray(res.rooms)) return;
          
          res.rooms.forEach(roomEntry => {
            const roomTypeName = resolveRoomTypeName(roomEntry);
            if (!roomTypeName) return;
            
            const start = new Date(res.check_in + 'T12:00:00');
            const end = new Date(res.check_out + 'T12:00:00');
            
            const current = new Date(start);
            while (current < end) {
              const dateIso = current.toISOString().split('T')[0];
              if (dateIso >= startDateStr && dateIso <= endDateStr) {
                occupancyMap[roomTypeName][dateIso] = (occupancyMap[roomTypeName][dateIso] || 0) + 1;
              }
              current.setDate(current.getDate() + 1);
            }
          });
        });

        // 6. Generate dates range array
        const rangeStart = new Date(startDateStr + 'T12:00:00');
        const rangeEnd = new Date(endDateStr + 'T12:00:00');
        const allDatesInRange: string[] = [];
        
        let d = new Date(rangeStart);
        while (d <= rangeEnd) {
          allDatesInRange.push(d.toISOString().split('T')[0]);
          d.setDate(d.getDate() + 1);
        }

        // 7. Update each room type overrides in Database
        const updatedSummary = [];

        for (const rt of roomTypes) {
          const datesOccupied = occupancyMap[rt.name] || {};
          const existingOverrides = Array.isArray(rt.overrides) ? rt.overrides : [];
          
          let newOverrides = existingOverrides.filter((ov: any) => {
            return ov.dateIso < startDateStr || ov.dateIso > endDateStr;
          });

          allDatesInRange.forEach(date => {
            const occupied = datesOccupied[date] || 0;
            const availableQuantity = Math.max(0, rt.total_quantity - occupied);
            
            const existingOv = existingOverrides.find((ov: any) => ov.dateIso === date);
            
            if (existingOv) {
              newOverrides.push({
                ...existingOv,
                availableQuantity: availableQuantity
              });
            } else if (occupied > 0) {
              newOverrides.push({
                dateIso: date,
                price: rt.base_price,
                availableQuantity: availableQuantity
              });
            }
          });

          newOverrides.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

          const { error: updateErr } = await supabase
            .from('room_types')
            .update({ overrides: newOverrides })
            .eq('id', rt.id);
            
          if (updateErr) {
            throw new Error(`Failed to update ${rt.name}: ${updateErr.message}`);
          }
          
          updatedSummary.push({
            name: rt.name,
            totalOverrides: newOverrides.length
          });
        }

        return response.status(200).json({
            success: true,
            activeReservations: activeReservations.length,
            updatedSummary
        });
        
    } catch (error: any) {
        console.error('Availability Sync Error:', error);
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
