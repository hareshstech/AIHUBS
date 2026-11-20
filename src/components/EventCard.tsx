import { Bookmark, CheckCircle2, Clock, MapPin, AlertTriangle, Ban, ArrowUpRight } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatEventDate, formatTimeRange } from '../lib/api';
import type { CampusEvent } from '../types';

interface EventCardProps {
  event: CampusEvent;
  onOpen: (eventId: string) => void;
  onToggleSave?: (event: CampusEvent) => void;
  reasonHint?: string;
}

export function getEventAvailabilityState(event: CampusEvent): {
  label: string;
  toneClass: string;
  icon: 'check' | 'warn' | 'closed' | 'open';
} {
  if (event.status === 'cancelled') {
    return { label: 'Cancelled', toneClass: 'text-red-700', icon: 'closed' };
  }
  if (event.is_registered) {
    return { label: 'Registered', toneClass: 'text-emerald-700', icon: 'check' };
  }
  if (event.is_past) {
    return { label: 'Ended', toneClass: 'text-slate-500', icon: 'closed' };
  }
  if (event.is_full) {
    return { label: 'Full', toneClass: 'text-red-700', icon: 'closed' };
  }
  if (event.is_deadline_passed) {
    return { label: 'Registration closed', toneClass: 'text-amber-700', icon: 'warn' };
  }
  if (event.seats_remaining <= Math.max(5, Math.ceil(event.capacity * 0.15))) {
    return { label: 'Filling fast', toneClass: 'text-amber-700', icon: 'warn' };
  }
  return { label: 'Open', toneClass: 'text-emerald-700', icon: 'open' };
}

export function EventCard({ event, onOpen, onToggleSave, reasonHint }: EventCardProps) {
  const statusInfo = getEventAvailabilityState(event);

  return (
    <article className="group flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
      <div className="relative aspect-[16/9] w-full bg-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => onOpen(event.id)}
          className="block w-full h-full text-left focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600"
          aria-label={`View details for ${event.title}`}
        >
          <EventImage
            src={event.image_url}
            alt={`${event.title} cover`}
            categoryName={event.category_name}
            className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>

        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(event);
            }}
            aria-label={event.is_saved ? `Remove ${event.title} from saved events` : `Save ${event.title}`}
            aria-pressed={event.is_saved}
            className={`absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              event.is_saved
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Bookmark className="w-4 h-4" fill={event.is_saved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col p-5">
        {/* Zero-pill unboxed metadata with typographic separators */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 truncate">
          <span className="font-medium text-slate-700">{event.category_name}</span>
          <span aria-hidden="true">·</span>
          <span>{formatEventDate(event.event_date)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{formatTimeRange(event.start_time, event.end_time)}</span>
        </div>

        <h3 className="font-display text-lg font-semibold text-slate-900 leading-snug mb-2 line-clamp-2">
          <button
            type="button"
            onClick={() => onOpen(event.id)}
            className="text-left hover:text-blue-700 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
          >
            {event.title}
          </button>
        </h3>

        <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-4">
          {reasonHint || event.description}
        </p>

        <div className="mt-auto pt-4 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </span>
            <span className="font-mono tabular-nums text-slate-500 shrink-0">
              {event.seats_remaining}/{event.capacity} left
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusInfo.toneClass}`}>
              {statusInfo.icon === 'check' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {statusInfo.icon === 'warn' && <AlertTriangle className="w-3.5 h-3.5" />}
              {statusInfo.icon === 'closed' && <Ban className="w-3.5 h-3.5" />}
              {statusInfo.icon === 'open' && <Clock className="w-3.5 h-3.5" />}
              <span>{statusInfo.label}</span>
            </span>

            <button
              type="button"
              onClick={() => onOpen(event.id)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{event.is_registered ? 'View pass' : 'Details'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
