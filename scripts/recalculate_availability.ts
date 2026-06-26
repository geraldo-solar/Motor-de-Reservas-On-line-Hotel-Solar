import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key in env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

interface PhysicalRoom {
  id: string;
  number: string;
  category_id: string;
  categoryName?: string;
}

async function main() {
  console.log("Loading room types, categories and physical rooms...");
  
  // 1. Fetch Room Types
  const { data: roomTypesData, error: rtErr } = await supabase
    .from('room_types')
    .select('id, name, total_quantity, base_price, overrides');
    
  if (rtErr || !roomTypesData) {
    console.error("Error fetching room types:", rtErr);
    return;
  }
  const roomTypes: RoomType[] = roomTypesData;
  const roomTypesByName = new Map<string, RoomType>();
  roomTypes.forEach(rt => roomTypesByName.set(rt.name, rt));
  
  console.log(`Loaded ${roomTypes.length} room types.`);

  // 2. Fetch Room Categories
  const { data: categoriesData, error: catErr } = await supabase
    .from('room_categories')
    .select('id, name');
    
  if (catErr || !categoriesData) {
    console.error("Error fetching room categories:", catErr);
    return;
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
    console.error("Error fetching physical rooms:", prErr);
    return;
  }
  
  const physicalRoomsMap: Record<string, { number: string; categoryName: string }> = {};
  physicalRoomsData.forEach((room: any) => {
    const categoryName = categoryMap[room.category_id] || "";
    physicalRoomsMap[room.id] = {
      number: room.number,
      categoryName: categoryName
    };
  });
  
  console.log(`Loaded ${physicalRoomsData.length} physical rooms.`);

  // 4. Fetch All Reservations from 2026-06-01 onwards
  const startDateStr = "2026-06-01";
  const endDateStr = "2027-12-31";
  
  console.log(`Fetching active reservations between ${startDateStr} and ${endDateStr}...`);
  const { data: reservationsData, error: resErr } = await supabase
    .from('reservations')
    .select('id, check_in, check_out, rooms, status')
    .gte('check_out', startDateStr)
    .lte('check_in', endDateStr);

  if (resErr || !reservationsData) {
    console.error("Error fetching reservations:", resErr);
    return;
  }
  
  const reservations: Reservation[] = reservationsData;
  console.log(`Loaded ${reservations.length} reservations in range.`);

  // Filter out canceled or inactive statuses
  const inactiveStatuses = new Set(['canceled', 'cancellation', 'no_show', 'no-show', 'noshow', 'draft']);
  const activeReservations = reservations.filter(res => {
    if (!res.status) return true;
    const statusLower = res.status.toLowerCase();
    return !inactiveStatuses.has(statusLower);
  });
  
  console.log(`Found ${activeReservations.length} active/blocking reservations.`);

  // 5. Calculate occupancy per room type per date
  // Map of roomTypeName -> date -> occupiedCount
  const occupancyMap: Record<string, Record<string, number>> = {};
  roomTypes.forEach(rt => {
    occupancyMap[rt.name] = {};
  });

  // Helper to resolve room type name
  function resolveRoomTypeName(roomEntry: RoomEntry): string | null {
    const name = roomEntry.name ? roomEntry.name.trim() : '';
    const id = roomEntry.id ? roomEntry.id.trim() : '';
    
    // Check direct name match
    if (roomTypesByName.has(name)) {
      return name;
    }
    
    // Check direct ID match
    if (idToRoomType[id.toLowerCase()]) {
      return idToRoomType[id.toLowerCase()];
    }
    
    // Check if ID matches a room type UUID
    const roomTypeByUuid = roomTypes.find(rt => rt.id === id);
    if (roomTypeByUuid) {
      return roomTypeByUuid.name;
    }
    
    // Check if ID matches a physical room ID
    if (physicalRoomsMap[id]) {
      const catName = physicalRoomsMap[id].categoryName;
      if (categoryToRoomType[catName]) {
        return categoryToRoomType[catName];
      }
    }
    
    // Check name normalized for physical rooms (e.g. "Quarto A101" -> "A101")
    const normName = name.replace(/^(Quarto|Apto|Apartamento|Room)\s*/i, '').replace(/[-\s]/g, '').toUpperCase();
    const physicalRoom = Object.values(physicalRoomsMap).find(r => r.number.replace(/[-\s]/g, '').toUpperCase() === normName);
    if (physicalRoom) {
      const catName = physicalRoom.categoryName;
      if (categoryToRoomType[catName]) {
        return categoryToRoomType[catName];
      }
    }

    // Fallback to substring match
    for (const catName of Object.keys(categoryToRoomType)) {
      if (name.toLowerCase().includes(catName.toLowerCase())) {
        return categoryToRoomType[catName];
      }
    }

    return null;
  }

  let unmappedCount = 0;

  activeReservations.forEach(res => {
    if (!res.rooms || !Array.isArray(res.rooms)) return;
    
    res.rooms.forEach(roomEntry => {
      const roomTypeName = resolveRoomTypeName(roomEntry);
      if (!roomTypeName) {
        console.warn(`Could not resolve room type for: ${JSON.stringify(roomEntry)} in reservation ${res.id}`);
        unmappedCount++;
        return;
      }
      
      // Parse check-in and check-out to date range (excluding check-out day)
      const start = new Date(res.check_in + 'T12:00:00');
      const end = new Date(res.check_out + 'T12:00:00');
      
      const current = new Date(start);
      while (current < end) {
        const dateIso = current.toISOString().split('T')[0];
        
        // Only count within our range
        if (dateIso >= startDateStr && dateIso <= endDateStr) {
          occupancyMap[roomTypeName][dateIso] = (occupancyMap[roomTypeName][dateIso] || 0) + 1;
        }
        
        current.setDate(current.getDate() + 1);
      }
    });
  });

  console.log(`Occupancy calculation done. Unmapped room entries count: ${unmappedCount}`);

  // 6. Generate the set of dates in the range to update overrides
  const rangeStart = new Date(startDateStr + 'T12:00:00');
  const rangeEnd = new Date(endDateStr + 'T12:00:00');
  const allDatesInRange: string[] = [];
  
  let d = new Date(rangeStart);
  while (d <= rangeEnd) {
    allDatesInRange.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }

  // 7. Update each room type
  for (const rt of roomTypes) {
    const datesOccupied = occupancyMap[rt.name] || {};
    const existingOverrides = Array.isArray(rt.overrides) ? rt.overrides : [];
    
    // We will keep overrides that are outside the date range [startDateStr, endDateStr]
    let newOverrides = existingOverrides.filter((ov: any) => {
      return ov.dateIso < startDateStr || ov.dateIso > endDateStr;
    });

    // For dates within the range, we recalculate or add overrides
    allDatesInRange.forEach(date => {
      const occupied = datesOccupied[date] || 0;
      const availableQuantity = Math.max(0, rt.total_quantity - occupied);
      
      // Find if there was an existing override for this date
      const existingOv = existingOverrides.find((ov: any) => ov.dateIso === date);
      
      if (existingOv) {
        // Keep it and update availableQuantity
        newOverrides.push({
          ...existingOv,
          availableQuantity: availableQuantity
        });
      } else if (occupied > 0) {
        // If there are bookings and no existing override, we create one
        newOverrides.push({
          dateIso: date,
          price: rt.base_price,
          availableQuantity: availableQuantity
        });
      }
      // If occupied is 0 and no existing override existed, we don't create anything (it defaults to total_quantity)
    });

    // Sort overrides by date for cleaner look
    newOverrides.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    console.log(`Updating ${rt.name} overrides: total overrides ${newOverrides.length} (was ${existingOverrides.length})...`);
    
    const { error: updateErr } = await supabase
      .from('room_types')
      .update({ overrides: newOverrides })
      .eq('id', rt.id);
      
    if (updateErr) {
      console.error(`Error updating overrides for ${rt.name}:`, updateErr);
    } else {
      console.log(`Successfully updated ${rt.name} overrides.`);
    }
  }

  console.log("All overrides synchronized successfully!");
}

main().catch(err => {
  console.error("Fatal error:", err);
});
