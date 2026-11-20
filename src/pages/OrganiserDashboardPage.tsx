import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Users,
  Edit3,
  Trash2,
  Megaphone,
  Download,
  X,
  Eye,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, downloadCsv, formatEventDate } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { EventComposerModal } from '../components/EventComposerModal';
import type { CampusEvent, Category, EventRegistration, OrganiserOverviewData } from '../types';

interface OrganiserDashboardPageProps {
  categories: Category[];
  onOpenEvent: (eventId: string) => void;
}

export function OrganiserDashboardPage({ categories, onOpenEvent }: OrganiserDashboardPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<OrganiserOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'published' | 'draft' | 'past' | 'cancelled'>('all');

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CampusEvent | null>(null);

  const [registrantsModal, setRegistrantsModal] = useState<{
    event: CampusEvent;
    registrations: EventRegistration[];
  } | null>(null);
  const [loadingRegistrants, setLoadingRegistrants] = useState(false);

  const [announceEvent, setAnnounceEvent] = useState<CampusEvent | null>(null);
  const [announceMsg, setAnnounceMsg] = useState('');
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CampusEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<OrganiserOverviewData>('/api/organiser/overview');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Unable to load organiser overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [user?.id]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.events.filter((ev) => {
      if (filterTab === 'published') return ev.status === 'published' && !ev.is_past;
      if (filterTab === 'draft') return ev.status === 'draft';
      if (filterTab === 'past') return ev.is_past;
      if (filterTab === 'cancelled') return ev.status === 'cancelled';
      return true;
    });
  }, [data, filterTab]);

  const openRegistrants = async (ev: CampusEvent) => {
    setLoadingRegistrants(true);
    try {
      const res = await apiFetch<{ event: CampusEvent; registrations: EventRegistration[] }>(
        `/api/organiser/events/${ev.id}/registrations`
      );
      setRegistrantsModal(res);
    } catch (err: any) {
      showToast(err?.message || 'Could not load registrations.', 'error');
    } finally {
      setLoadingRegistrants(false);
    }
  };

  const handlePublishDraft = async (ev: CampusEvent) => {
    try {
      await apiFetch(`/api/events/${ev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'published' }),
      });
      showToast(`"${ev.title}" is now published.`, 'success');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Could not publish event.', 'error');
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceEvent) return;
    setSendingAnnounce(true);
    try {
      const res = await apiFetch<{ sentCount: number }>(`/api/events/${announceEvent.id}/announce`, {
        method: 'POST',
        body: JSON.stringify({ message: announceMsg }),
      });
      showToast(`Announcement sent to ${res.sentCount} registered student(s).`, 'success');
      setAnnounceEvent(null);
      setAnnounceMsg('');
    } catch (err: any) {
      showToast(err?.message || 'Could not send announcement.', 'error');
    } finally {
      setSendingAnnounce(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/events/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Deleted "${deleteTarget.title}".`, 'info');
      setDeleteTarget(null);
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete event.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const maxTrend = useMemo(() => {
    if (!data?.registrationTrends.length) return 1;
    return Math.max(1, ...data.registrationTrends.map((t) => t.count));
  }, [data?.registrationTrends]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="h-24 bg-white border border-slate-200 rounded-xl" />
        <div className="h-72 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center space-y-4">
        <p className="text-sm text-red-700">{error || 'Organiser overview unavailable.'}</p>
        <button
          type="button"
          onClick={loadOverview}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-700">{user?.club_name || 'Organiser Studio'}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Event &amp; Registration Operations
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingEvent(null);
            setComposerOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Event</span>
        </button>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Published', value: data.stats.publishedEvents },
          { label: 'Upcoming', value: data.stats.upcomingEvents },
          { label: 'Drafts', value: data.stats.draftEvents },
          { label: 'Past Events', value: data.stats.pastEvents },
          { label: 'Registrations', value: data.stats.totalRegistrations },
          { label: 'Avg Fill Rate', value: `${data.stats.averageFillRate}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </section>

      {/* Registration Trend Analytics */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">Registration Activity</h2>
            <p className="text-xs text-slate-500">Confirmed student sign-ups recorded by date</p>
          </div>
        </div>
        {data.registrationTrends.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No registration activity recorded yet.</p>
        ) : (
          <div className="flex items-end gap-3 h-32 pt-4 overflow-x-auto">
            {data.registrationTrends.map((point) => {
              const heightPct = Math.max(12, Math.round((point.count / maxTrend) * 100));
              return (
                <div key={point.date} className="flex flex-col items-center gap-1.5 min-w-[54px]">
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">{point.count}</span>
                  <div className="w-8 bg-slate-100 rounded-t-md h-20 flex items-end overflow-hidden">
                    <div className="w-full bg-blue-600 rounded-t-md" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">{point.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Events Management Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">Your Events</h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'published', label: 'Upcoming' },
                { id: 'draft', label: 'Drafts' },
                { id: 'past', label: 'Past' },
                { id: 'cancelled', label: 'Cancelled' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTab(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                  filterTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">No events in this view yet.</p>
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setComposerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Event</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Event</th>
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                  <th className="py-3 px-4 text-right">Remaining</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6 max-w-xs">
                      <p className="font-semibold text-slate-900 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {ev.category_name} · {ev.venue}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-slate-900">{formatEventDate(ev.event_date)}</p>
                      <p className="text-xs font-mono tabular-nums text-slate-500">
                        {ev.start_time} – {ev.end_time}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold capitalize ${
                          ev.status === 'published'
                            ? ev.is_past
                              ? 'text-slate-500'
                              : 'text-emerald-700'
                            : ev.status === 'draft'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {ev.status === 'published' && ev.is_past ? 'Ended' : ev.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {ev.registration_count} / {ev.capacity}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {ev.seats_remaining}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {ev.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handlePublishDraft(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Publish</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openRegistrants(ev)}
                          disabled={loadingRegistrants}
                          className="p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="View registrants"
                          aria-label={`View registrants for ${ev.title}`}
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenEvent(ev.id)}
                          className="p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="View event page"
                          aria-label={`View event page for ${ev.title}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEvent(ev);
                            setComposerOpen(true);
                          }}
                          className="p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit event"
                          aria-label={`Edit ${ev.title}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {ev.status === 'published' && ev.registration_count > 0 && (
                          <button
                            type="button"
                            onClick={() => setAnnounceEvent(ev)}
                            className="p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                            title="Send announcement"
                            aria-label={`Send announcement for ${ev.title}`}
                          >
                            <Megaphone className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(ev)}
                          className="p-2 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                          title="Delete event"
                          aria-label={`Delete ${ev.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EventComposerModal
        open={composerOpen}
        categories={categories}
        editingEvent={editingEvent}
        onClose={() => setComposerOpen(false)}
        onSaved={() => loadOverview()}
      />

      {/* Registrants Drawer Modal */}
      {registrantsModal && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regs-title"
        >
          <div className="bg-white w-full max-w-2xl h-full flex flex-col border-l border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="regs-title" className="font-display text-lg font-semibold text-slate-900">
                  Registrations: {registrantsModal.event.title}
                </h2>
                <p className="text-xs font-mono tabular-nums text-slate-500">
                  {registrantsModal.event.registration_count} confirmed / {registrantsModal.event.capacity} capacity
                </p>
              </div>
              <div className="flex items-center gap-2">
                {registrantsModal.registrations.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `registrations-${registrantsModal.event.id}.csv`,
                        ['Name', 'Email', 'Department', 'Year', 'Status', 'Pass Code', 'Note', 'Registered At'],
                        registrantsModal.registrations.map((r) => [
                          r.user_name,
                          r.user_email,
                          r.department,
                          r.year_of_study,
                          r.status,
                          r.ticket_code,
                          r.note,
                          r.registered_at,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRegistrantsModal(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Close registrants panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {registrantsModal.registrations.length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-12">No student registrations yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {registrantsModal.registrations.map((reg) => (
                    <div key={reg.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{reg.user_name}</p>
                          <span
                            className={`text-xs font-semibold ${
                              reg.status === 'confirmed' ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {reg.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {reg.user_email} {reg.department ? `· ${reg.department}` : ''}{' '}
                          {reg.year_of_study ? `· ${reg.year_of_study}` : ''}
                        </p>
                        {reg.note && <p className="text-xs text-slate-700 mt-1">Note: {reg.note}</p>}
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <p className="font-mono text-xs font-bold text-slate-900">{reg.ticket_code}</p>
                        <p className="font-mono text-[11px] text-slate-500">{reg.registered_at.slice(0, 10)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {announceEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="announce-title"
        >
          <form
            onSubmit={handleSendAnnouncement}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h2 id="announce-title" className="font-display text-lg font-semibold text-slate-900">
              Send Attendee Announcement
            </h2>
            <p className="text-xs text-slate-600">
              Notify all {announceEvent.registration_count} confirmed students for{' '}
              <span className="font-semibold text-slate-900">{announceEvent.title}</span>.
            </p>
            <div>
              <label htmlFor="announce-msg" className="sr-only">
                Announcement message
              </label>
              <textarea
                id="announce-msg"
                rows={4}
                required
                minLength={5}
                maxLength={500}
                value={announceMsg}
                onChange={(e) => setAnnounceMsg(e.target.value)}
                placeholder="e.g., Room moved to Studio 306 — doors open 15 minutes early."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnnounceEvent(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingAnnounce}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {sendingAnnounce && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Send Notification</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h2 id="del-title" className="font-display text-lg font-semibold text-slate-900">
              Delete Event?
            </h2>
            <p className="text-sm text-slate-600">
              Permanently remove <span className="font-semibold text-slate-900">{deleteTarget.title}</span> and its{' '}
              {deleteTarget.registration_count} registration record(s)? This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
