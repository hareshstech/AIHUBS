import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, generateId, generateTicketCode, initDatabase } from './server/db.ts';
import {
  clearAuthCookie,
  createRateLimiter,
  optionalAuth,
  requireAuth,
  requireRole,
  setAuthCookie,
  signAuthToken,
} from './server/auth.ts';
import type { AuthenticatedRequest } from './server/auth.ts';
import {
  ensureUpcomingRemindersForUser,
  getLocalNowIsoMinute,
  getTodayDateString,
  isValidImageUrl,
  queryEventById,
  queryEvents,
  sanitizeText,
} from './server/queries.ts';
import {
  askCampusAssistant,
  generateEventDescription,
  recommendCampusEvents,
  suggestEventCategory,
  summarizeEventDetails,
} from './server/ai.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

// Security headers compatible with iframe preview
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve uploaded event images safely
app.get('/uploads/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename || '');
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    res.status(400).json({ error: 'Invalid filename.' });
    return;
  }
  const fullPath = path.join(uploadsDir, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.sendFile(fullPath);
});

const authLimiter = createRateLimiter('auth', 25, 60 * 1000);
const aiLimiter = createRateLimiter('ai', 20, 60 * 1000);
const writeLimiter = createRateLimiter('write', 60, 60 * 1000);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.get('/api/auth/me', optionalAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.authUser || null });
});

app.post('/api/auth/register', authLimiter, (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role === 'organiser' ? 'organiser' : 'student';
  const department = sanitizeText(req.body?.department, 80);
  const yearOfStudy = sanitizeText(req.body?.year_of_study, 40);
  const clubName = sanitizeText(req.body?.club_name, 100);
  const interests = Array.isArray(req.body?.interests)
    ? req.body.interests.filter((x: unknown): x is string => typeof x === 'string').slice(0, 8)
    : [];

  if (name.length < 2) {
    res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please enter a valid campus email address.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (role === 'organiser' && clubName.length < 2) {
    res.status(400).json({ error: 'Organiser accounts must provide a club or department name.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = generateId('usr');
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, department, year_of_study, club_name, bio, interests_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'active', ?, ?)`
  ).run(userId, name, email, passwordHash, role, department, yearOfStudy, clubName, JSON.stringify(interests), now, now);

  const token = signAuthToken({ userId, role, email });
  setAuthCookie(res, token, req);

  res.status(201).json({
    user: {
      id: userId,
      name,
      email,
      role,
      department,
      year_of_study: yearOfStudy,
      club_name: clubName,
      bio: '',
      interests,
      status: 'active',
      created_at: now,
    },
  });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, name, email, password_hash, role, department, year_of_study, club_name, bio, interests_json, status, created_at
       FROM users WHERE email = ?`
    )
    .get(email) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string;
        role: 'student' | 'organiser' | 'admin';
        department: string;
        year_of_study: string;
        club_name: string;
        bio: string;
        interests_json: string;
        status: 'active' | 'suspended';
        created_at: string;
      }
    | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    return;
  }

  let interests: string[] = [];
  try {
    const parsed = JSON.parse(row.interests_json);
    if (Array.isArray(parsed)) interests = parsed;
  } catch {
    interests = [];
  }

  const token = signAuthToken({ userId: row.id, role: row.role, email: row.email });
  setAuthCookie(res, token, req);

  res.json({
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      year_of_study: row.year_of_study,
      club_name: row.club_name,
      bio: row.bio,
      interests,
      status: row.status,
      created_at: row.created_at,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res, req);
  res.json({ ok: true });
});

app.patch('/api/auth/profile', requireAuth, writeLimiter, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const name = sanitizeText(req.body?.name, 80) || user.name;
  const department = sanitizeText(req.body?.department, 80);
  const yearOfStudy = sanitizeText(req.body?.year_of_study, 40);
  const clubName = sanitizeText(req.body?.club_name, 100);
  const bio = sanitizeText(req.body?.bio, 400);
  const interests = Array.isArray(req.body?.interests)
    ? req.body.interests.filter((x: unknown): x is string => typeof x === 'string').slice(0, 10)
    : user.interests;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE users SET name = ?, department = ?, year_of_study = ?, club_name = ?, bio = ?, interests_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, department, yearOfStudy, clubName, bio, JSON.stringify(interests), now, user.id);

  res.json({
    user: {
      ...user,
      name,
      department,
      year_of_study: yearOfStudy,
      club_name: clubName,
      bio,
      interests,
    },
  });
});

// ==========================================
// CATEGORIES ROUTES
// ==========================================

app.get('/api/categories', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM events e WHERE e.category_id = c.id AND e.status = 'published') AS event_count
       FROM categories c
       ORDER BY c.sort_order ASC, c.name ASC`
    )
    .all();
  res.json({ categories: rows });
});

app.post('/api/categories', requireAuth, requireRole('admin'), writeLimiter, (req, res) => {
  const name = sanitizeText(req.body?.name, 40);
  const description = sanitizeText(req.body?.description, 200);
  const accentColor = /^#[0-9A-Fa-f]{6}$/.test(String(req.body?.accent_color || ''))
    ? String(req.body.accent_color)
    : '#2563EB';

  if (name.length < 2) {
    res.status(400).json({ error: 'Category name must be at least 2 characters.' });
    return;
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const exists = db.prepare('SELECT id FROM categories WHERE slug = ? OR LOWER(name) = LOWER(?)').get(slug, name);
  if (exists) {
    res.status(409).json({ error: 'A category with that name already exists.' });
    return;
  }

  const id = generateId('cat');
  const now = new Date().toISOString();
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories').get() as { m: number }).m;

  db.prepare(
    `INSERT INTO categories (id, name, slug, description, accent_color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, slug, description, accentColor, maxOrder + 1, now);

  res.status(201).json({
    category: { id, name, slug, description, accent_color: accentColor, sort_order: maxOrder + 1, event_count: 0 },
  });
});

app.delete('/api/categories/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const used = (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE category_id = ?').get(id) as { cnt: number }).cnt;
  if (used > 0) {
    res.status(409).json({ error: `Cannot delete category because ${used} event(s) currently use it.` });
    return;
  }
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  res.json({ ok: true });
});

// ==========================================
// IMAGE UPLOAD ROUTE (SAFE MAGIC-BYTE CHECK)
// ==========================================

app.post('/api/uploads/image', requireAuth, requireRole('organiser', 'admin'), writeLimiter, (req, res) => {
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'Invalid image format. Please upload a PNG, JPEG, or WEBP file.' });
    return;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: 'Image file size must be under 2 MB.' });
    return;
  }

  // Verify magic bytes match declared MIME type
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (
    (mimeType === 'image/png' && !isPng) ||
    (mimeType === 'image/jpeg' && !isJpeg) ||
    (mimeType === 'image/webp' && !isWebp)
  ) {
    res.status(400).json({ error: 'Uploaded file signature does not match an allowed image format.' });
    return;
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `evt_${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);

  res.status(201).json({ url: `/uploads/${filename}` });
});

// ==========================================
// EVENTS DISCOVERY & DETAIL ROUTES
// ==========================================

app.get('/api/events/meta/locations', (_req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT venue FROM events WHERE status IN ('published', 'cancelled') ORDER BY venue ASC")
    .all() as Array<{ venue: string }>;
  res.json({ locations: rows.map((r) => r.venue) });
});

app.get('/api/events', optionalAuth, (req: AuthenticatedRequest, res) => {
  const result = queryEvents(
    {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      timeframe: typeof req.query.timeframe === 'string' ? req.query.timeframe : undefined,
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
      location: typeof req.query.location === 'string' ? req.query.location : undefined,
      availability: typeof req.query.availability === 'string' ? req.query.availability : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      sort: typeof req.query.sort === 'string' ? req.query.sort : 'upcoming',
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    },
    req.authUser?.id
  );
  res.json(result);
});

app.get('/api/events/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const event = queryEventById(req.params.id, req.authUser?.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  const isOwnerOrAdmin =
    req.authUser && (req.authUser.role === 'admin' || req.authUser.id === event.organiser_id);

  if ((event.status === 'draft' || event.status === 'flagged') && !isOwnerOrAdmin) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  const related = queryEvents(
    {
      category: event.category_id,
      timeframe: 'upcoming',
      sort: 'upcoming',
      limit: 6,
    },
    req.authUser?.id
  ).events.filter((e) => e.id !== event.id).slice(0, 3);

  res.json({ event, relatedEvents: related });
});

// ==========================================
// EVENT CREATION, UPDATE, DELETE (ORGANISER/ADMIN)
// ==========================================

function validateEventInput(body: Record<string, unknown>) {
  const title = sanitizeText(body.title, 120);
  const description = sanitizeText(body.description, 4000);
  const additionalInstructions = sanitizeText(body.additional_instructions, 1000);
  const categoryId = sanitizeText(body.category_id, 64);
  const eventDate = sanitizeText(body.event_date, 20);
  const startTime = sanitizeText(body.start_time, 10);
  const endTime = sanitizeText(body.end_time, 10);
  const registrationDeadline = sanitizeText(body.registration_deadline, 30);
  const venue = sanitizeText(body.venue, 140);
  const capacity = Number(body.capacity);
  const imageUrl = sanitizeText(body.image_url, 400);
  const status = body.status === 'draft' ? 'draft' : body.status === 'cancelled' ? 'cancelled' : 'published';

  if (title.length < 4) return { error: 'Event title must be at least 4 characters.' };
  if (description.length < 20) return { error: 'Event description must be at least 20 characters.' };
  if (!categoryId) return { error: 'Please select an event category.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { error: 'Valid event date (YYYY-MM-DD) is required.' };
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: 'Valid start and end times (HH:MM) are required.' };
  }
  if (endTime <= startTime) {
    return { error: 'End time must be later than start time.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(registrationDeadline)) {
    return { error: 'Valid registration deadline is required.' };
  }
  if (venue.length < 3) return { error: 'Please specify the campus venue.' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) {
    return { error: 'Capacity must be a whole number between 1 and 5000.' };
  }
  if (!isValidImageUrl(imageUrl)) {
    return { error: 'Event image must be a valid local cover, uploaded file, or HTTP(S) URL.' };
  }

  const cat = db.prepare('SELECT id, slug FROM categories WHERE id = ?').get(categoryId) as
    | { id: string; slug: string }
    | undefined;
  if (!cat) return { error: 'Selected category does not exist.' };

  const defaultCovers: Record<string, string> = {
    hackathons: '/covers/hackathon.svg',
    workshops: '/covers/workshop.svg',
    cultural: '/covers/cultural.svg',
    sports: '/covers/sports.svg',
    'club-meetups': '/covers/meetup.svg',
    'tech-talks': '/covers/meetup.svg',
  };

  return {
    data: {
      title,
      description,
      additionalInstructions,
      categoryId,
      eventDate,
      startTime,
      endTime,
      registrationDeadline: registrationDeadline.slice(0, 16),
      venue,
      capacity,
      imageUrl: imageUrl || defaultCovers[cat.slug] || '/covers/meetup.svg',
      status,
    },
  };
}

app.post('/api/events', requireAuth, requireRole('organiser', 'admin'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const parsed = validateEventInput(req.body || {});
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const d = parsed.data;
  const id = generateId('evt');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO events (
      id, organiser_id, category_id, title, description, additional_instructions,
      event_date, start_time, end_time, registration_deadline, venue, capacity, image_url,
      status, moderation_note, featured, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?)`
  ).run(
    id,
    req.authUser!.id,
    d.categoryId,
    d.title,
    d.description,
    d.additionalInstructions,
    d.eventDate,
    d.startTime,
    d.endTime,
    d.registrationDeadline,
    d.venue,
    d.capacity,
    d.imageUrl,
    d.status,
    now,
    now
  );

  const created = queryEventById(id, req.authUser!.id);
  res.status(201).json({ event: created });
});

app.patch('/api/events/:id', requireAuth, requireRole('organiser', 'admin'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const existing = queryEventById(req.params.id, req.authUser!.id);
  if (!existing) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (req.authUser!.role !== 'admin' && existing.organiser_id !== req.authUser!.id) {
    res.status(403).json({ error: 'You can only edit events created by your account.' });
    return;
  }

  const parsed = validateEventInput({
    title: req.body?.title ?? existing.title,
    description: req.body?.description ?? existing.description,
    additional_instructions: req.body?.additional_instructions ?? existing.additional_instructions,
    category_id: req.body?.category_id ?? existing.category_id,
    event_date: req.body?.event_date ?? existing.event_date,
    start_time: req.body?.start_time ?? existing.start_time,
    end_time: req.body?.end_time ?? existing.end_time,
    registration_deadline: req.body?.registration_deadline ?? existing.registration_deadline,
    venue: req.body?.venue ?? existing.venue,
    capacity: req.body?.capacity ?? existing.capacity,
    image_url: req.body?.image_url ?? existing.image_url,
    status: req.body?.status ?? existing.status,
  });

  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const d = parsed.data;
  if (d.capacity < existing.registration_count) {
    res.status(400).json({
      error: `Capacity cannot be lower than current confirmed registrations (${existing.registration_count}).`,
    });
    return;
  }

  const now = new Date().toISOString();
  const clearSummary = d.description !== existing.description ? null : existing.ai_summary ? JSON.stringify(existing.ai_summary) : null;

  db.prepare(
    `UPDATE events
     SET category_id = ?, title = ?, description = ?, ai_summary = ?, additional_instructions = ?,
         event_date = ?, start_time = ?, end_time = ?, registration_deadline = ?,
         venue = ?, capacity = ?, image_url = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    d.categoryId,
    d.title,
    d.description,
    clearSummary,
    d.additionalInstructions,
    d.eventDate,
    d.startTime,
    d.endTime,
    d.registrationDeadline,
    d.venue,
    d.capacity,
    d.imageUrl,
    d.status,
    now,
    existing.id
  );

  // Notify confirmed registrants if cancelled or key schedule/venue changed
  const scheduleChanged =
    d.eventDate !== existing.event_date ||
    d.startTime !== existing.start_time ||
    d.venue !== existing.venue;

  if (d.status === 'cancelled' && existing.status !== 'cancelled') {
    const registrants = db
      .prepare("SELECT user_id FROM registrations WHERE event_id = ? AND status = 'confirmed'")
      .all(existing.id) as Array<{ user_id: string }>;
    const ins = db.prepare(
      `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
       VALUES (?, ?, ?, 'event_cancelled', ?, ?, 0, ?)`
    );
    for (const r of registrants) {
      ins.run(
        generateId('ntf'),
        r.user_id,
        existing.id,
        `Event cancelled: ${d.title}`,
        `The organiser cancelled "${d.title}" scheduled for ${d.eventDate}.`,
        now
      );
    }
  } else if (d.status === 'published' && scheduleChanged) {
    const registrants = db
      .prepare("SELECT user_id FROM registrations WHERE event_id = ? AND status = 'confirmed'")
      .all(existing.id) as Array<{ user_id: string }>;
    const ins = db.prepare(
      `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
       VALUES (?, ?, ?, 'event_updated', ?, ?, 0, ?)`
    );
    for (const r of registrants) {
      ins.run(
        generateId('ntf'),
        r.user_id,
        existing.id,
        `Schedule update: ${d.title}`,
        `Updated details: ${d.eventDate} at ${d.startTime} in ${d.venue}.`,
        now
      );
    }
  }

  res.json({ event: queryEventById(existing.id, req.authUser!.id) });
});

app.delete('/api/events/:id', requireAuth, requireRole('organiser', 'admin'), (req: AuthenticatedRequest, res) => {
  const existing = queryEventById(req.params.id, req.authUser!.id);
  if (!existing) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (req.authUser!.role !== 'admin' && existing.organiser_id !== req.authUser!.id) {
    res.status(403).json({ error: 'You can only delete events created by your account.' });
    return;
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

app.post('/api/events/:id/announce', requireAuth, requireRole('organiser', 'admin'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const event = queryEventById(req.params.id, req.authUser!.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (req.authUser!.role !== 'admin' && event.organiser_id !== req.authUser!.id) {
    res.status(403).json({ error: 'You can only announce to your own event attendees.' });
    return;
  }
  const message = sanitizeText(req.body?.message, 500);
  if (message.length < 5) {
    res.status(400).json({ error: 'Announcement message must be at least 5 characters.' });
    return;
  }

  const registrants = db
    .prepare("SELECT user_id FROM registrations WHERE event_id = ? AND status = 'confirmed'")
    .all(event.id) as Array<{ user_id: string }>;

  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, 'announcement', ?, ?, 0, ?)`
  );
  const tx = db.transaction(() => {
    for (const r of registrants) {
      ins.run(generateId('ntf'), r.user_id, event.id, `Announcement: ${event.title}`, message, now);
    }
  });
  tx();

  res.json({ sentCount: registrants.length });
});

// ==========================================
// STUDENT REGISTRATION, SAVED EVENTS & DASHBOARD
// ==========================================

app.post('/api/events/:id/register', requireAuth, requireRole('student'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const eventId = req.params.id;
  const note = sanitizeText(req.body?.note, 300);

  try {
    const result = db.transaction(() => {
      const event = db
        .prepare('SELECT id, title, status, event_date, start_time, end_time, registration_deadline, venue, capacity FROM events WHERE id = ?')
        .get(eventId) as
        | {
            id: string;
            title: string;
            status: string;
            event_date: string;
            start_time: string;
            end_time: string;
            registration_deadline: string;
            venue: string;
            capacity: number;
          }
        | undefined;

      if (!event || event.status === 'draft' || event.status === 'flagged') {
        return { code: 404, error: 'Event not found.' };
      }
      if (event.status === 'cancelled') {
        return { code: 409, error: 'This event has been cancelled by the organiser.' };
      }

      const nowLocal = getLocalNowIsoMinute();
      if (`${event.event_date}T${event.end_time}` < nowLocal) {
        return { code: 409, error: 'This event has already finished.' };
      }
      if (event.registration_deadline < nowLocal) {
        return { code: 409, error: 'The registration deadline for this event has passed.' };
      }

      const existingReg = db
        .prepare('SELECT id, status, ticket_code FROM registrations WHERE event_id = ? AND user_id = ?')
        .get(eventId, userId) as { id: string; status: string; ticket_code: string } | undefined;

      if (existingReg && existingReg.status === 'confirmed') {
        return { code: 409, error: 'You are already registered for this event.' };
      }

      const currentCount = (
        db.prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND status = 'confirmed'").get(eventId) as {
          cnt: number;
        }
      ).cnt;

      if (currentCount >= event.capacity) {
        return { code: 409, error: 'This event has reached maximum capacity.' };
      }

      const nowIso = new Date().toISOString();
      const ticketCode = existingReg ? existingReg.ticket_code : generateTicketCode();

      if (existingReg) {
        db.prepare("UPDATE registrations SET status = 'confirmed', note = ?, registered_at = ?, updated_at = ? WHERE id = ?").run(
          note,
          nowIso,
          nowIso,
          existingReg.id
        );
      } else {
        db.prepare(
          `INSERT INTO registrations (id, event_id, user_id, status, note, ticket_code, registered_at, updated_at)
           VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?)`
        ).run(generateId('reg'), eventId, userId, note, ticketCode, nowIso, nowIso);
      }

      db.prepare(
        `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
         VALUES (?, ?, ?, 'registration_confirmed', ?, ?, 0, ?)`
      ).run(
        generateId('ntf'),
        userId,
        eventId,
        `Spot confirmed: ${event.title}`,
        `Pass ${ticketCode} confirmed for ${event.event_date} at ${event.start_time} in ${event.venue}.`,
        nowIso
      );

      return { code: 200, ticketCode };
    })();

    if ('error' in result) {
      res.status(result.code).json({ error: result.error });
      return;
    }

    res.json({
      ticketCode: result.ticketCode,
      event: queryEventById(eventId, userId),
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to process registration. Please try again.' });
  }
});

app.delete('/api/events/:id/register', requireAuth, requireRole('student'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const eventId = req.params.id;
  const event = queryEventById(eventId, userId);

  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (event.is_past) {
    res.status(409).json({ error: 'Past event registrations cannot be cancelled.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const info = db
    .prepare("UPDATE registrations SET status = 'cancelled', updated_at = ? WHERE event_id = ? AND user_id = ? AND status = 'confirmed'")
    .run(nowIso, eventId, userId);

  if (info.changes === 0) {
    res.status(404).json({ error: 'No active registration found for this event.' });
    return;
  }

  db.prepare(
    `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, 'registration_cancelled', ?, ?, 0, ?)`
  ).run(
    generateId('ntf'),
    userId,
    eventId,
    `Registration cancelled: ${event.title}`,
    `Your seat for ${event.title} has been released.`,
    nowIso
  );

  res.json({ event: queryEventById(eventId, userId) });
});

app.post('/api/events/:id/save', requireAuth, writeLimiter, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const event = queryEventById(req.params.id, userId);
  if (!event || event.status === 'draft' || event.status === 'flagged') {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  db.prepare(
    `INSERT OR IGNORE INTO saved_events (id, event_id, user_id, saved_at)
     VALUES (?, ?, ?, ?)`
  ).run(generateId('sav'), event.id, userId, new Date().toISOString());

  res.json({ event: queryEventById(event.id, userId) });
});

app.delete('/api/events/:id/save', requireAuth, writeLimiter, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  db.prepare('DELETE FROM saved_events WHERE event_id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ event: queryEventById(req.params.id, userId) });
});

app.post('/api/events/:id/report', requireAuth, writeLimiter, (req: AuthenticatedRequest, res) => {
  const event = queryEventById(req.params.id, req.authUser!.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  const reason = sanitizeText(req.body?.reason, 100);
  const details = sanitizeText(req.body?.details, 600);
  if (reason.length < 3) {
    res.status(400).json({ error: 'Please provide a reason for reporting this event.' });
    return;
  }

  const id = generateId('rep');
  db.prepare(
    `INSERT INTO event_reports (id, event_id, reporter_id, reason, details, status, admin_note, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', '', ?)`
  ).run(id, event.id, req.authUser!.id, reason, details, new Date().toISOString());

  res.status(201).json({ ok: true, id });
});

app.get('/api/student/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  ensureUpcomingRemindersForUser(userId);

  const allPublished = queryEvents({ timeframe: 'upcoming', sort: 'upcoming', limit: 60 }, userId).events;
  const registeredUpcoming = allPublished.filter((e) => e.is_registered && e.status === 'published');
  const savedEvents = allPublished.filter((e) => e.is_saved);

  const today = getTodayDateString();
  const weekAheadDate = new Date();
  weekAheadDate.setDate(weekAheadDate.getDate() + 7);
  const weekAhead = `${weekAheadDate.getFullYear()}-${String(weekAheadDate.getMonth() + 1).padStart(2, '0')}-${String(weekAheadDate.getDate()).padStart(2, '0')}`;

  const happeningToday = allPublished.filter((e) => e.event_date === today && e.status === 'published');
  const happeningThisWeek = allPublished.filter(
    (e) => e.event_date >= today && e.event_date <= weekAhead && e.status === 'published'
  );
  const trendingEvents = queryEvents({ timeframe: 'upcoming', sort: 'popular', limit: 6 }, userId).events.filter(
    (e) => e.status === 'published'
  );
  const recentlyAdded = queryEvents({ timeframe: 'upcoming', sort: 'newest', limit: 6 }, userId).events.filter(
    (e) => e.status === 'published'
  );

  const unreadNotifications = (
    db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0').get(userId) as { cnt: number }
  ).cnt;

  res.json({
    registeredUpcoming,
    savedEvents,
    happeningToday,
    happeningThisWeek,
    trendingEvents,
    recentlyAdded,
    unreadNotifications,
  });
});

// ==========================================
// ORGANISER DASHBOARD & ANALYTICS ROUTES
// ==========================================

app.get('/api/organiser/overview', requireAuth, requireRole('organiser', 'admin'), (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const events = queryEvents(
    {
      organiserId: user.role === 'admin' && req.query.all === 'true' ? undefined : user.id,
      includeNonPublished: true,
      sort: 'upcoming',
      limit: 100,
    },
    user.id
  ).events;

  const publishedEvents = events.filter((e) => e.status === 'published').length;
  const draftEvents = events.filter((e) => e.status === 'draft').length;
  const upcomingEvents = events.filter((e) => !e.is_past && e.status === 'published').length;
  const pastEvents = events.filter((e) => e.is_past && e.status === 'published').length;
  const totalRegistrations = events.reduce((acc, e) => acc + e.registration_count, 0);
  const totalCapacity = events.filter((e) => e.status === 'published').reduce((acc, e) => acc + e.capacity, 0);
  const averageFillRate = totalCapacity > 0 ? Math.round((totalRegistrations / totalCapacity) * 100) : 0;

  const trendRows = db
    .prepare(
      `SELECT substr(r.registered_at, 1, 10) AS date, COUNT(*) AS count
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.status = 'confirmed' AND e.organiser_id = ?
       GROUP BY substr(r.registered_at, 1, 10)
       ORDER BY date ASC
       LIMIT 14`
    )
    .all(user.id) as Array<{ date: string; count: number }>;

  res.json({
    stats: {
      totalEvents: events.length,
      publishedEvents,
      draftEvents,
      upcomingEvents,
      pastEvents,
      totalRegistrations,
      averageFillRate,
    },
    events,
    registrationTrends: trendRows,
  });
});

app.get(
  '/api/organiser/events/:id/registrations',
  requireAuth,
  requireRole('organiser', 'admin'),
  (req: AuthenticatedRequest, res) => {
    const event = queryEventById(req.params.id, req.authUser!.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    if (req.authUser!.role !== 'admin' && event.organiser_id !== req.authUser!.id) {
      res.status(403).json({ error: 'You can only view registrations for your own events.' });
      return;
    }

    const registrations = db
      .prepare(
        `SELECT r.id, r.event_id, r.user_id, u.name AS user_name, u.email AS user_email,
                u.department, u.year_of_study, r.status, r.note, r.ticket_code, r.registered_at
         FROM registrations r
         JOIN users u ON u.id = r.user_id
         WHERE r.event_id = ?
         ORDER BY r.registered_at DESC`
      )
      .all(event.id);

    res.json({ event, registrations });
  }
);

// ==========================================
// ADMIN MODERATION & GOVERNANCE ROUTES
// ==========================================

app.get('/api/admin/overview', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const users = db
    .prepare(
      `SELECT id, name, email, role, department, year_of_study, club_name, bio, interests_json, status, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all()
    .map((u: any) => ({
      ...u,
      interests: (() => {
        try {
          return JSON.parse(u.interests_json || '[]');
        } catch {
          return [];
        }
      })(),
    }));

  const events = queryEvents({ includeNonPublished: true, sort: 'newest', limit: 100 }, req.authUser!.id).events;

  const reports = db
    .prepare(
      `SELECT rep.*, e.title AS event_title, e.status AS event_status, u.name AS reporter_name
       FROM event_reports rep
       JOIN events e ON e.id = rep.event_id
       JOIN users u ON u.id = rep.reporter_id
       ORDER BY CASE WHEN rep.status = 'open' THEN 0 ELSE 1 END, rep.created_at DESC`
    )
    .all();

  const categories = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM events e WHERE e.category_id = c.id) AS event_count
       FROM categories c ORDER BY c.sort_order ASC`
    )
    .all();

  const totalRegistrations = (
    db.prepare("SELECT COUNT(*) as cnt FROM registrations WHERE status = 'confirmed'").get() as { cnt: number }
  ).cnt;

  res.json({
    stats: {
      totalUsers: users.length,
      studentsCount: users.filter((u: any) => u.role === 'student').length,
      organisersCount: users.filter((u: any) => u.role === 'organiser').length,
      adminsCount: users.filter((u: any) => u.role === 'admin').length,
      publishedEvents: events.filter((e) => e.status === 'published').length,
      flaggedEvents: events.filter((e) => e.status === 'flagged').length,
      totalRegistrations,
      openReports: (reports as any[]).filter((r) => r.status === 'open').length,
    },
    users,
    events,
    reports,
    categories,
  });
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), writeLimiter, (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  if (targetId === req.authUser!.id) {
    res.status(400).json({ error: 'You cannot modify your own administrator status or role.' });
    return;
  }

  const target = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(targetId) as
    | { id: string; role: string; status: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const nextStatus = req.body?.status === 'suspended' ? 'suspended' : req.body?.status === 'active' ? 'active' : target.status;
  const nextRole = ['student', 'organiser', 'admin'].includes(req.body?.role) ? req.body.role : target.role;

  db.prepare('UPDATE users SET status = ?, role = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    nextRole,
    new Date().toISOString(),
    targetId
  );

  res.json({ ok: true });
});

app.patch('/api/admin/events/:id/moderate', requireAuth, requireRole('admin'), writeLimiter, (req, res) => {
  const event = queryEventById(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  const status = ['published', 'flagged', 'cancelled', 'draft'].includes(req.body?.status)
    ? req.body.status
    : event.status;
  const moderationNote = sanitizeText(req.body?.moderation_note, 400);
  const featured = typeof req.body?.featured === 'boolean' ? (req.body.featured ? 1 : 0) : event.featured ? 1 : 0;
  const now = new Date().toISOString();

  db.prepare('UPDATE events SET status = ?, moderation_note = ?, featured = ?, updated_at = ? WHERE id = ?').run(
    status,
    moderationNote,
    featured,
    now,
    event.id
  );

  if (status !== event.status) {
    db.prepare(
      `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
       VALUES (?, ?, ?, 'moderation', ?, ?, 0, ?)`
    ).run(
      generateId('ntf'),
      event.organiser_id,
      event.id,
      `Moderation update: ${event.title}`,
      `Event status updated to "${status}". ${moderationNote ? `Note: ${moderationNote}` : ''}`,
      now
    );
  }

  res.json({ event: queryEventById(event.id) });
});

app.patch('/api/admin/reports/:id', requireAuth, requireRole('admin'), writeLimiter, (req, res) => {
  const status = req.body?.status === 'resolved' ? 'resolved' : req.body?.status === 'dismissed' ? 'dismissed' : null;
  if (!status) {
    res.status(400).json({ error: 'Status must be resolved or dismissed.' });
    return;
  }
  const adminNote = sanitizeText(req.body?.admin_note, 400);
  const now = new Date().toISOString();

  const info = db
    .prepare('UPDATE event_reports SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?')
    .run(status, adminNote, now, req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  res.json({ ok: true });
});

// ==========================================
// NOTIFICATIONS ROUTES
// ==========================================

app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  ensureUpcomingRemindersForUser(userId);

  const notifications = db
    .prepare(
      `SELECT n.*, e.title AS event_title
       FROM notifications n
       LEFT JOIN events e ON e.id = n.event_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`
    )
    .all(userId)
    .map((n: any) => ({ ...n, is_read: Boolean(n.is_read) }));

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;
  res.json({ notifications, unreadCount });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
  res.json({ ok: true });
});

app.delete('/api/notifications/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
  res.json({ ok: true });
});

// ==========================================
// SERVER-SIDE GEMINI AI ROUTES
// ==========================================

app.post(
  '/api/ai/generate-description',
  requireAuth,
  requireRole('organiser', 'admin'),
  aiLimiter,
  async (req, res) => {
    const title = sanitizeText(req.body?.title, 120);
    if (title.length < 3) {
      res.status(400).json({ error: 'Please enter an event title before generating a description.' });
      return;
    }

    try {
      const result = await generateEventDescription({
        title,
        categoryName: sanitizeText(req.body?.categoryName, 60),
        venue: sanitizeText(req.body?.venue, 120),
        eventDate: sanitizeText(req.body?.eventDate, 20),
        startTime: sanitizeText(req.body?.startTime, 10),
        endTime: sanitizeText(req.body?.endTime, 10),
        roughNotes: sanitizeText(req.body?.roughNotes, 800),
      });
      res.json(result);
    } catch (err: any) {
      res.status(err?.status || 502).json({ error: err?.message || 'AI description generation failed.' });
    }
  }
);

app.post(
  '/api/ai/suggest-category',
  requireAuth,
  requireRole('organiser', 'admin'),
  aiLimiter,
  async (req, res) => {
    const title = sanitizeText(req.body?.title, 120);
    const description = sanitizeText(req.body?.description, 1500);
    if (!title && !description) {
      res.status(400).json({ error: 'Provide a title or notes for category suggestion.' });
      return;
    }

    const categories = db.prepare('SELECT id, name, description FROM categories ORDER BY sort_order ASC').all() as Array<{
      id: string;
      name: string;
      description: string;
    }>;

    try {
      const result = await suggestEventCategory(title, description, categories);
      res.json(result);
    } catch (err: any) {
      res.status(err?.status || 502).json({ error: err?.message || 'AI category suggestion failed.' });
    }
  }
);

app.post('/api/ai/summarize', aiLimiter, async (req, res) => {
  const eventId = sanitizeText(req.body?.eventId, 64);
  if (!eventId) {
    res.status(400).json({ error: 'eventId is required.' });
    return;
  }

  const event = queryEventById(eventId);
  if (!event || event.status === 'draft' || event.status === 'flagged') {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  if (event.ai_summary && !req.body?.force) {
    res.json({ summary: event.ai_summary, cached: true });
    return;
  }

  try {
    const summary = await summarizeEventDetails({
      title: event.title,
      categoryName: event.category_name,
      description: event.description,
      additionalInstructions: event.additional_instructions,
      venue: event.venue,
      eventDate: event.event_date,
      startTime: event.start_time,
    });

    db.prepare('UPDATE events SET ai_summary = ? WHERE id = ?').run(JSON.stringify(summary), event.id);
    res.json({ summary, cached: false });
  } catch (err: any) {
    res.status(err?.status || 502).json({ error: err?.message || 'AI summarization failed.' });
  }
});

app.post('/api/ai/recommendations', requireAuth, aiLimiter, async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const upcoming = queryEvents({ timeframe: 'upcoming', sort: 'upcoming', limit: 30 }, user.id).events.filter(
    (e) => e.status === 'published' && !e.is_deadline_passed
  );

  const savedTitles = upcoming.filter((e) => e.is_saved).map((e) => e.title);
  const registeredTitles = upcoming.filter((e) => e.is_registered).map((e) => e.title);
  const candidates = upcoming.filter((e) => !e.is_registered && !e.is_full);

  try {
    const recs = await recommendCampusEvents({
      studentInterests: user.interests,
      savedTitles,
      registeredTitles,
      candidateEvents: candidates.map((e) => ({
        id: e.id,
        title: e.title,
        categoryName: e.category_name,
        eventDate: e.event_date,
        venue: e.venue,
        seatsRemaining: e.seats_remaining,
        registrationCount: e.registration_count,
        description: e.description,
      })),
    });

    const eventMap = new Map(candidates.map((e) => [e.id, e]));
    const items = recs
      .map((r) => ({ event: eventMap.get(r.eventId), reason: r.reason }))
      .filter((item) => Boolean(item.event));

    res.json({ recommendations: items });
  } catch (err: any) {
    res.status(err?.status || 502).json({ error: err?.message || 'AI recommendations failed.' });
  }
});

app.post('/api/ai/assistant', optionalAuth, aiLimiter, async (req: AuthenticatedRequest, res) => {
  const question = sanitizeText(req.body?.question, 400);
  if (question.length < 2) {
    res.status(400).json({ error: 'Please enter a question about campus events.' });
    return;
  }

  const published = queryEvents({ status: 'published', sort: 'upcoming', limit: 40 }, req.authUser?.id).events;
  const eventMap = new Map(published.map((e) => [e.id, e]));

  try {
    const result = await askCampusAssistant({
      question,
      todayDate: getTodayDateString(),
      userInterests: req.authUser?.interests || [],
      eventsSnapshot: published.map((e) => ({
        id: e.id,
        title: e.title,
        categoryName: e.category_name,
        organiserClub: e.organiser_club,
        eventDate: e.event_date,
        startTime: e.start_time,
        endTime: e.end_time,
        registrationDeadline: e.registration_deadline,
        venue: e.venue,
        seatsRemaining: e.seats_remaining,
        capacity: e.capacity,
        isPast: e.is_past,
        isDeadlinePassed: e.is_deadline_passed,
        description: e.description,
      })),
    });

    const citedEvents = result.citedEventIds.map((id) => eventMap.get(id)).filter(Boolean);
    res.json({ answer: result.answer, citedEvents });
  } catch (err: any) {
    res.status(err?.status || 502).json({ error: err?.message || 'Campus Assistant request failed.' });
  }
});

// Unknown /api route fallback
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Centralized Express error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quadline server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
