import { useEffect, useState } from 'react';
import { Sparkles, Loader2, ArrowRight, Bookmark, CheckCircle2, Calendar, Sliders } from 'lucide-react';
import { apiFetch, formatEventDate } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { EventCard } from '../components/EventCard';
import type { CampusEvent, Category, StudentDashboardData } from '../types';

interface StudentDashboardPageProps {
  categories: Category[];
  onOpenEvent: (eventId: string) => void;
  onBrowseCategory: (slug: string) => void;
  onOpenNotifications: () => void;
}

export function StudentDashboardPage({
  categories,
  onOpenEvent,
  onBrowseCategory,
  onOpenNotifications,
}: StudentDashboardPageProps) {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [dashboard, setDashboard] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [recs, setRecs] = useState<Array<{ event: CampusEvent; reason: string }>>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState('');
  const [editingInterests, setEditingInterests] = useState(false);
  const [draftInterests, setDraftInterests] = useState<string[]>(user?.interests || []);
  const [savingInterests, setSavingInterests] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<StudentDashboardData>('/api/student/dashboard');
      setDashboard(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load your student dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    setRecsLoading(true);
    setRecsError('');
    try {
      const res = await apiFetch<{ recommendations: Array<{ event: CampusEvent; reason: string }> }>(
        '/api/ai/recommendations',
        { method: 'POST' }
      );
      setRecs(res.recommendations);
    } catch (err: any) {
      setRecsError(err?.message || 'AI recommendations unavailable right now.');
    } finally {
      setRecsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadRecommendations();
  }, [user?.id]);

  useEffect(() => {
    setDraftInterests(user?.interests || []);
  }, [user?.interests]);

  const handleToggleSave = async (event: CampusEvent) => {
    try {
      await apiFetch(`/api/events/${event.id}/save`, {
        method: event.is_saved ? 'DELETE' : 'POST',
      });
      await loadDashboard();
      showToast(event.is_saved ? 'Removed from saved events.' : 'Saved to your calendar.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update saved event.', 'error');
    }
  };

  const handleSaveInterests = async () => {
    setSavingInterests(true);
    try {
      await updateProfile({ interests: draftInterests });
      setEditingInterests(false);
      showToast('Interests updated. Refreshing recommendations...', 'success');
      loadRecommendations();
    } catch (err: any) {
      showToast(err?.message || 'Could not update interests.', 'error');
    } finally {
      setSavingInterests(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="h-28 bg-white border border-slate-200 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-64 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !dashboard || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center space-y-4">
        <p className="text-sm text-red-700">{error || 'Unable to load dashboard.'}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Welcome Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-blue-700">
            {user.department || 'Northbridge University'} {user.year_of_study ? `· ${user.year_of_study}` : ''}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-600">
            You have{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {dashboard.registeredUpcoming.length}
            </span>{' '}
            upcoming registration{dashboard.registeredUpcoming.length === 1 ? '' : 's'},{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {dashboard.savedEvents.length}
            </span>{' '}
            saved event{dashboard.savedEvents.length === 1 ? '' : 's'}, and{' '}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="font-mono tabular-nums font-semibold text-blue-700 underline underline-offset-2"
            >
              {dashboard.unreadNotifications} unread alert{dashboard.unreadNotifications === 1 ? '' : 's'}
            </button>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditingInterests((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Edit Interests ({user.interests.length})</span>
          </button>
        </div>
      </section>

      {editingInterests && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">Select your campus interests</h2>
            <button
              type="button"
              onClick={() => setEditingInterests(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const active = draftInterests.includes(cat.name);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setDraftInterests((prev) =>
                      prev.includes(cat.name) ? prev.filter((x) => x !== cat.name) : [...prev, cat.name]
                    )
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={savingInterests}
              onClick={handleSaveInterests}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {savingInterests && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Interests</span>
            </button>
          </div>
        </section>
      )}

      {/* AI Personalized Recommendations */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span>Recommended For You</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Curated by Gemini AI from your selected interests, saved events, and live seat availability
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecommendations}
            disabled={recsLoading}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {recsLoading ? 'Refreshing...' : 'Refresh picks'}
          </button>
        </div>

        {recsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : recsError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center justify-between gap-3">
            <span>{recsError}</span>
            <button type="button" onClick={loadRecommendations} className="font-semibold underline">
              Retry
            </button>
          </div>
        ) : recs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Select interests above or save a few events to get personalized campus recommendations.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recs.map((item) => (
              <EventCard
                key={item.event.id}
                event={item.event}
                reasonHint={item.reason}
                onOpen={onOpenEvent}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>
        )}
      </section>

      {/* Registered Upcoming Events */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Your Upcoming Passes</span>
          </h2>
        </div>

        {dashboard.registeredUpcoming.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
            You haven&apos;t registered for any upcoming events yet. Explore events happening today or this week below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.registeredUpcoming.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpenEvent(ev.id)}
                className="flex flex-col text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 w-full mb-2">
                  <span className="text-xs font-medium text-slate-500">
                    {ev.category_name} · {formatEventDate(ev.event_date)}
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-700">{ev.my_ticket_code}</span>
                </div>
                <p className="font-display text-base font-semibold text-slate-900 line-clamp-1 mb-1">{ev.title}</p>
                <p className="text-xs text-slate-600">
                  {ev.start_time} – {ev.end_time} · {ev.venue}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Happening Today & This Week */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-700" />
          <span>Happening Today &amp; This Week</span>
        </h2>
        {dashboard.happeningThisWeek.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
            No scheduled events for the next 7 days.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboard.happeningThisWeek.slice(0, 6).map((ev) => (
              <EventCard key={ev.id} event={ev} onOpen={onOpenEvent} onToggleSave={handleToggleSave} />
            ))}
          </div>
        )}
      </section>

      {/* Saved Events */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-slate-700" />
          <span>Saved Events</span>
        </h2>
        {dashboard.savedEvents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
            Bookmark any event while browsing to keep track of deadlines and seats here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboard.savedEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} onOpen={onOpenEvent} onToggleSave={handleToggleSave} />
            ))}
          </div>
        )}
      </section>

      {/* Category Shortcuts */}
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <h2 className="font-display text-lg font-bold text-slate-900">Browse by Category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onBrowseCategory(cat.slug)}
              className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-left transition-colors"
            >
              <span className="text-xs font-semibold text-slate-900 truncate">{cat.name}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
