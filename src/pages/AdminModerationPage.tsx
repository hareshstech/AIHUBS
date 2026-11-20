import React, { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Flag, Ban, Star } from 'lucide-react';
import { apiFetch, formatEventDate } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { AdminOverviewData, CampusEvent } from '../types';

interface AdminModerationPageProps {
  onOpenEvent: (eventId: string) => void;
  onCategoriesChanged: () => void;
}

export function AdminModerationPage({ onOpenEvent, onCategoriesChanged }: AdminModerationPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'events' | 'reports' | 'users' | 'categories'>('events');

  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Unable to load admin moderation console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [user?.id]);

  const moderateEvent = async (ev: CampusEvent, status: CampusEvent['status'], note = '') => {
    try {
      await apiFetch(`/api/admin/events/${ev.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ status, moderation_note: note }),
      });
      showToast(`Updated "${ev.title}" to ${status}.`, 'success');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Moderation update failed.', 'error');
    }
  };

  const toggleFeatured = async (ev: CampusEvent) => {
    try {
      await apiFetch(`/api/admin/events/${ev.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ featured: !ev.featured }),
      });
      showToast(ev.featured ? 'Removed featured highlight.' : 'Marked event as featured.', 'success');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update featured flag.', 'error');
    }
  };

  const deleteEvent = async (ev: CampusEvent) => {
    try {
      await apiFetch(`/api/events/${ev.id}`, { method: 'DELETE' });
      showToast(`Removed "${ev.title}".`, 'info');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Could not remove event.', 'error');
    }
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await apiFetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, admin_note: `Reviewed by ${user?.name}` }),
      });
      showToast(`Report marked ${status}.`, 'success');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Could not update report.', 'error');
    }
  };

  const toggleUserStatus = async (targetId: string, currentStatus: 'active' | 'suspended') => {
    const next = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await apiFetch(`/api/admin/users/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      showToast(`Account ${next}.`, 'success');
      loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Could not update user account.', 'error');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCatName.trim().length < 2) return;
    setAddingCat(true);
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() }),
      });
      setNewCatName('');
      setNewCatDesc('');
      showToast('Category added.', 'success');
      loadOverview();
      onCategoriesChanged();
    } catch (err: any) {
      showToast(err?.message || 'Could not create category.', 'error');
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await apiFetch(`/api/categories/${catId}`, { method: 'DELETE' });
      showToast('Category removed.', 'info');
      loadOverview();
      onCategoriesChanged();
    } catch (err: any) {
      showToast(err?.message || 'Cannot delete category.', 'error');
    }
  };

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
        <p className="text-sm text-red-700">{error || 'Admin console unavailable.'}</p>
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
      <div>
        <p className="text-xs font-semibold text-blue-700">Student Affairs Governance</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Platform Administration &amp; Moderation
        </h1>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Users', value: data.stats.totalUsers },
          { label: 'Students', value: data.stats.studentsCount },
          { label: 'Organisers', value: data.stats.organisersCount },
          { label: 'Published Events', value: data.stats.publishedEvents },
          { label: 'Registrations', value: data.stats.totalRegistrations },
          { label: 'Open Reports', value: data.stats.openReports },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">{item.value}</p>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { id: 'events', label: `Events (${data.events.length})` },
            { id: 'reports', label: `Reports (${data.stats.openReports} open)` },
            { id: 'users', label: `Users (${data.users.length})` },
            { id: 'categories', label: `Categories (${data.categories.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Event</th>
                <th className="py-3 px-4">Organiser</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Seats</th>
                <th className="py-3 px-6 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.events.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-6 max-w-xs">
                    <button
                      type="button"
                      onClick={() => onOpenEvent(ev.id)}
                      className="font-semibold text-slate-900 hover:text-blue-700 text-left truncate block max-w-full"
                    >
                      {ev.title}
                    </button>
                    <p className="text-xs text-slate-500">{ev.category_name}</p>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">{ev.organiser_club}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                    {formatEventDate(ev.event_date)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        ev.status === 'published'
                          ? 'text-emerald-700'
                          : ev.status === 'flagged'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {ev.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                    {ev.registration_count}/{ev.capacity}
                  </td>
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(ev)}
                        className={`p-1.5 rounded-md ${
                          ev.featured ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-700'
                        }`}
                        title={ev.featured ? 'Unfeature' : 'Feature event'}
                      >
                        <Star className="w-4 h-4" fill={ev.featured ? 'currentColor' : 'none'} />
                      </button>
                      {ev.status !== 'published' && (
                        <button
                          type="button"
                          onClick={() => moderateEvent(ev, 'published', 'Approved by admin')}
                          className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50"
                          title="Approve & publish"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {ev.status !== 'flagged' && (
                        <button
                          type="button"
                          onClick={() => moderateEvent(ev, 'flagged', 'Flagged for review by moderator')}
                          className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                          title="Flag event"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      )}
                      {ev.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => moderateEvent(ev, 'cancelled', 'Cancelled by administrator')}
                          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
                          title="Cancel event"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteEvent(ev)}
                        className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                        title="Remove event"
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

      {tab === 'reports' && (
        <div className="space-y-3">
          {data.reports.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
              No moderation reports submitted.
            </div>
          ) : (
            data.reports.map((rep) => (
              <div
                key={rep.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold uppercase ${
                        rep.status === 'open' ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      {rep.status}
                    </span>
                    <span>·</span>
                    <span className="text-slate-500">Reported by {rep.reporter_name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(rep.event_id)}
                    className="font-display text-base font-semibold text-slate-900 hover:text-blue-700 text-left"
                  >
                    {rep.event_title}
                  </button>
                  <p className="text-xs font-semibold text-slate-700">{rep.reason}</p>
                  {rep.details && <p className="text-xs text-slate-600">{rep.details}</p>}
                </div>

                {rep.status === 'open' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => resolveReport(rep.id, 'dismissed')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveReport(rep.id, 'resolved')}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Name &amp; Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department / Club</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-6">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold capitalize text-slate-700">{u.role}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">{u.club_name || u.department || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        u.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right">
                    {u.id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => toggleUserStatus(u.id, u.status)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {data.categories.map((cat) => (
              <div key={cat.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cat.name}</p>
                  <p className="text-xs text-slate-500">
                    {cat.description || 'No description'} ·{' '}
                    <span className="font-mono tabular-nums">{cat.event_count || 0} events</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-2 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50"
                  title="Delete unused category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddCategory} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">Add Event Category</h2>
            <div>
              <label htmlFor="cat-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Category Name *
              </label>
              <input
                id="cat-name"
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g., Career Fairs"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="cat-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <input
                id="cat-desc"
                type="text"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Short summary for AI matching"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={addingCat}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Category</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
