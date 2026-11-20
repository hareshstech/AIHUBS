import { db, generateId } from './db.ts';
import type { AISummary, CampusEvent, EventStatus } from '../src/types.ts';

interface RawEventRow {
  id: string;
  organiser_id: string;
  organiser_name: string;
  organiser_club: string;
  organiser_department: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_color: string;
  title: string;
  description: string;
  ai_summary: string | null;
  additional_instructions: string;
  event_date: string;
  start_time: string;
  end_time: string;
  registration_deadline: string;
  venue: string;
  capacity: number;
  image_url: string;
  status: EventStatus;
  moderation_note: string;
  featured: number;
  registration_count: number;
  created_at: string;
  updated_at: string;
}

export function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLocalNowIsoMinute(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

const BASE_EVENT_SELECT = `
  SELECT
    e.*,
    u.name AS organiser_name,
    u.club_name AS organiser_club,
    u.department AS organiser_department,
    c.name AS category_name,
    c.slug AS category_slug,
    c.accent_color AS category_color,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'confirmed') AS registration_count
  FROM events e
  JOIN users u ON u.id = e.organiser_id
  JOIN categories c ON c.id = e.category_id
`;

export function enrichEventRows(rows: RawEventRow[], userId?: string): CampusEvent[] {
  if (rows.length === 0) return [];

  const regMap = new Map<string, string>();
  const savedSet = new Set<string>();

  if (userId) {
    const regs = db
      .prepare("SELECT event_id, ticket_code FROM registrations WHERE user_id = ? AND status = 'confirmed'")
      .all(userId) as Array<{ event_id: string; ticket_code: string }>;
    for (const r of regs) regMap.set(r.event_id, r.ticket_code);

    const saved = db
      .prepare('SELECT event_id FROM saved_events WHERE user_id = ?')
      .all(userId) as Array<{ event_id: string }>;
    for (const s of saved) savedSet.add(s.event_id);
  }

  const nowLocal = getLocalNowIsoMinute();

  return rows.map((row) => {
    const seatsRemaining = Math.max(0, row.capacity - row.registration_count);
    const eventEndLocal = `${row.event_date}T${row.end_time}`;
    const isPast = eventEndLocal < nowLocal;
    const isDeadlinePassed = row.registration_deadline < nowLocal;

    let parsedSummary: AISummary | null = null;
    if (row.ai_summary) {
      try {
        parsedSummary = JSON.parse(row.ai_summary) as AISummary;
      } catch {
        parsedSummary = null;
      }
    }

    return {
      id: row.id,
      organiser_id: row.organiser_id,
      organiser_name: row.organiser_name,
      organiser_club: row.organiser_club || row.organiser_name,
      organiser_department: row.organiser_department,
      category_id: row.category_id,
      category_name: row.category_name,
      category_slug: row.category_slug,
      category_color: row.category_color,
      title: row.title,
      description: row.description,
      ai_summary: parsedSummary,
      additional_instructions: row.additional_instructions,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
      registration_deadline: row.registration_deadline,
      venue: row.venue,
      capacity: row.capacity,
      image_url: row.image_url,
      status: row.status,
      moderation_note: row.moderation_note,
      featured: Boolean(row.featured),
      registration_count: row.registration_count,
      seats_remaining: seatsRemaining,
      is_full: seatsRemaining <= 0,
      is_past: isPast,
      is_deadline_passed: isDeadlinePassed,
      is_registered: regMap.has(row.id),
      my_ticket_code: regMap.get(row.id) || null,
      is_saved: savedSet.has(row.id),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export function queryEventById(eventId: string, userId?: string): CampusEvent | null {
  const row = db.prepare(`${BASE_EVENT_SELECT} WHERE e.id = ?`).get(eventId) as RawEventRow | undefined;
  if (!row) return null;
  return enrichEventRows([row], userId)[0] || null;
}

export interface EventSearchFilters {
  q?: string;
  category?: string;
  timeframe?: string;
  date?: string;
  location?: string;
  availability?: string;
  status?: string;
  sort?: string;
  organiserId?: string;
  includeNonPublished?: boolean;
  limit?: number;
  offset?: number;
}

export function queryEvents(filters: EventSearchFilters, userId?: string): { events: CampusEvent[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeNonPublished) {
    if (filters.status && ['published', 'cancelled'].includes(filters.status)) {
      where.push('e.status = ?');
      params.push(filters.status);
    } else {
      where.push("e.status IN ('published', 'cancelled')");
    }
  } else if (filters.status && filters.status !== 'all') {
    where.push('e.status = ?');
    params.push(filters.status);
  }

  if (filters.organiserId) {
    where.push('e.organiser_id = ?');
    params.push(filters.organiserId);
  }

  if (filters.q && filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    where.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ? OR u.name LIKE ? OR u.club_name LIKE ?)');
    params.push(term, term, term, term, term);
  }

  if (filters.category && filters.category !== 'all') {
    where.push('(c.slug = ? OR c.id = ?)');
    params.push(filters.category, filters.category);
  }

  if (filters.location && filters.location !== 'all') {
    where.push('e.venue LIKE ?');
    params.push(`%${filters.location.trim()}%`);
  }

  const today = getTodayDateString();
  const weekAheadDate = new Date();
  weekAheadDate.setDate(weekAheadDate.getDate() + 7);
  const weekAhead = `${weekAheadDate.getFullYear()}-${String(weekAheadDate.getMonth() + 1).padStart(2, '0')}-${String(weekAheadDate.getDate()).padStart(2, '0')}`;
  const nowLocal = getLocalNowIsoMinute();

  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    where.push('e.event_date = ?');
    params.push(filters.date);
  } else if (filters.timeframe === 'today') {
    where.push('e.event_date = ?');
    params.push(today);
  } else if (filters.timeframe === 'week') {
    where.push('e.event_date >= ? AND e.event_date <= ?');
    params.push(today, weekAhead);
  } else if (filters.timeframe === 'upcoming') {
    where.push("(e.event_date || 'T' || e.end_time) >= ?");
    params.push(nowLocal);
  } else if (filters.timeframe === 'past') {
    where.push("(e.event_date || 'T' || e.end_time) < ?");
    params.push(nowLocal);
  }

  if (filters.availability === 'open') {
    where.push(`
      e.status = 'published'
      AND (e.event_date || 'T' || e.end_time) >= ?
      AND e.registration_deadline >= ?
      AND (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'confirmed') < e.capacity
    `);
    params.push(nowLocal, nowLocal);
  } else if (filters.availability === 'full') {
    where.push('(SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = \'confirmed\') >= e.capacity');
  } else if (filters.availability === 'closing_soon') {
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const in48hStr = `${in48h.getFullYear()}-${String(in48h.getMonth() + 1).padStart(2, '0')}-${String(in48h.getDate()).padStart(2, '0')}T${String(in48h.getHours()).padStart(2, '0')}:${String(in48h.getMinutes()).padStart(2, '0')}`;
    where.push("e.status = 'published' AND e.registration_deadline >= ? AND e.registration_deadline <= ?");
    params.push(nowLocal, in48hStr);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY e.event_date ASC, e.start_time ASC';
  if (filters.sort === 'popular') {
    orderSql = 'ORDER BY registration_count DESC, e.event_date ASC';
  } else if (filters.sort === 'newest') {
    orderSql = 'ORDER BY e.created_at DESC';
  } else if (filters.sort === 'upcoming') {
    orderSql = `ORDER BY CASE WHEN (e.event_date || 'T' || e.end_time) >= '${nowLocal}' THEN 0 ELSE 1 END ASC, e.event_date ASC, e.start_time ASC`;
  }

  const countSql = `
    SELECT COUNT(*) as total
    FROM events e
    JOIN users u ON u.id = e.organiser_id
    JOIN categories c ON c.id = e.category_id
    ${whereSql}
  `;
  const total = (db.prepare(countSql).get(...params) as { total: number }).total;

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const rows = db
    .prepare(`${BASE_EVENT_SELECT} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as RawEventRow[];

  return {
    events: enrichEventRows(rows, userId),
    total,
  };
}

export function ensureUpcomingRemindersForUser(userId: string): void {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nowStr = getLocalNowIsoMinute();
  const in24hStr = `${in24h.getFullYear()}-${String(in24h.getMonth() + 1).padStart(2, '0')}-${String(in24h.getDate()).padStart(2, '0')}T${String(in24h.getHours()).padStart(2, '0')}:${String(in24h.getMinutes()).padStart(2, '0')}`;

  // 1. Registered upcoming events within 24h
  const upcomingRegs = db
    .prepare(
      `SELECT e.id, e.title, e.event_date, e.start_time, e.venue
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.user_id = ? AND r.status = 'confirmed' AND e.status = 'published'
         AND (e.event_date || 'T' || e.start_time) >= ?
         AND (e.event_date || 'T' || e.start_time) <= ?`
    )
    .all(userId, nowStr, in24hStr) as Array<{
    id: string;
    title: string;
    event_date: string;
    start_time: string;
    venue: string;
  }>;

  const checkExisting = db.prepare(
    "SELECT id FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_reminder' AND title LIKE ?"
  );
  const insertNotif = db.prepare(
    `INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, 'event_reminder', ?, ?, 0, ?)`
  );

  const createdAt = now.toISOString();

  for (const ev of upcomingRegs) {
    const titlePrefix = `Reminder: ${ev.title}`;
    const exists = checkExisting.get(userId, ev.id, `${titlePrefix}%`);
    if (!exists) {
      insertNotif.run(
        generateId('ntf'),
        userId,
        ev.id,
        titlePrefix,
        `Starts ${ev.event_date} at ${ev.start_time} in ${ev.venue}.`,
        createdAt
      );
    }
  }

  // 2. Saved events whose registration deadline is within 24h
  const closingSaved = db
    .prepare(
      `SELECT e.id, e.title, e.registration_deadline
       FROM saved_events s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = ? AND e.status = 'published'
         AND e.registration_deadline >= ? AND e.registration_deadline <= ?
         AND NOT EXISTS (
           SELECT 1 FROM registrations r WHERE r.event_id = e.id AND r.user_id = ? AND r.status = 'confirmed'
         )`
    )
    .all(userId, nowStr, in24hStr, userId) as Array<{
    id: string;
    title: string;
    registration_deadline: string;
  }>;

  for (const ev of closingSaved) {
    const title = `Deadline soon: ${ev.title}`;
    const exists = checkExisting.get(userId, ev.id, title);
    if (!exists) {
      insertNotif.run(
        generateId('ntf'),
        userId,
        ev.id,
        title,
        `Registration for your saved event closes at ${ev.registration_deadline.replace('T', ' ')}.`,
        createdAt
      );
    }
  }
}

export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').trim().slice(0, maxLen);
}

export function isValidImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/covers/') || url.startsWith('/uploads/')) return !url.includes('..');
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
