import React, { useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { Category, User } from '../types';

interface AuthPageProps {
  categories: Category[];
  onSuccess: (user: User) => void;
  onCancel: () => void;
}

const DEMO_ACCOUNTS = [
  {
    role: 'Student',
    name: 'Maya Chen',
    detail: 'Computer Science · Junior',
    email: 'maya.chen@northbridge.edu.example',
    password: 'Student123!',
  },
  {
    role: 'Organiser',
    name: 'ACM & Innovation Guild',
    detail: 'School of Computing Club',
    email: 'acm.organiser@northbridge.edu.example',
    password: 'Organiser123!',
  },
  {
    role: 'Admin',
    name: 'Student Affairs Admin',
    detail: 'Platform Moderation & Categories',
    email: 'admin@northbridge.edu.example',
    password: 'Admin123!',
  },
];

export function AuthPage({ categories, onSuccess, onCancel }: AuthPageProps) {
  const { login, register } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'organiser'>('student');
  const [department, setDepartment] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('Sophomore');
  const [clubName, setClubName] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleInterest = (catName: string) => {
    setSelectedInterests((prev) =>
      prev.includes(catName) ? prev.filter((item) => item !== catName) : [...prev, catName]
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      showToast(`Signed in as ${user.name}.`, 'success');
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemo = async (demoEmail: string, demoPass: string) => {
    setError('');
    setSubmitting(true);
    try {
      const user = await login(demoEmail, demoPass);
      showToast(`Signed in as ${user.name}.`, 'success');
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'Demo sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (role === 'organiser' && clubName.trim().length < 2) {
      setError('Please enter your club or department name.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        department: department.trim(),
        year_of_study: role === 'student' ? yearOfStudy : '',
        club_name: role === 'organiser' ? clubName.trim() : '',
        interests: selectedInterests,
      });
      showToast(`Welcome to Quadline, ${user.name}.`, 'success');
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to campus events</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main auth form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5 mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                {mode === 'login' ? 'Sign in to Quadline' : 'Create campus account'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {mode === 'login'
                  ? 'Access your event passes, saved calendar, or organiser tools.'
                  : 'Join as a student to register or as an organiser to publish events.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6 w-fit">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Campus Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@northbridge.edu.example"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Sign in</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Account Role</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      role === 'student'
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">Student</p>
                    <p className="text-xs text-slate-500 mt-0.5">Discover &amp; register for events</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('organiser')}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      role === 'organiser'
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">Organiser</p>
                    <p className="text-xs text-slate-500 mt-0.5">Publish club &amp; dept events</p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Campus Email *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@northbridge.edu.example"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-dept" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Department
                  </label>
                  <input
                    id="reg-dept"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g., Computer Science"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                {role === 'student' ? (
                  <div>
                    <label htmlFor="reg-year" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Year of Study
                    </label>
                    <select
                      id="reg-year"
                      value={yearOfStudy}
                      onChange={(e) => setYearOfStudy(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Freshman">Freshman</option>
                      <option value="Sophomore">Sophomore</option>
                      <option value="Junior">Junior</option>
                      <option value="Senior">Senior</option>
                      <option value="Graduate">Graduate</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="reg-club" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Club / Organisation Name *
                    </label>
                    <input
                      id="reg-club"
                      type="text"
                      required
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="e.g., Robotics Society"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="reg-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password * (min 8 characters)
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {role === 'student' && categories.length > 0 && (
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Event Interests (powers AI recommendations)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const active = selectedInterests.includes(cat.name);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleInterest(cat.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Create {role} account</span>
              </button>
            </form>
          )}
        </div>

        {/* Demo quick-access panel */}
        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">Quick Demo Sign-In</h2>
            <p className="text-xs text-slate-500 mt-1">
              Test student discovery, organiser publishing, or admin moderation using pre-seeded fictional campus accounts.
            </p>
          </div>

          <div className="space-y-3">
            {DEMO_ACCOUNTS.map((acc) => (
              <div
                key={acc.email}
                className="rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-700">{acc.role}</p>
                  <p className="text-sm font-semibold text-slate-900 truncate">{acc.name}</p>
                  <p className="text-xs text-slate-500 truncate">{acc.detail}</p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleQuickDemo(acc.email, acc.password)}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-900 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                >
                  Use account
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
