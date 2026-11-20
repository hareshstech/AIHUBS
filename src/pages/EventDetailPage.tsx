import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Share2,
  Flag,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { apiFetch, formatDateTimeLabel, formatEventDate, formatTimeRange } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { EventImage } from '../components/EventImage';
import { EventCard, getEventAvailabilityState } from '../components/EventCard';
import type { AISummary, CampusEvent } from '../types';

interface EventDetailPageProps {
  eventId: string;
  onBack: () => void;
  onOpenEvent: (eventId: string) => void;
  onRequireAuth: () => void;
}

export function EventDetailPage({ eventId, onBack, onOpenEvent, onRequireAuth }: EventDetailPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Inaccurate schedule or venue');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetch<{ event: CampusEvent; relatedEvents: CampusEvent[] }>(`/api/events/${eventId}`)
      .then((res) => {
        if (!active) return;
        setEvent(res.event);
        setRelatedEvents(res.relatedEvents);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'Unable to load event details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, user?.id]);

  const handleRegister = async () => {
    if (!user) {
      showToast('Please sign in with a student account to register.', 'info');
      onRequireAuth();
      return;
    }
    if (!event) return;

    setActionLoading(true);
    try {
      const res = await apiFetch<{ ticketCode: string; event: CampusEvent }>(`/api/events/${event.id}/register`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      setEvent(res.event);
      setNote('');
      showToast(`Spot confirmed! Pass code: ${res.ticketCode}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Registration failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!event) return;
    setActionLoading(true);
    try {
      const res = await apiFetch<{ event: CampusEvent }>(`/api/events/${event.id}/register`, {
        method: 'DELETE',
      });
      setEvent(res.event);
      showToast('Registration cancelled and seat released.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not cancel registration.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (!user) {
      showToast('Sign in to save events.', 'info');
      onRequireAuth();
      return;
    }
    if (!event) return;
    try {
      const res = await apiFetch<{ event: CampusEvent }>(`/api/events/${event.id}/save`, {
        method: event.is_saved ? 'DELETE' : 'POST',
      });
      setEvent(res.event);
      showToast(res.event.is_saved ? 'Event saved.' : 'Removed from saved events.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update saved status.', 'error');
    }
  };

  const handleSummarize = async () => {
    if (!event) return;
    setSummarizing(true);
    try {
      const res = await apiFetch<{ summary: AISummary }>('/api/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ eventId: event.id }),
      });
      setEvent((prev) => (prev ? { ...prev, ai_summary: res.summary } : prev));
      showToast('AI summary generated.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'AI summarization unavailable right now.', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Event link copied to clipboard.', 'success');
    } catch {
      showToast('Share URL is ready in your browser address bar.', 'info');
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setReporting(true);
    try {
      await apiFetch(`/api/events/${event.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason, details: reportDetails }),
      });
      setReportOpen(false);
      setReportDetails('');
      showToast('Report submitted to Student Affairs moderators.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not submit report.', 'error');
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        <div className="aspect-[16/9] max-h-[380px] w-full bg-slate-200 rounded-xl" />
        <div className="h-8 w-2/3 bg-slate-200 rounded" />
        <div className="h-32 w-full bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-slate-900">Event not available</h1>
        <p className="text-sm text-slate-600">{error || 'This event may have been removed or is not yet published.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Discover</span>
        </button>
      </div>
    );
  }

  const statusInfo = getEventAvailabilityState(event);
  const fillPct = Math.min(100, Math.round((event.registration_count / event.capacity) * 100));
  const canStudentRegister =
    event.status === 'published' && !event.is_past && !event.is_deadline_passed && !event.is_full && !event.is_registered;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to events</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSave}
            aria-pressed={event.is_saved}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              event.is_saved
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={event.is_saved ? 'currentColor' : 'none'} />
            <span>{event.is_saved ? 'Saved' : 'Save'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          {user && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:text-red-700 hover:border-red-200"
              aria-label="Report event"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Hero Banner */}
      <div className="aspect-[16/9] max-h-[380px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
        <EventImage
          src={event.image_url}
          alt={`${event.title} banner`}
          categoryName={event.category_name}
          className="w-full h-full"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Event Content */}
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">{event.category_name}</span>
              <span aria-hidden="true">·</span>
              <span>Hosted by {event.organiser_club}</span>
              <span aria-hidden="true">·</span>
              <span className={`inline-flex items-center gap-1 font-semibold ${statusInfo.toneClass}`}>
                {statusInfo.icon === 'check' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {statusInfo.icon === 'warn' && <AlertTriangle className="w-3.5 h-3.5" />}
                {statusInfo.icon === 'closed' && <Ban className="w-3.5 h-3.5" />}
                {statusInfo.icon === 'open' && <Clock className="w-3.5 h-3.5" />}
                <span>{statusInfo.label}</span>
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 leading-tight [text-wrap:balance]">
              {event.title}
            </h1>
          </div>

          {/* Key Logistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-slate-200">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-slate-500">Date &amp; Time</p>
                <p className="text-sm font-semibold text-slate-900">{formatEventDate(event.event_date)}</p>
                <p className="text-xs font-mono tabular-nums text-slate-600">
                  {formatTimeRange(event.start_time, event.end_time)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-slate-500">Campus Venue</p>
                <p className="text-sm font-semibold text-slate-900">{event.venue}</p>
                <p className="text-xs text-slate-600">{event.organiser_department || 'Northbridge Campus'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-slate-500">Registration Deadline</p>
                <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                  {formatDateTimeLabel(event.registration_deadline)}
                </p>
                <p className="text-xs text-slate-600">
                  {event.is_deadline_passed ? 'Deadline passed' : 'Open until deadline'}
                </p>
              </div>
            </div>
          </div>

          {/* AI Summarization Card */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">Quick Event Summary</h2>
                <p className="text-xs text-slate-500">Concise highlights distilled from the full listing</p>
              </div>
              {!event.ai_summary && (
                <button
                  type="button"
                  onClick={handleSummarize}
                  disabled={summarizing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{summarizing ? 'Summarizing...' : 'Summarize with AI'}</span>
                </button>
              )}
            </div>

            {event.ai_summary ? (
              <div className="space-y-2.5 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{event.ai_summary.tldr}</p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Best suited for:</span> {event.ai_summary.whoShouldAttend}
                </p>
                {event.ai_summary.takeaways.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-700">
                    {event.ai_summary.takeaways.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Click &ldquo;Summarize with AI&rdquo; to generate a 3-point overview of this event.
              </p>
            )}
          </section>

          {/* Full Description */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">About this event</h2>
            <div className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line max-w-prose">
              {event.description}
            </div>
          </section>

          {event.additional_instructions && (
            <section className="border-t border-slate-200 pt-5 space-y-2">
              <h2 className="font-display text-sm font-semibold text-slate-900">Attendee Instructions</h2>
              <p className="text-sm text-slate-700 leading-relaxed">{event.additional_instructions}</p>
            </section>
          )}
        </div>

        {/* Sticky Registration Sidebar */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Capacity</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {event.registration_count} / {event.capacity} registered
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  event.is_full ? 'bg-red-600' : fillPct >= 85 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <p className="text-xs font-mono tabular-nums text-slate-500">
              {event.seats_remaining} {event.seats_remaining === 1 ? 'seat' : 'seats'} remaining
            </p>
          </div>

          {event.status === 'cancelled' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              This event has been cancelled by the organiser.
            </div>
          ) : event.is_registered ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>You are registered</span>
                </div>
                <p className="text-xs text-emerald-700">
                  Show pass code <span className="font-mono font-bold">{event.my_ticket_code}</span> at check-in.
                </p>
              </div>
              {!event.is_past && (
                <button
                  type="button"
                  onClick={handleCancelRegistration}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Updating...' : 'Cancel Registration'}
                </button>
              )}
            </div>
          ) : event.is_past ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              This event has already finished. Registration is closed.
            </div>
          ) : event.is_deadline_passed ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Registration closed on {formatDateTimeLabel(event.registration_deadline)}.
            </div>
          ) : event.is_full ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              All {event.capacity} seats have been claimed. Check back in case a spot opens up.
            </div>
          ) : user && user.role !== 'student' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
              Signed in as <span className="font-semibold text-slate-900">{user.role}</span>. Event registration is reserved for student accounts.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="reg-note" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Note for organiser (optional)
                </label>
                <input
                  id="reg-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., Dietary preference or team name"
                  maxLength={300}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleRegister}
                disabled={actionLoading || (!canStudentRegister && Boolean(user))}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{user ? 'I am going — Register now' : 'Sign in to register'}</span>
              </button>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">Organised by</p>
            <p className="text-sm font-semibold text-slate-900">{event.organiser_club}</p>
            <p className="text-xs text-slate-600">{event.organiser_department}</p>
          </div>
        </aside>
      </div>

      {/* Related Events */}
      {relatedEvents.length > 0 && (
        <section className="pt-8 border-t border-slate-200 space-y-5">
          <h2 className="font-display text-xl font-bold text-slate-900">More in {event.category_name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedEvents.map((rel) => (
              <EventCard key={rel.id} event={rel} onOpen={onOpenEvent} />
            ))}
          </div>
        </section>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
        >
          <form
            onSubmit={handleSubmitReport}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h2 id="report-title" className="font-display text-lg font-semibold text-slate-900">
              Report Event Listing
            </h2>
            <p className="text-xs text-slate-600">
              Flag misleading details, capacity issues, or policy violations for Student Affairs review.
            </p>
            <div>
              <label htmlFor="rep-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Reason
              </label>
              <select
                id="rep-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              >
                <option value="Inaccurate schedule or venue">Inaccurate schedule or venue</option>
                <option value="Capacity too small for demand">Capacity too small for demand</option>
                <option value="Duplicate or spam listing">Duplicate or spam listing</option>
                <option value="Inappropriate content">Inappropriate content</option>
              </select>
            </div>
            <div>
              <label htmlFor="rep-details" className="block text-xs font-semibold text-slate-700 mb-1">
                Additional details
              </label>
              <textarea
                id="rep-details"
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Briefly describe the issue..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reporting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {reporting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
