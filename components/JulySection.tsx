import React from 'react';
import { CalendarDays, Check, Zap, Info, ArrowRight } from 'lucide-react';
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
                            className={`group rounded-[3rem] shadow-2xl border transition-all duration-500 hover:-translate-y-2 p-8 md:p-12 space-y-10 ${pkg.isPromotional ? 'bg-white border-orange-100 shadow-orange-900/10 ring-1 ring-orange-100' : 'bg-white border-white/20 shadow-solar-gold/20'}`}
                        >
                            {/* Top Section: Image + Info */}
                            <div className="flex flex-col md:flex-row items-start gap-10 md:gap-14">
                                {/* Image Side - Square & Inset */}
                                <div className="w-full md:w-[360px] aspect-square flex-shrink-0 relative overflow-hidden rounded-[2rem] shadow-2xl group-hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] transition-all duration-500">
                                    <img
                                        src={getPublicImageUrl(pkg.imageUrl, 800)}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out"
                                        style={{ filter: 'none', mixBlendMode: 'normal' }}
                                        alt={pkg.name}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    {pkg.fullPeriodDiscountPct > 0 && (
                                        <div className={`absolute top-5 left-5 text-white text-[11px] font-black px-4 py-2 rounded-full shadow-lg backdrop-blur-sm z-20 ${pkg.isPromotional ? 'bg-solar-summer-orange/90' : 'bg-red-600/90'}`}>
                                            {pkg.fullPeriodDiscountPct}% OFF
                                        </div>
                                    )}

                                    {pkg.isPromotional && (
                                        <div className="absolute bottom-5 left-5 right-5 bg-white/90 backdrop-blur-xl px-5 py-4 rounded-2xl border border-white/40 shadow-xl text-center z-20">
                                            <p className="text-[10px] font-black text-solar-summer-orange uppercase tracking-[0.25em] leading-none mb-1.5">Oferta Mid-Week</p>
                                            <p className="text-sm font-bold text-slate-800 leading-none font-serif">Jantar Cortesia</p>
                                        </div>
                                    )}
                                </div>

                                {/* Content Side (Intro) */}
                                <div className="flex-1 flex flex-col space-y-8 pt-4">
                                    <div className="space-y-5">
                                        {/* Date Highlight */}
                                        <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full shadow-sm transform -rotate-1 group-hover:rotate-0 transition-transform duration-500 ${pkg.isPromotional ? 'bg-orange-50 text-solar-summer-orange border border-orange-100' : 'bg-solar-green/5 text-solar-green border border-solar-green/10'}`}>
                                            <CalendarDays size={18} className="opacity-80" />
                                            <span className="text-xs md:text-sm font-black uppercase tracking-[0.2em]">
                                                {pkg.id === 'jul-family' ? 'Escolha sua Semana' : `${formatDisplayDate(pkg.startIsoDate)} a ${formatDisplayDate(pkg.endIsoDate)}`}
                                            </span>
                                        </div>

                                        <div className="space-y-3">
                                            {pkg.isPromotional && <span className="inline-block text-[10px] font-black text-white bg-solar-summer-orange px-3 py-1 rounded-md uppercase tracking-[0.25em] shadow-sm">Melhor Valor</span>}
                                            <h3 className="text-4xl md:text-6xl font-serif text-slate-800 leading-[1.1] tracking-tight">{pkg.name}</h3>
                                        </div>
                                    </div>

                                    <p className="text-slate-500 leading-relaxed text-lg md:text-xl font-light border-l-4 border-slate-200 pl-6 italic">
                                        "{pkg.description}"
                                    </p>

                                    {/* Action Button (only if not family package) */}
                                    {pkg.id !== 'jul-family' && (
                                        <div className="pt-4 flex flex-col items-start gap-4">
                                            <button
                                                onClick={() => onSelectPackage(parseISODate(pkg.startIsoDate), parseISODate(pkg.endIsoDate))}
                                                className={`group/btn relative overflow-hidden flex items-center justify-center gap-4 w-full md:w-auto px-10 py-5 text-white rounded-2xl font-bold uppercase text-xs tracking-[0.25em] transition-all shadow-xl active:scale-95 cursor-pointer ${pkg.isPromotional ? 'bg-gradient-to-r from-solar-summer-orange to-orange-500 hover:shadow-orange-500/30' : 'bg-gradient-to-r from-solar-green to-emerald-600 hover:shadow-emerald-600/30'}`}
                                            >
                                                <span className="relative z-10 flex items-center gap-3">
                                                    Garantir Minha Vaga
                                                    <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                                                </span>
                                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                                            </button>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${pkg.isPromotional ? 'bg-orange-400' : 'bg-emerald-400'}`}></div>
                                                {pkg.isPromotional ? 'Desconto especial aplicado' : 'Últimas vagas disponíveis'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Separator */}
                            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>

                            {/* Bottom Section: Schedule / Features */}
                            <div className="space-y-6">
                                {/* Week selection for family package (moved here for distribution) */}
                                {pkg.id === 'jul-family' && (
                                    <div className="space-y-6 pb-8 border-b border-slate-100 mb-8">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-px bg-slate-300"></div>
                                            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Selecione sua Data</p>
                                            <div className="w-full h-px bg-slate-100"></div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-30">
                                            {JULY_WEEKS.map((week) => {
                                                const weekCheckIn = new Date(week.checkIn[0], week.checkIn[1], week.checkIn[2]);
                                                const weekCheckOut = new Date(week.checkOut[0], week.checkOut[1], week.checkOut[2]);
                                                const isActive = isCurrentWeek(weekCheckIn, weekCheckOut);

                                                return (
                                                    <button
                                                        key={week.label}
                                                        onClick={() => onSelectPackage(weekCheckIn, weekCheckOut)}
                                                        className={`group/week relative p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center justify-between gap-3 cursor-pointer active:scale-95 ${isActive
                                                            ? 'bg-solar-summer-orange border-solar-summer-orange text-white shadow-xl scale-105 ring-4 ring-solar-summer-orange/20'
                                                            : 'bg-white border-slate-100 text-slate-500 hover:border-solar-summer-orange hover:shadow-lg hover:-translate-y-1'
                                                            }`}
                                                    >
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-white/90' : 'text-slate-400'}`}>Semana</span>
                                                        <span className="text-sm font-black whitespace-nowrap font-serif">{week.label}</span>

                                                        {/* Radio Indicator */}
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isActive ? 'bg-white border-white text-solar-summer-orange' : 'border-slate-200 group-hover/week:border-solar-summer-orange group-hover/week:scale-110'}`}>
                                                            {isActive && <Check size={14} strokeWidth={4} />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {(pkg as any).daily_schedule && Array.isArray((pkg as any).daily_schedule) ? (
                                    <>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-px bg-slate-300"></div>
                                            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Programação do Pacote</p>
                                            <div className="w-full h-px bg-slate-100"></div>
                                        </div>
                                        <div className="relative mt-8 mb-4">
                                            {/* Connecting Line (Desktop) */}
                                            <div className="hidden md:block absolute top-[18px] left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-slate-300 to-transparent opacity-50"></div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
                                                {(pkg as any).daily_schedule.map((item: any, idx: number) => (
                                                    <div key={idx} className="group/day relative flex flex-col items-center text-center">
                                                        {/* Timeline Node */}
                                                        <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-lg transition-all duration-500 group-hover/day:scale-110 ${pkg.isPromotional ? 'bg-orange-500' : 'bg-solar-green'}`}>
                                                            <span className="text-[10px] font-black text-white">{idx + 1}º</span>
                                                        </div>

                                                        {/* Content */}
                                                        <div className="mt-4 flex flex-col items-center gap-2">
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${pkg.isPromotional ? 'bg-orange-50 text-orange-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                {item.day}
                                                            </span>
                                                            <h4 className="font-serif font-bold text-slate-800 leading-tight text-lg group-hover/day:text-emerald-700 transition-colors">
                                                                {item.label}
                                                            </h4>
                                                            <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-[200px]">
                                                                {item.description}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-px bg-slate-300"></div>
                                            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Destaques da Experiência</p>
                                            <div className="w-full h-px bg-slate-100"></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {pkg.includes.map((prog) => (
                                                <div key={prog} className="flex items-start gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-md transition-shadow">
                                                    <div className={`mt-1.5 min-w-[8px] h-2 rounded-full ${pkg.isPromotional ? 'bg-solar-summer-orange' : 'bg-solar-summer-sun'}`}></div>
                                                    <span className="text-sm font-medium leading-relaxed text-slate-600">
                                                        {prog}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <p className="text-[10px] md:text-xs font-medium text-slate-400 mt-6 flex items-center gap-2 opacity-80 pl-1 tracking-wide">
                                    <Info size={14} className="text-slate-300" />
                                    *Programação sujeita a alterações.
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
