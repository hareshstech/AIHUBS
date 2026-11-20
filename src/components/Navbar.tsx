import { useState } from 'react';
import { Menu, X, Bell, LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { getRoleLabel } from '../lib/auth-context';
import type { User } from '../types';

export type AppView =
  | 'discover'
  | 'student'
  | 'organiser'
  | 'admin'
  | 'notifications'
  | 'event'
  | 'auth';

interface NavbarProps {
  user: User | null;
  activeView: AppView;
  unreadNotifications: number;
  onNavigate: (view: AppView) => void;
  onOpenAssistant: () => void;
  onLogout: () => void;
}

export function Navbar({
  user,
  activeView,
  unreadNotifications,
  onNavigate,
  onOpenAssistant,
  onLogout,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems: Array<{ id: AppView; label: string; show: boolean }> = [
    { id: 'discover', label: 'Discover', show: true },
    { id: 'student', label: 'My Campus', show: Boolean(user && user.role === 'student') },
    { id: 'organiser', label: 'Organiser', show: Boolean(user && (user.role === 'organiser' || user.role === 'admin')) },
    { id: 'admin', label: 'Moderation', show: Boolean(user && user.role === 'admin') },
    {
      id: 'notifications',
      label: unreadNotifications > 0 ? `Alerts (${unreadNotifications})` : 'Alerts',
      show: Boolean(user),
    },
  ];

  const visibleNav = navItems.filter((item) => item.show);

  const handleNavClick = (view: AppView) => {
    setMobileOpen(false);
    setMenuOpen(false);
    onNavigate(view);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick('discover')}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 rounded"
        >
          Quadline
        </button>

        {/* Zone 2: 4-5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {visibleNav.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenAssistant}
            className="text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent text-blue-700 hover:text-blue-900 hover:border-blue-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            Campus AI
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <span className="max-w-[140px] truncate">{user.name}</span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white py-2 shadow-lg z-20"
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      <p className="text-xs font-medium text-blue-700 mt-1">{getRoleLabel(user.role)}</p>
                    </div>
                    {user.role === 'student' && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleNavClick('student')}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span>My Campus &amp; Interests</span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleNavClick('notifications')}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <Bell className="w-4 h-4 text-slate-400" />
                        <span>Notifications</span>
                      </span>
                      {unreadNotifications > 0 && (
                        <span className="font-mono tabular-nums text-xs font-semibold text-blue-700">
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-700 hover:bg-red-50 text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleNavClick('auth')}
              className="hidden md:inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium text-left ${
                activeView === item.id ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenAssistant();
            }}
            className="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 text-left"
          >
            Campus AI Assistant
          </button>
          <div className="pt-2 border-t border-slate-100">
            {user ? (
              <div className="space-y-2 px-3 py-2">
                <div className="text-xs text-slate-500">
                  Signed in as <span className="font-semibold text-slate-900">{user.name}</span> ({getRoleLabel(user.role)})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogout();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick('auth')}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Sign in or create account
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
