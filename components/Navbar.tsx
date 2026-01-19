import React from 'react';
import { ViewState } from '../types';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface NavbarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  offlineCount: number;
  isOnline: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, offlineCount, isOnline }) => {

  const navItemClass = (view: ViewState) =>
    `cursor-pointer px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm md:text-sm font-semibold transition-all tracking-tight sm:tracking-normal md:tracking-wide whitespace-nowrap border-b-2 ${currentView === view
      ? 'text-solar-gold border-solar-gold'
      : 'text-white/80 border-transparent hover:text-white hover:border-white/30'
    }`;

  const externalLinkClass = `cursor-pointer px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm md:text-sm font-semibold transition-all tracking-tight sm:tracking-normal md:tracking-wide whitespace-nowrap text-white/80 hover:text-white border-b-2 border-transparent hover:border-white/30`;

  return (
    <nav className="bg-solar-green shadow-lg border-b border-white/10 py-2 sm:py-3 md:py-4">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-4">
        <div className="flex flex-col items-center justify-center">

          {/* Linha 1: Logomarca Centralizada - Maior no mobile */}
          <div className="flex flex-col items-center cursor-pointer mb-2 sm:mb-3 md:mb-5 group" onClick={() => onNavigate(ViewState.HOME)}>
            <img
              src="/logo-gold.png"
              alt="Hotel Solar"
              className="h-14 sm:h-14 md:h-16 w-auto group-hover:scale-110 transition-transform duration-500"
            />
            {/* Indicadores Offline/Sync */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/20 text-[10px] sm:text-xs">
                {isOnline ? (
                  <Wifi size={10} className="text-solar-gold" />
                ) : (
                  <WifiOff size={10} className="text-red-400" />
                )}
                <span className={isOnline ? 'text-solar-gold' : 'text-red-400'}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              {offlineCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-solar-gold/20 text-[10px] sm:text-xs animate-pulse">
                  <RefreshCw size={10} className="text-solar-gold animate-spin" />
                  <span className="text-solar-gold font-bold">{offlineCount} SINCRONIZANDO</span>
                </div>
              )}
            </div>
          </div>

          {/* Linha 2: Menu Adaptativo - Texto maior no mobile */}
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-center gap-x-1 sm:gap-x-2 md:gap-x-3">
              <a
                href="https://www.hotelsolar.tur.br/"
                className={externalLinkClass}
              >
                SITE OFICIAL
              </a>
              <button
                onClick={() => onNavigate(ViewState.HOME)}
                className={navItemClass(ViewState.HOME)}
              >
                INÍCIO
              </button>
              <button
                onClick={() => onNavigate(ViewState.PACKAGES)}
                className={navItemClass(ViewState.PACKAGES)}
              >
                PACOTES
              </button>
            </div>
          </div>

        </div>
      </div>
    </nav>
  );
};

export default Navbar;
