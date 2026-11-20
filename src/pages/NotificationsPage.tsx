import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../lib/toast-context';
import type { AppNotification } from '../types';

interface NotificationsPageProps {
  onOpenEvent: (eventId: string) => void;
  onUnreadCountChange: (count: number) => void;
}

export function NotificationsPage({ onOpenEvent, onUnreadCountChange }: NotificationsPageProps) {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications);
      onUnreadCountChange(res.unreadCount);
    } catch {
      showToast('Unable to load notifications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        onUnreadCountChange(next.filter((n) => !n.is_read).length);
        return next;
      });
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onUnreadCountChange(0);
      showToast('All notifications marked as read.', 'success');
    } catch {
      showToast('Could not mark notifications as read.', 'error');
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== id);
        onUnreadCountChange(next.filter((n) => !n.is_read).length);
        return next;
      });
    } catch {
      showToast('Could not delete notification.', 'error');
    }
  };

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Notifications &amp; Reminders</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Registration confirmations, upcoming 24-hour reminders, schedule updates, and organiser announcements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                filter === 'unread' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Unread
            </button>
          </div>
          {notifications.some((n) => !n.is_read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
          <Bell className="w-7 h-7 text-slate-400 mx-auto" strokeWidth={1.5} />
          <p className="font-display text-base font-semibold text-slate-900">
            {filter === 'unread' ? 'No unread alerts' : 'No notifications yet'}
          </p>
          <p className="text-xs text-slate-500">
            When you register for events or save listings with upcoming deadlines, updates appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {visible.map((item) => (
            <div
              key={item.id}
              className={`p-5 flex items-start justify-between gap-4 transition-colors ${
                item.is_read ? 'bg-white' : 'bg-blue-50/40'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700 capitalize">{item.type.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{item.created_at.slice(0, 10)}</span>
                  {!item.is_read && <span className="font-semibold text-blue-700">· Unread</span>}
                </div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-600">{item.message}</p>
                {item.event_id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!item.is_read) markRead(item.id);
                      onOpenEvent(item.event_id!);
                    }}
                    className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                  >
                    <span>Open event</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!item.is_read && (
                  <button
                    type="button"
                    onClick={() => markRead(item.id)}
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteNotification(item.id)}
                  className="p-2 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50"
                  aria-label="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
