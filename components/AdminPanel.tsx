import React, { useState, useEffect, useRef } from 'react';
import {
  LogOut, Grid, BedDouble, Ticket, ShoppingBag,
  Tag, Settings, Loader2, MessageSquare, Menu, X, RefreshCw
} from 'lucide-react';
import { Room, HolidayPackage, DiscountCode, ExtraService, Reservation, HotelConfig, RoomDateOverride, ReservationStatus } from '../types';
import { toLocalISO } from '../utils/dateUtils';

// Novas sub-componentes modulares
import { InventoryMap } from './admin/InventoryMap';
import { RoomsManagement } from './admin/RoomsManagement';
import { PackagesManagement } from './admin/PackagesManagement';
import { ExtrasManagement } from './admin/ExtrasManagement';
import { DiscountsManagement } from './admin/DiscountsManagement';
import { ReservationsList } from './admin/ReservationsList';
import { SettingsManagement } from './admin/SettingsManagement';

// Modais
import { RoomEditorModal } from './admin/RoomEditorModal';
import { PackageEditorModal } from './admin/PackageEditorModal';
import { ExtraEditorModal } from './admin/ExtraEditorModal';
import { DiscountEditorModal } from './admin/DiscountEditorModal';
import { ReservationDetailModal } from './admin/ReservationDetailModal';
import { AdminLogin } from './admin/AdminLogin';

export { AdminLogin };

interface AdminPanelProps {
  rooms: Room[];
  packages: HolidayPackage[];
  discounts: DiscountCode[];
  extras: ExtraService[];
  config: HotelConfig;
  reservations: Reservation[];
  onUpdateRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  onUpdatePackages: React.Dispatch<React.SetStateAction<HolidayPackage[]>>;
  onUpdateDiscounts: React.Dispatch<React.SetStateAction<DiscountCode[]>>;
  onUpdateExtras: React.Dispatch<React.SetStateAction<ExtraService[]>>;
  onUpdateConfig: (config: HotelConfig) => void;
  onUpdateReservationStatus: (id: string, status: string, reason?: string) => Promise<boolean>;
  onUpsertRoom: (room: Room) => Promise<boolean>;
  onUpsertRooms: (rooms: Room[]) => Promise<boolean>;
  onDeleteRoom: (roomId: string) => Promise<boolean>;
  onUpsertPackage: (pkg: HolidayPackage) => Promise<boolean>;
  onDeletePackage: (id: string) => Promise<boolean>;
  onUpsertExtra: (extra: ExtraService) => Promise<boolean>;
  onDeleteExtra: (id: string) => Promise<boolean>;
  onUpsertDiscount: (discount: DiscountCode) => Promise<boolean>;
  onDeleteDiscount: (code: string) => Promise<boolean>;
  isSaving: boolean;
  onRefreshData: () => Promise<boolean>;
  onLogout: () => void;
}

type AdminTab = 'MAP' | 'ROOMS' | 'PACKAGES' | 'RESERVATIONS' | 'EXTRAS' | 'DISCOUNTS' | 'SETTINGS';



export const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const {
    rooms, packages, discounts, extras, config, reservations,
    onUpdateRooms, onUpdatePackages, onUpdateDiscounts, onUpdateExtras, onUpdateConfig,
    onUpdateReservationStatus, onUpsertRoom, onUpsertRooms, onDeleteRoom,
    onUpsertPackage, onDeletePackage, onUpsertExtra, onDeleteExtra,
    onUpsertDiscount, onDeleteDiscount, isSaving, onLogout, onRefreshData
  } = props;

  const [activeTab, setActiveTab] = useState<AdminTab>('RESERVATIONS');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // States para Modais
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<HolidayPackage | null>(null);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [selectedExtra, setSelectedExtra] = useState<ExtraService | null>(null);
  const [isResModalOpen, setIsResModalOpen] = useState(false);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<DiscountCode | null>(null);

  const mainScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  // Handlers para lógica de persistência que envolve múltiplos itens ou cálculos
  const handleUpdateRoomOverride = async (roomId: string, override: RoomDateOverride) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const existing = room.overrides || [];
    const index = existing.findIndex(o => o.dateIso === override.dateIso);
    const newOverrides = index >= 0 ? existing.map((o, i) => i === index ? override : o) : [...existing, override];
    await onUpsertRoom({ ...room, overrides: newOverrides });
  };

  const handleBulkUpdate = async (startIso: string, endIso: string, roomId: string, selectedDays: number[], updates: Partial<RoomDateOverride> | null, priceOp?: any) => {
    const targetRooms = roomId === 'all' ? rooms.filter(r => r.active) : rooms.filter(r => r.id === roomId);
    const updatedRooms: Room[] = [];

    for (const room of targetRooms) {
      const existing = room.overrides || [];
      const start = new Date(startIso + 'T12:00:00');
      const end = new Date(endIso + 'T12:00:00');
      const newOverrides = [...existing];
      let temp = new Date(start);
      while (temp <= end) {
        if (selectedDays.includes(temp.getDay())) {
          const iso = toLocalISO(temp);
          const index = newOverrides.findIndex(o => o.dateIso === iso);
          const current = index >= 0 ? newOverrides[index] : { dateIso: iso, price: room.price, availableQuantity: room.totalQuantity };
          let finalPrice = current.price;
          if (priceOp) {
            if (priceOp.mode === 'fixed') finalPrice = priceOp.value;
            else if (priceOp.mode === 'inc_pct') finalPrice = Math.round(finalPrice * (1 + priceOp.value / 100));
            else if (priceOp.mode === 'dec_pct') finalPrice = Math.round(finalPrice * (1 - priceOp.value / 100));
          }
          const updatedOverride = { ...current, ...updates, price: finalPrice };
          if (index >= 0) newOverrides[index] = updatedOverride;
          else newOverrides.push(updatedOverride);
        }
        temp.setDate(temp.getDate() + 1);
      }
      updatedRooms.push({ ...room, overrides: newOverrides });
    }

    if (updatedRooms.length > 0) {
      await onUpsertRooms(updatedRooms);
    }
  };

  const navItems = [
    { id: 'RESERVATIONS', label: 'Reservas', icon: <MessageSquare size={18} /> },
    { id: 'MAP', label: 'Tarifário & Estoque', icon: <Grid size={18} /> },
    { id: 'ROOMS', label: 'Acomodações', icon: <BedDouble size={18} /> },
    { id: 'PACKAGES', label: 'Pacotes', icon: <Ticket size={18} /> },
    { id: 'EXTRAS', label: 'Serviços', icon: <ShoppingBag size={18} /> },
    { id: 'DISCOUNTS', label: 'Cupons', icon: <Tag size={18} /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* Top Navigation Bar */}
      <header className="bg-[#0F2820] text-white shadow-xl sticky top-0 z-[100]">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-20">

            {/* Logo / Title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-solar-gold rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-[#0F2820] font-serif font-black text-lg">S</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="font-serif font-bold text-base tracking-wider text-solar-gold leading-none">Painel Solar</h1>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 mt-1">Management</p>
              </div>
              <div className="flex items-center gap-1 ml-4 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => onRefreshData()}
                  title="Sincronizar Dados do Banco"
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-solar-gold"
                >
                  <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Isso irá limpar todos os dados salvos no navegador e recarregar a página. Continuar?')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  title="Limpar Cache e Recarregar"
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-white/40 hover:text-red-400"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Nav Items (Desktop/Tablet) */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${activeTab === item.id
                    ? 'bg-solar-gold text-solar-green shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Actions & Status */}
            <div className="flex items-center gap-4">
              {isSaving && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 animate-pulse">
                  <Loader2 size={12} className="animate-spin text-solar-gold" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-solar-gold">Sincronizando</span>
                </div>
              )}

              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-white hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                <LogOut size={16} /> Sair
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 text-solar-gold bg-white/5 rounded-lg border border-white/10"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-[#0F2820] border-t border-white/5 p-4 animate-in fade-in slide-in-from-top-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  className={`flex items-center gap-4 px-5 py-4 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === item.id
                    ? 'bg-solar-gold text-solar-green'
                    : 'text-white/60 hover:bg-white/5'
                    }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <div className="sm:col-span-2 border-t border-white/5 mt-2 pt-4 flex items-center justify-between">
                <button onClick={onLogout} className="flex items-center gap-3 px-5 py-4 text-red-400 font-bold uppercase tracking-widest text-[11px]">
                  <LogOut size={18} /> Sair do Sistema
                </button>
                {isSaving && (
                  <div className="flex items-center gap-2 pr-4">
                    <Loader2 size={14} className="animate-spin text-solar-gold" />
                    <span className="text-[10px] font-bold text-solar-gold uppercase tracking-widest">Aguarde...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main ref={mainScrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
        <div className="max-w-[1600px] mx-auto min-h-full">
          {activeTab === 'MAP' && <InventoryMap rooms={rooms} onUpdateRoomOverride={handleUpdateRoomOverride} onBulkUpdate={handleBulkUpdate} isSaving={isSaving} />}
          {activeTab === 'ROOMS' && <RoomsManagement rooms={rooms} onEditRoom={(r) => { setSelectedRoom(r); setIsRoomModalOpen(true); }} onNewRoom={() => { setSelectedRoom(null); setIsRoomModalOpen(true); }} onDeleteRoom={onDeleteRoom} onUpdateRooms={onUpdateRooms} />}
          {activeTab === 'PACKAGES' && <PackagesManagement packages={packages} onEditPackage={(pkg) => { setSelectedPackage(pkg); setIsPackageModalOpen(true); }} onNewPackage={() => { setSelectedPackage(null); setIsPackageModalOpen(true); }} />}
          {activeTab === 'EXTRAS' && <ExtrasManagement extras={extras} onEditExtra={(e) => { setSelectedExtra(e); setIsExtraModalOpen(true); }} onNewExtra={() => { setSelectedExtra(null); setIsExtraModalOpen(true); }} onDeleteExtra={onDeleteExtra} onUpdateExtras={onUpdateExtras} />}
          {activeTab === 'DISCOUNTS' && <DiscountsManagement discounts={discounts} onEditDiscount={(d) => { setSelectedDiscount(d); setIsDiscountModalOpen(true); }} onNewDiscount={() => { setSelectedDiscount(null); setIsDiscountModalOpen(true); }} onDeleteDiscount={onDeleteDiscount} onUpdateDiscounts={onUpdateDiscounts} />}
          {activeTab === 'RESERVATIONS' && <ReservationsList reservations={reservations} onViewDetails={(res) => { setSelectedRes(res); setIsResModalOpen(true); }} />}
          {activeTab === 'SETTINGS' && <SettingsManagement config={config} onUpdateConfig={onUpdateConfig} isSaving={isSaving} />}
        </div>
      </main>

      {/* Modals Containers */}
      <RoomEditorModal isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} room={selectedRoom} onSave={async (r) => {
        const success = await onUpsertRoom(r);
        if (success) setIsRoomModalOpen(false);
      }} />

      <PackageEditorModal isOpen={isPackageModalOpen} onClose={() => { setIsPackageModalOpen(false); setSelectedPackage(null); }} pkg={selectedPackage} rooms={rooms} onSave={async (p) => {
        const success = await onUpsertPackage(p);
        if (success) setIsPackageModalOpen(false);
      }} onDelete={async (p) => {
        const success = await onDeletePackage(p.id);
        if (success) {
          setIsPackageModalOpen(false);
        }
      }} />

      <ExtraEditorModal isOpen={isExtraModalOpen} onClose={() => setIsExtraModalOpen(false)} extra={selectedExtra} onSave={async (e) => {
        const success = await onUpsertExtra(e);
        if (success) setIsExtraModalOpen(false);
      }} />

      <DiscountEditorModal
        isOpen={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)} discount={selectedDiscount}
        rooms={rooms}
        onSave={async (d) => {
          if (selectedDiscount && selectedDiscount.code !== d.code) {
            // Rename detected: delete old code first to avoid duplicates
            await onDeleteDiscount(selectedDiscount.code);
          }
          const success = await onUpsertDiscount(d);
          if (success) setIsDiscountModalOpen(false);
        }}
        onDelete={async (code) => {
          const success = await onDeleteDiscount(code);
          if (success) setIsDiscountModalOpen(false);
        }}
      />

      <ReservationDetailModal isOpen={isResModalOpen} onClose={() => setIsResModalOpen(false)} reservation={selectedRes} onUpdateStatus={async (id, status, reason) => {
        return await onUpdateReservationStatus(id, status, reason);
      }} />
    </div>
  );
};

export default AdminPanel;