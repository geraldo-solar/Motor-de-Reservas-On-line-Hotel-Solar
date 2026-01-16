
import React from 'react';

const WhatsAppButton: React.FC = () => {
  const phoneNumber = "5591981229825";
  const message = encodeURIComponent("Olá! Estou no site do Hotel Solar e preciso tirar algumas dúvidas sobre as reservas.");
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <div className="fixed bottom-6 right-6 z-[999] group flex flex-col items-end pointer-events-none">
      {/* Tooltip elegante que aparece no hover (apenas desktop) */}
      <div className="mb-2 px-3 py-1.5 bg-[#0F2820] text-white text-[10px] font-bold uppercase tracking-widest rounded-md shadow-2xl border border-white/10 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none whitespace-nowrap hidden md:block">
        Fale conosco no WhatsApp
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-[#25D366] text-white rounded-full shadow-[0_10px_30px_-5px_rgba(37,211,102,0.6)] hover:bg-[#128C7E] transition-all duration-300 transform hover:scale-110 active:scale-95 border-2 border-white/20"
        aria-label="Atendimento via WhatsApp"
      >
        {/* Efeito de Ondulação (Pulse) constante para visibilidade */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-25"></span>
        
        {/* Ícone Oficial do WhatsApp em SVG para reconhecimento imediato */}
        <svg 
          viewBox="0 0 24 24" 
          className="w-8 h-8 md:w-9 md:h-9 fill-current relative z-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.03c0 2.12.554 4.189 1.602 6.04L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.632 0 12.028-5.391 12.03-12.027a11.799 11.799 0 00-3.528-8.504" />
        </svg>

        {/* Notificação sutil para dar vida ao elemento */}
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white shadow-sm"></span>
        </span>
      </a>
    </div>
  );
};

export default WhatsAppButton;
