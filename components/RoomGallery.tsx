import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Sun, Maximize2 } from 'lucide-react';
import { Room } from '../types';
import { getPublicImageUrl } from '../utils/imageUtils';

export const RoomGallery: React.FC<{ room: Room, onZoom: (index: number) => void }> = ({ room, onZoom }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [imageLoaded, setImageLoaded] = useState(false);
    const images = room.imageUrls.filter(url => url !== '');

    const next = (e: React.MouseEvent) => {
        e.stopPropagation();
        setImageLoaded(false);
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const prev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setImageLoaded(false);
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    if (images.length === 0) {
        return (
            <div className="relative h-64 md:h-72 bg-slate-100 flex items-center justify-center">
                <Sun size={48} className="text-slate-300" />
            </div>
        );
    }

    return (
        <div className="relative h-64 md:h-72 overflow-hidden group/gallery bg-slate-100">
            {!imageLoaded && (
                <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 animate-pulse flex items-center justify-center">
                    <div className="text-slate-300">
                        <Sun size={48} className="animate-pulse" />
                    </div>
                </div>
            )}
            <img
                src={getPublicImageUrl(images[currentIndex])}
                alt={`${room.name} - ${currentIndex + 1}`}
                className={`w-full h-full object-cover transition-all duration-700 hover:scale-105 cursor-zoom-in ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => onZoom(currentIndex)}
                onLoad={() => setImageLoaded(true)}
                loading="lazy"
            />
            {images.length > 1 && (
                <>
                    <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                        <ChevronLeft size={20} />
                    </button>
                    <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                        <ChevronRight size={20} />
                    </button>
                </>
            )}
            <button onClick={(e) => { e.stopPropagation(); onZoom(currentIndex); }} className="absolute top-3 right-3 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-md opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                <Maximize2 size={16} />
            </button>
        </div>
    );
};
