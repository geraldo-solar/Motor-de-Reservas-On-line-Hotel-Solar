import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { getPublicImageUrl } from '../utils/imageUtils';

export const Lightbox: React.FC<{
    images: string[],
    initialIndex: number,
    onClose: () => void
}> = ({ images, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') next();
            if (e.key === 'ArrowLeft') prev();
        };
        window.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKey);
            document.body.style.overflow = 'auto';
        };
    }, []);

    const next = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
            setIsAnimating(false);
        }, 150);
    };

    const prev = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
            setIsAnimating(false);
        }, 150);
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-between items-center p-6 md:p-8">
                <div className="flex flex-col">
                    <h3 className="text-[#D4AF37] font-serif text-lg tracking-widest uppercase">Solar Gallery</h3>
                    <span className="text-white/40 text-[10px] tracking-[0.2em]">{currentIndex + 1} / {images.length}</span>
                </div>
                <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/10">
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center p-4">
                {images.length > 1 && (
                    <>
                        <button onClick={prev} className="absolute left-4 md:left-8 z-10 bg-black/50 hover:bg-black/80 text-white p-4 rounded-full transition-all border border-white/10 group">
                            <ChevronLeft size={32} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <button onClick={next} className="absolute right-4 md:right-8 z-10 bg-black/50 hover:bg-black/80 text-white p-4 rounded-full transition-all border border-white/10 group">
                            <ChevronRight size={32} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </>
                )}

                <div className={`relative max-w-5xl w-full h-full flex items-center justify-center transition-all duration-300 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                    <img
                        src={getPublicImageUrl(images[currentIndex])}
                        className="max-w-full max-h-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg selection:bg-transparent"
                        alt="Solar Gallery Zoom"
                    />
                </div>
            </div>

            <div className="p-8 flex justify-center gap-2 overflow-x-auto pb-12">
                {images.map((img, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${idx === currentIndex ? 'border-[#D4AF37] scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}
                    >
                        <img src={getPublicImageUrl(img)} className="w-full h-full object-cover" />
                    </button>
                ))}
            </div>
        </div>
    );
};
