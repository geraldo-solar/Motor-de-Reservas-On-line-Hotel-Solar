import React from 'react';
import { CalendarDays, Check, Zap } from 'lucide-react';
import { formatDisplayDate, parseISODate, toLocalISO } from '../utils/dateUtils';
import { getPublicImageUrl } from '../utils/imageUtils';
import JULY_PACKAGES_DATA from '../july_migration.json';

interface JulySectionProps {
    onSelectPackage: (checkIn: Date, checkOut: Date) => void;
    checkIn: Date | null;
    checkOut: Date | null;
}

const JULY_WEEKS = [
    { label: '05 a 09/07', checkIn: [2026, 6, 5], checkOut: [2026, 6, 9] },
    { label: '12 a 16/07', checkIn: [2026, 6, 12], checkOut: [2026, 6, 16] },
    { label: '19 a 23/07', checkIn: [2026, 6, 19], checkOut: [2026, 6, 23] },
    { label: '26 a 30/07', checkIn: [2026, 6, 26], checkOut: [2026, 6, 30] },
];

export const JulySection: React.FC<JulySectionProps> = ({
    onSelectPackage,
    checkIn,
    checkOut
}) => {
    // Use local data as source of truth for July packages
    const julyPackages = JULY_PACKAGES_DATA.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.image_url,
        startIsoDate: p.start_iso_date,
        endIsoDate: p.end_iso_date,
        active: p.active,
        isPromotional: p.is_promotional,
        includes: p.includes,
        daily_schedule: (p as any).daily_schedule,
        fullPeriodDiscountPct: (p as any).full_period_discount_pct || 0
    }));

    const isCurrentWeek = (weekCheckIn: Date, weekCheckOut: Date) => {
        return checkIn && checkOut &&
            toLocalISO(checkIn) === toLocalISO(weekCheckIn) &&
            toLocalISO(checkOut) === toLocalISO(weekCheckOut);
    };

    return (
        <section id="julho-section" className="max-w-7xl mx-auto px-4 pb-24 scroll-mt-24">
            <div className="relative rounded-[3rem] overflow-hidden bg-gradient-to-br from-solar-green via-solar-summer-blue to-solar-summer-teal p-8 md:p-20 shadow-2xl border border-white/10">
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>

                {/* Decorative elements */}
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-solar-summer-sun/20 rounded-full blur-3xl animate-pulse pointer-events-none"></div>
                <div className="absolute top-1/2 -left-20 w-64 h-64 bg-solar-summer-blue/30 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center gap-12 text-center md:text-left">
                    <div className="flex-1 space-y-6">
                        <div className="inline-flex items-center gap-2 bg-solar-summer-sun text-solar-green px-6 py-2 rounded-full border-2 border-white/50 shadow-xl transform -rotate-1">
                            <Zap size={18} fill="currentColor" className="animate-bounce" />
                            <span className="text-xs font-black uppercase tracking-[0.2em]">Verão Amazônico 2026</span>
                        </div>
                        <h2 className="text-5xl md:text-8xl font-serif text-white leading-tight drop-shadow-2xl">
                            Julho em <span className="text-solar-summer-sun">Salinas</span>
                        </h2>
                        <p className="text-white/90 text-lg md:text-2xl max-w-2xl leading-relaxed font-light italic drop-shadow-md">
                            "O Sol de Julho em Salinas é pura energia. Preparamos experiências exclusivas para você viver o melhor do verão no Hotel Solar."
                        </p>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4">
                            {['Pé na Areia', 'Programação Infantil', 'Gastronomia Regional'].map(feat => (
                                <div key={feat} className="flex items-center gap-2 text-solar-gold">
                                    <Check size={18} />
                                    <span className="text-xs font-bold uppercase tracking-widest">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-20 space-y-12 relative z-20">
                    {julyPackages.map((pkg) => (
                        <div

                            key={pkg.id}
                            className={`group rounded-[2.5rem] shadow-2xl border transition-all hover:-translate-y-1 p-6 md:p-10 space-y-8 ${pkg.isPromotional ? 'bg-white border-orange-100 shadow-orange-900/5 ring-1 ring-orange-50' : 'bg-white border-white/10 shadow-solar-gold/20'}`}
                        >
                            {/* Top Section: Image + Info */}
                            <div className="flex flex-col md:flex-row items-start gap-8">
                                {/* Image Side - Square & Inset */}
                                <div className="w-full md:w-[320px] aspect-square flex-shrink-0 relative overflow-hidden rounded-2xl shadow-lg">
                                    <img
                                        src={getPublicImageUrl(pkg.imageUrl, 800)}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                                        style={{ filter: 'none', mixBlendMode: 'normal' }}
                                        alt={pkg.name}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    {pkg.fullPeriodDiscountPct > 0 && (
                                        <div className={`absolute top-4 left-4 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg animate-pulse z-20 ${pkg.isPromotional ? 'bg-solar-summer-orange' : 'bg-red-600'}`}>
                                            {pkg.fullPeriodDiscountPct}% OFF
                                        </div>
                                    )}

                                    {pkg.isPromotional && (
                                        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md px-4 py-3 rounded-xl border border-solar-summer-orange/30 shadow-lg text-center z-20">
                                            <p className="text-[10px] font-black text-solar-summer-orange uppercase tracking-widest leading-none mb-1">Oferta Mid-Week</p>
                                            <p className="text-xs font-bold text-slate-700 leading-none">Jantar Cortesia</p>
                                        </div>
                                    )}
                                </div>

                                {/* Content Side (Intro) */}
                                <div className="flex-1 flex flex-col space-y-6 pt-2">
                                    <div className="space-y-4">
                                        {/* Date Highlight */}
                                        <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full shadow-lg transform -rotate-1 group-hover:rotate-0 transition-transform duration-500 ${pkg.isPromotional ? 'bg-solar-summer-orange text-white' : 'bg-solar-summer-sun text-solar-green'}`}>
                                            <CalendarDays size={20} className="animate-pulse" />
                                            <span className="text-xs md:text-sm font-black uppercase tracking-[0.15em]">
                                                {pkg.id === 'jul-family' ? 'Escolha sua Semana' : `${formatDisplayDate(pkg.startIsoDate)} a ${formatDisplayDate(pkg.endIsoDate)}`}
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            {pkg.isPromotional && <span className="text-[10px] font-black text-solar-summer-orange uppercase tracking-[0.3em]">Melhor Valor de Julho</span>}
                                            <h3 className="text-3xl md:text-5xl font-serif text-solar-green leading-tight">{pkg.name}</h3>
                                        </div>
                                    </div>

                                    <p className="text-slate-500 leading-relaxed text-lg italic">
                                        "{pkg.description}"
                                    </p>

                                    {/* Action Button (only if not family package) */}
                                    {pkg.id !== 'jul-family' && (
                                        <div className="pt-2 flex flex-col md:flex-row items-center gap-6">
                                            <button
                                                onClick={() => onSelectPackage(parseISODate(pkg.startIsoDate), parseISODate(pkg.endIsoDate))}
                                                className={`w-full md:w-auto px-8 py-4 text-white rounded-2xl font-bold uppercase text-xs tracking-[0.2em] transition-all shadow-xl active:scale-95 cursor-pointer ${pkg.isPromotional ? 'bg-solar-summer-orange hover:bg-solar-summer-orange/90 shadow-solar-summer-orange/20' : 'bg-solar-green hover:bg-solar-gold shadow-solar-green/20'}`}
                                            >
                                                Ver Disponibilidade
                                            </button>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {pkg.isPromotional ? '*Válido apenas dom a qui' : '*Vagas limitadas'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Separator */}
                            <div className="w-full h-px bg-slate-100"></div>

                            {/* Bottom Section: Schedule / Features */}
                            <div className="space-y-4">
                                {/* Week selection for family package (moved here for distribution) */}
                                {pkg.id === 'jul-family' && (
                                    <div className="space-y-4 pb-6 border-b border-slate-100 mb-6">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Selecione o período desejado:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-30">
                                            {JULY_WEEKS.map((week) => {
                                                const weekCheckIn = new Date(week.checkIn[0], week.checkIn[1], week.checkIn[2]);
                                                const weekCheckOut = new Date(week.checkOut[0], week.checkOut[1], week.checkOut[2]);
                                                const isActive = isCurrentWeek(weekCheckIn, weekCheckOut);

                                                return (
                                                    <button
                                                        key={week.label}
                                                        onClick={() => onSelectPackage(weekCheckIn, weekCheckOut)}
                                                        className={`group/week p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-1 cursor-pointer active:scale-95 ${isActive
                                                            ? 'bg-solar-summer-orange border-solar-summer-orange text-white shadow-xl scale-105 ring-4 ring-solar-summer-orange/20'
                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-solar-summer-orange hover:text-solar-summer-orange hover:shadow-xl hover:-translate-y-1'
                                                            }`}
                                                    >
                                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 ${isActive ? 'text-white/90' : 'text-slate-400 group-hover/week:text-solar-summer-orange/60'}`}>Semana</span>
                                                        <span className="text-sm font-black whitespace-nowrap font-sans tracking-tight">{week.label}</span>
                                                        {isActive ? (
                                                            <Check size={12} className="mt-1 animate-bounce" />
                                                        ) : (
                                                            <span className="text-[7px] font-black uppercase opacity-0 group-hover/week:opacity-100 transition-all mt-1 tracking-widest bg-solar-summer-orange/10 px-2 py-0.5 rounded-full">Escolher</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {(pkg as any).daily_schedule ? (
                                    <>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Programação da Semana:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {(pkg as any).daily_schedule.map((item: any) => (
                                                <div key={item.day} className={`p-4 rounded-2xl border flex flex-col gap-2 ${pkg.isPromotional ? 'bg-solar-summer-orange/5 border-solar-summer-orange/20' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${pkg.isPromotional ? 'text-solar-summer-orange' : 'text-slate-400'}`}>{item.day}</span>
                                                        <div className={`w-2 h-2 rounded-full ${pkg.isPromotional ? 'bg-solar-summer-orange' : 'bg-solar-summer-sun'}`}></div>
                                                    </div>
                                                    <h4 className="font-serif font-bold text-solar-green leading-tight text-base">{item.label}</h4>
                                                    <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destaques da Experiência:</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {pkg.includes.map((prog) => (
                                                <div key={prog} className={`flex items-start gap-3 p-4 rounded-xl border ${pkg.isPromotional ? 'bg-solar-summer-orange/5 border-solar-summer-orange/20' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className={`mt-1.5 min-w-[6px] h-1.5 rounded-full ${pkg.isPromotional ? 'bg-solar-summer-orange' : 'bg-solar-summer-sun'}`}></div>
                                                    <span className={`text-sm font-medium leading-relaxed ${pkg.isPromotional ? 'text-solar-summer-orange' : 'text-slate-700'}`}>
                                                        {prog}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <p className="text-[10px] md:text-xs font-medium text-slate-500 mt-4 flex items-center gap-1.5 opacity-90 pl-1">
                                    <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                    *Programação sujeita a alterações sem aviso prévio.
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
