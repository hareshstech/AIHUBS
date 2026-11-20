import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface EventImageProps {
  src?: string;
  alt: string;
  categoryName?: string;
  className?: string;
}

export function EventImage({ src, alt, categoryName, className = '' }: EventImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-500 p-4 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <Calendar className="w-7 h-7 text-slate-400 mb-2" strokeWidth={1.5} />
        <span className="text-xs font-medium text-slate-600 text-center line-clamp-1">
          {categoryName || 'Campus Event'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
