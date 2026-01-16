import React, { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean; // Se true, carrega imediatamente sem lazy loading
  quality?: number; // Qualidade da imagem (1-100)
  placeholder?: 'blur' | 'empty';
}

/**
 * Componente de imagem otimizada com:
 * - Lazy loading nativo
 * - Placeholder de carregamento
 * - Tratamento de erros
 * - Fade-in suave ao carregar
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  priority = false,
  quality = 80,
  placeholder = 'blur',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer para lazy loading
  useEffect(() => {
    if (priority) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Começa a carregar 100px antes de entrar na viewport
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  // Função para otimizar URL de imagem (se for do Supabase Storage ou outros CDNs)
  const getOptimizedUrl = (originalUrl: string): string => {
    if (!originalUrl) return '';
    
    // Se for uma URL do Supabase Storage, podemos adicionar parâmetros de transformação
    if (originalUrl.includes('supabase.co/storage')) {
      const url = new URL(originalUrl);
      // Adicionar parâmetros de otimização se suportado
      if (width) url.searchParams.set('width', String(width));
      if (height) url.searchParams.set('height', String(height));
      url.searchParams.set('quality', String(quality));
      return url.toString();
    }
    
    // Para outras URLs, retornar como está
    return originalUrl;
  };

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const optimizedSrc = getOptimizedUrl(src);

  // Placeholder enquanto carrega
  const placeholderStyle = placeholder === 'blur' 
    ? 'bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse'
    : 'bg-gray-100';

  return (
    <div 
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {/* Placeholder */}
      {!isLoaded && (
        <div className={`absolute inset-0 ${placeholderStyle}`} />
      )}
      
      {/* Imagem */}
      {isInView && !hasError && (
        <img
          src={optimizedSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
      
      {/* Fallback em caso de erro */}
      {hasError && (
        <div className="absolute inset-0 bg-gray-200 flex items-center justify-center">
          <span className="text-gray-400 text-xs">Imagem indisponível</span>
        </div>
      )}
    </div>
  );
};

export default OptimizedImage;
