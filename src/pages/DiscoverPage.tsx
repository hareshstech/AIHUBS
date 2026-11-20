import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, RotateCcw, Calendar, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { EventCard } from '../components/EventCard';
import type { CampusEvent, Category } from '../types';

interface DiscoverPageProps {
  categories: Category[];
  onOpenEvent: (eventId: string) => void;
  onOpenAssistant: () => void;
  onRequireAuth: () => void;
  onNavigateOrganiser: () => void;
  initialCategory?: string;
}

export function DiscoverPage({
  categories,
  onOpenEvent,
  onOpenAssistant,
  onRequireAuth,
  onNavigateOrganiser,
  initialCategory = 'all',
}: DiscoverPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [timeframe, setTimeframe] = useState<'upcoming' | 'today' | 'week' | 'all' | 'past'>('upcoming');
  const [exactDate, setExactDate] = useState('');
  const [location, setLocation] = useState('all');
  const [availability, setAvailability] = useState<'all' | 'open' | 'full' | 'closing_soon'>('all');
  const [sort, setSort] = useState<'upcoming' | 'popular' | 'newest'>('upcoming');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(12);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    apiFetch<{ locations: string[] }>('/api/events/meta/locations')
      .then((res) => setLocations(res.locations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (category !== 'all') params.set('category', category);
        if (exactDate) {
          params.set('date', exactDate);
        } else {
          params.set('timeframe', timeframe);
        }
        if (location !== 'all') params.set('location', location);
        if (availability !== 'all') params.set('availability', availability);
        params.set('sort', sort);
        params.set('limit', String(limit));

        const res = await apiFetch<{ events: CampusEvent[]; total: number }>(`/api/events?${params.toString()}`);
        if (!active) return;
        setEvents(res.events);
        setTotal(res.total);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Unable to load campus events.');
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, category, timeframe, exactDate, location, availability, sort, limit, user?.id]);

  const hasActiveFilters = useMemo(() => {
    return (
      query.trim() !== '' ||
      category !== 'all' ||
      timeframe !== 'upcoming' ||
      exactDate !== '' ||
      location !== 'all' ||
      availability !== 'all' ||
      sort !== 'upcoming'
    );
  }, [query, category, timeframe, exactDate, location, availability, sort]);

  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setTimeframe('upcoming');
    setExactDate('');
    setLocation('all');
    setAvailability('all');
    setSort('upcoming');
    setLimit(12);
  };

  const handleToggleSave = async (event: CampusEvent) => {
    if (!user) {
      showToast('Sign in to save events to your campus list.', 'info');
      onRequireAuth();
      return;
    }

    try {
      const res = await apiFetch<{ event: CampusEvent }>(`/api/events/${event.id}/save`, {
        method: event.is_saved ? 'DELETE' : 'POST',
      });
      setEvents((prev) => prev.map((e) => (e.id === event.id ? res.event : e)));
      showToast(res.event.is_saved ? 'Saved to your campus calendar.' : 'Removed from saved events.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update saved state.', 'error');
    }
  };

  const summaryStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const openSeats = events.reduce((acc, e) => acc + (e.status === 'published' && !e.is_past ? e.seats_remaining : 0), 0);
    const todayCount = events.filter((e) => e.event_date === todayStr && e.status === 'published').length;
    return {
      matchingCount: total,
      todayCount,
      openSeats,
      categoryCount: categories.length,
    };
  }, [events, total, categories.length]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      {/* Editorial Hero Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.15] [text-wrap:balance]">
              Every campus hackathon, workshop, match, and meetup in one place.
            </h1>
            <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
              Stop hunting through scattered group chats and notice boards. Browse verified Northbridge events, check live seat availability, and reserve your spot in two taps.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenAssistant}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                <span>Ask Campus AI</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              {user && (user.role === 'organiser' || user.role === 'admin') ? (
                <button
                  type="button"
                  onClick={onNavigateOrganiser}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <span>Open Organiser Studio</span>
                </button>
              ) : (
                !user && (
                  <button
                    type="button"
                    onClick={onRequireAuth}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    <span>Sign in to register</span>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-3 border-t lg:border-t-0 lg:border-l border-slate-200 pt-6 lg:pt-0 lg:pl-8">
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs font-medium text-slate-500">Matching Events</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{summaryStats.matchingCount}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs font-medium text-slate-500">Happening Today</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{summaryStats.todayCount}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs font-medium text-slate-500">Open Seats Listed</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{summaryStats.openSeats}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs font-medium text-slate-500">Categories</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{summaryStats.categoryCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Multi-Faceted Filters */}
      <section aria-label="Search and filter campus events" className="space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="discover-search" className="sr-only">
              Search events by name, organiser, or venue
            </label>
            <input
              id="discover-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by event name, club, organiser, or building..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'today', label: 'Today' },
                  { id: 'week', label: 'This Week' },
                  { id: 'past', label: 'Past' },
                  { id: 'all', label: 'All' },
                ] as const
              ).map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => {
                    setExactDate('');
                    setTimeframe(tf.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors ${
                    !exactDate && timeframe === tf.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowMoreFilters((prev) => !prev)}
              aria-expanded={showMoreFilters}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* Category Segmented Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Event categories">
          <button
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            onClick={() => setCategory('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
              category === 'all'
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.slug || category === cat.id}
              onClick={() => setCategory(cat.slug)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                category === cat.slug || category === cat.id
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Expanded Filter Controls */}
        {showMoreFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-slate-200 rounded-xl p-4">
            <div>
              <label htmlFor="filter-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Specific Date
              </label>
              <input
                id="filter-date"
                type="date"
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="filter-location" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Campus Venue
              </label>
              <select
                id="filter-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="all">All Campus Locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-avail" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Registration Status
              </label>
              <select
                id="filter-avail"
                value={availability}
                onChange={(e) => setAvailability(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open for Registration</option>
                <option value="closing_soon">Closing Within 48h</option>
                <option value="full">Full Capacity</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-sort" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Sort Order
              </label>
              <select
                id="filter-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="upcoming">Upcoming First</option>
                <option value="popular">Most Popular</option>
                <option value="newest">Recently Added</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
          <p className="font-mono tabular-nums">
            Showing {events.length} of {total} events
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </section>

      {/* Results Grid */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded-lg bg-white border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Reset &amp; Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
              <div className="aspect-[16/9] bg-slate-200" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
                <div className="h-5 w-4/5 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-100 rounded" />
                <div className="h-4 w-2/3 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto" strokeWidth={1.5} />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-slate-900">No campus events match these filters</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Try clearing your search query, choosing a broader timeframe, or asking the Campus AI Assistant what is happening this week.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Clear all filters
            </button>
            <button
              type="button"
              onClick={onOpenAssistant}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Ask Campus AI
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onOpen={onOpenEvent}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>

          {events.length < total && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + 12)}
                className="px-6 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                Load more events ({total - events.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
