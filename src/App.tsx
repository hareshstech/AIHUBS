import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { ToastProvider, useToast } from './lib/toast-context';
import { apiFetch } from './lib/api';
import { Navbar } from './components/Navbar';
import type { AppView } from './components/Navbar';
import { CampusAssistantModal } from './components/CampusAssistantModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DiscoverPage } from './pages/DiscoverPage';
import { AuthPage } from './pages/AuthPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { OrganiserDashboardPage } from './pages/OrganiserDashboardPage';
import { AdminModerationPage } from './pages/AdminModerationPage';
import { NotificationsPage } from './pages/NotificationsPage';
import type { Category, User } from './types';

function parseHashRoute(): { view: AppView; eventId: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('event/')) {
    const id = hash.slice('event/'.length).trim();
    if (id) return { view: 'event', eventId: id };
  }
  if (hash === 'student' || hash === 'organiser' || hash === 'admin' || hash === 'notifications' || hash === 'auth') {
    return { view: hash, eventId: null };
  }
  return { view: 'discover', eventId: null };
}

function QuadlineAppShell() {
  const { user, loading, logout } = useAuth();
  const { showToast } = useToast();

  const initialRoute = parseHashRoute();
  const [view, setView] = useState<AppView>(initialRoute.view);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRoute.eventId);
  const [discoverCategory, setDiscoverCategory] = useState<string>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch<{ categories: Category[] }>('/api/categories');
      setCategories(res.categories);
    } catch {
      // keep existing
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const res = await apiFetch<{ unreadCount: number }>('/api/notifications');
      setUnreadNotifications(res.unreadCount);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHashRoute();
      setView(next.view);
      setSelectedEventId(next.eventId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((nextView: AppView, eventId: string | null = null) => {
    setView(nextView);
    setSelectedEventId(eventId);
    if (nextView === 'event' && eventId) {
      window.location.hash = `#/event/${eventId}`;
    } else if (nextView === 'discover') {
      window.location.hash = '#/';
    } else {
      window.location.hash = `#/${nextView}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openEvent = useCallback(
    (eventId: string) => {
      navigate('event', eventId);
    },
    [navigate]
  );

  const handleAuthSuccess = (loggedInUser: User) => {
    if (selectedEventId) {
      navigate('event', selectedEventId);
    } else if (loggedInUser.role === 'organiser') {
      navigate('organiser');
    } else if (loggedInUser.role === 'admin') {
      navigate('admin');
    } else {
      navigate('student');
    }
  };

  const handleLogout = async () => {
    await logout();
    setUnreadNotifications(0);
    showToast('Signed out.', 'info');
    navigate('discover');
  };

  // Protected route guards after initial auth check completes
  const renderMainContent = () => {
    if (loading) {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      );
    }

    if (view === 'auth') {
      return (
        <AuthPage
          categories={categories}
          onSuccess={handleAuthSuccess}
          onCancel={() => navigate('discover')}
        />
      );
    }

    if (view === 'event' && selectedEventId) {
      return (
        <EventDetailPage
          eventId={selectedEventId}
          onBack={() => navigate('discover')}
          onOpenEvent={openEvent}
          onRequireAuth={() => navigate('auth')}
        />
      );
    }

    if (view === 'student') {
      if (!user) {
        return (
          <AuthPage
            categories={categories}
            onSuccess={handleAuthSuccess}
            onCancel={() => navigate('discover')}
          />
        );
      }
      return (
        <StudentDashboardPage
          categories={categories}
          onOpenEvent={openEvent}
          onBrowseCategory={(slug) => {
            setDiscoverCategory(slug);
            navigate('discover');
          }}
          onOpenNotifications={() => navigate('notifications')}
        />
      );
    }

    if (view === 'organiser') {
      if (!user) {
        return (
          <AuthPage
            categories={categories}
            onSuccess={handleAuthSuccess}
            onCancel={() => navigate('discover')}
          />
        );
      }
      if (user.role !== 'organiser' && user.role !== 'admin') {
        return (
          <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
            <h1 className="font-display text-xl font-bold text-slate-900">Organiser access required</h1>
            <p className="text-sm text-slate-600">
              Your account is registered as a student. Sign in with an organiser account to publish and manage events.
            </p>
            <button
              type="button"
              onClick={() => navigate('discover')}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              Return to Discover
            </button>
          </div>
        );
      }
      return <OrganiserDashboardPage categories={categories} onOpenEvent={openEvent} />;
    }

    if (view === 'admin') {
      if (!user || user.role !== 'admin') {
        return (
          <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
            <h1 className="font-display text-xl font-bold text-slate-900">Administrator access required</h1>
            <p className="text-sm text-slate-600">
              Platform moderation and governance tools are restricted to administrator accounts.
            </p>
            <button
              type="button"
              onClick={() => navigate('discover')}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              Return to Discover
            </button>
          </div>
        );
      }
      return <AdminModerationPage onOpenEvent={openEvent} onCategoriesChanged={loadCategories} />;
    }

    if (view === 'notifications') {
      if (!user) {
        return (
          <AuthPage
            categories={categories}
            onSuccess={handleAuthSuccess}
            onCancel={() => navigate('discover')}
          />
        );
      }
      return (
        <NotificationsPage
          onOpenEvent={openEvent}
          onUnreadCountChange={(count) => setUnreadNotifications(count)}
        />
      );
    }

    return (
      <DiscoverPage
        categories={categories}
        initialCategory={discoverCategory}
        onOpenEvent={openEvent}
        onOpenAssistant={() => setAssistantOpen(true)}
        onRequireAuth={() => navigate('auth')}
        onNavigateOrganiser={() => navigate('organiser')}
      />
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        user={user}
        activeView={view}
        unreadNotifications={unreadNotifications}
        onNavigate={(nextView) => {
          if (nextView === 'discover') setDiscoverCategory('all');
          navigate(nextView);
        }}
        onOpenAssistant={() => setAssistantOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1">{renderMainContent()}</main>

      <footer className="border-t border-slate-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-slate-900 text-sm">Quadline</span>
            <span>·</span>
            <span>Northbridge Campus Event Directory</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => navigate('discover')} className="hover:text-slate-900">
              Discover
            </button>
            <button type="button" onClick={() => setAssistantOpen(true)} className="hover:text-slate-900">
              Campus AI
            </button>
            {!user && (
              <button type="button" onClick={() => navigate('auth')} className="hover:text-slate-900">
                Sign in
              </button>
            )}
          </div>
        </div>
      </footer>

      <CampusAssistantModal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onOpenEvent={openEvent}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <QuadlineAppShell />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
