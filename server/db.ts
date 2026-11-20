import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const defaultDbPath = path.resolve(process.cwd(), 'data', 'quadline.db');
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(path.resolve(process.cwd(), 'data', 'uploads'), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function formatDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'organiser', 'admin')),
      department TEXT NOT NULL DEFAULT '',
      year_of_study TEXT NOT NULL DEFAULT '',
      club_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      interests_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#2563EB',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      organiser_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      ai_summary TEXT DEFAULT NULL,
      additional_instructions TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      registration_deadline TEXT NOT NULL,
      venue TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      image_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published', 'cancelled', 'flagged')),
      moderation_note TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled')),
      note TEXT NOT NULL DEFAULT '',
      ticket_code TEXT NOT NULL UNIQUE,
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS saved_events (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      saved_at TEXT NOT NULL,
      UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('registration_confirmed', 'registration_cancelled', 'event_updated', 'event_cancelled', 'event_reminder', 'announcement', 'moderation')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_reports (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_date_status ON events(event_date, status);
    CREATE INDEX IF NOT EXISTS idx_events_organiser ON events(organiser_id);
    CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_event_status ON registrations(event_id, status);
    CREATE INDEX IF NOT EXISTS idx_registrations_user_status ON registrations(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON event_reports(status, created_at);
  `);

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    seedDummyCampusData();
  }
}

function seedDummyCampusData(): void {
  const now = new Date().toISOString();
  const studentHash = bcrypt.hashSync('Student123!', 10);
  const organiserHash = bcrypt.hashSync('Organiser123!', 10);
  const adminHash = bcrypt.hashSync('Admin123!', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, department, year_of_study, club_name, bio, interests_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const users = [
    ['usr_stu_1', 'Maya Chen', 'maya.chen@northbridge.edu.example', studentHash, 'student', 'Computer Science', 'Junior', '', 'Interested in systems engineering, campus hackathons, and robotics.', JSON.stringify(['Hackathons', 'Workshops', 'Tech Talks']), now, now],
    ['usr_stu_2', 'Liam Patel', 'liam.patel@northbridge.edu.example', studentHash, 'student', 'Mechanical Engineering', 'Sophomore', '', 'Varsity intramural basketball captain and maker studio regular.', JSON.stringify(['Sports', 'Workshops', 'Club Meetups']), now, now],
    ['usr_stu_3', 'Sofia Alvarez', 'sofia.alvarez@northbridge.edu.example', studentHash, 'student', 'Architecture & Design', 'Senior', '', 'Exploring acoustic music nights, architectural exhibits, and civic design.', JSON.stringify(['Cultural', 'Club Meetups']), now, now],
    ['usr_stu_4', 'Noah Brooks', 'noah.brooks@northbridge.edu.example', studentHash, 'student', 'Data Science', 'Freshman', '', 'Looking to join beginner coding workshops and campus clubs.', JSON.stringify(['Hackathons', 'Tech Talks']), now, now],
    ['usr_org_1', 'ACM & Innovation Guild', 'acm.organiser@northbridge.edu.example', organiserHash, 'organiser', 'School of Computing', '', 'ACM & Innovation Guild', 'Student-led computing chapter hosting hackathons, system design sprints, and technical workshops.', JSON.stringify(['Hackathons', 'Workshops', 'Tech Talks']), now, now],
    ['usr_org_2', 'Campus Cultural Collective', 'arts.organiser@northbridge.edu.example', organiserHash, 'organiser', 'Student Life & Arts', '', 'Campus Cultural Collective', 'Curating acoustic showcases, open-mic nights, film screenings, and annual heritage festivals.', JSON.stringify(['Cultural', 'Club Meetups']), now, now],
    ['usr_org_3', 'Intramural Sports Council', 'athletics.organiser@northbridge.edu.example', organiserHash, 'organiser', 'Athletics & Recreation', '', 'Intramural Sports Council', 'Organising inter-departmental tournaments, track meets, and fitness clinics across Northbridge.', JSON.stringify(['Sports']), now, now],
    ['usr_admin_1', 'Student Affairs Admin', 'admin@northbridge.edu.example', adminHash, 'admin', 'Office of Student Affairs', '', 'Campus Platform Governance', 'Maintaining event quality, safety guidelines, and category curation across Quadline.', JSON.stringify([]), now, now],
  ];

  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, slug, description, accent_color, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const categories = [
    ['cat_hack', 'Hackathons', 'hackathons', 'Multi-hour build sprints, coding competitions, and product challenges.', '#2563EB', 1, now],
    ['cat_work', 'Workshops', 'workshops', 'Hands-on technical labs, maker sessions, and skill-building clinics.', '#0284C7', 2, now],
    ['cat_cult', 'Cultural', 'cultural', 'Music showcases, theatre performances, exhibitions, and cultural nights.', '#D97706', 3, now],
    ['cat_sprt', 'Sports', 'sports', 'Intramural tournaments, inter-department leagues, and outdoor athletics.', '#16A34A', 4, now],
    ['cat_meet', 'Club Meetups', 'club-meetups', 'Weekly society gatherings, reading circles, and student mixer sessions.', '#4F46E5', 5, now],
    ['cat_talk', 'Tech Talks', 'tech-talks', 'Guest lectures, research colloquia, and alumni engineering panels.', '#0F766E', 6, now],
  ];

  const insertEvent = db.prepare(`
    INSERT INTO events (
      id, organiser_id, category_id, title, description, ai_summary, additional_instructions,
      event_date, start_time, end_time, registration_deadline, venue, capacity, image_url,
      status, moderation_note, featured, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const dToday = formatDateOffset(0);
  const dTomorrow = formatDateOffset(1);
  const dIn2 = formatDateOffset(2);
  const dIn4 = formatDateOffset(4);
  const dIn6 = formatDateOffset(6);
  const dIn10 = formatDateOffset(10);
  const dIn14 = formatDateOffset(14);
  const dYesterday = formatDateOffset(-1);
  const dPast3 = formatDateOffset(-3);
  const dPast7 = formatDateOffset(-7);

  const nowHour = new Date().getHours();
  const todayStart1 = nowHour < 16 ? '17:30' : nowHour < 20 ? `${String(nowHour + 1).padStart(2, '0')}:30` : '23:00';
  const todayEnd1 = nowHour < 16 ? '19:30' : nowHour < 20 ? `${String(nowHour + 3).padStart(2, '0')}:30` : '23:50';
  const todayDead1 = nowHour < 16 ? `${dToday}T16:30` : nowHour < 20 ? `${dToday}T${String(nowHour + 1).padStart(2, '0')}:00` : `${dToday}T22:45`;
  const todayStart2 = nowHour < 16 ? '19:00' : nowHour < 20 ? `${String(nowHour + 2).padStart(2, '0')}:00` : '23:15';
  const todayEnd2 = nowHour < 16 ? '21:30' : nowHour < 20 ? `${String(Math.min(23, nowHour + 3)).padStart(2, '0')}:45` : '23:55';
  const todayDead2 = nowHour < 16 ? `${dToday}T18:30` : nowHour < 20 ? `${dToday}T${String(nowHour + 1).padStart(2, '0')}:30` : `${dToday}T22:55`;

  const events = [
    [
      'evt_1', 'usr_org_1', 'cat_hack',
      'Northbridge Civic AI Build Sprint',
      'Join fellow developers, designers, and domain researchers for an intensive 12-hour campus build sprint focused on practical tools for student life, campus accessibility, and sustainability.\n\nTeams of 2 to 4 will pitch prototypes to faculty and alumni mentors. Meals, workspaces, and API sandboxes are provided on site.',
      JSON.stringify({
        tldr: 'A 12-hour collaborative build sprint creating practical campus software with mentorship and on-site meals.',
        whoShouldAttend: 'Developers, UI designers, and problem-solvers from any academic year.',
        takeaways: ['Form teams of 2-4 or match on site', 'Access mentorship from alumni engineers', 'Demo prototypes in front of campus judges'],
      }),
      'Bring your laptop, student ID, and charger. Doors open 30 minutes prior for team formation.',
      dIn2, '09:00', '21:00', `${dTomorrow}T23:59`,
      'Innovation Hall, Level 2', 120, '/covers/hackathon.svg',
      'published', '', 1, now, now
    ],
    [
      'evt_2', 'usr_org_1', 'cat_work',
      'Embedded Robotics & Sensor Lab',
      'A hands-on evening lab exploring microcontroller sensor fusion, motor drivers, and real-time telemetry debugging.\n\nEach workbench receives a pre-wired rover chassis, logic analyser, and starter firmware repository so you can focus on calibration and control loops.',
      null,
      'Closed-toe shoes required inside the Robotics Studio. Starter kits provided at check-in.',
      dToday, todayStart1, todayEnd1, todayDead1,
      'Engineering West, Studio 304', 28, '/covers/workshop.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_3', 'usr_org_2', 'cat_cult',
      'Lantern Courtyard Acoustic Evening',
      'An open-air twilight showcase featuring student acoustic ensembles, spoken word poets, and chamber duos performing beneath the West Quad colonnade.\n\nWarm spiced cider and acoustic seating mats will be available along the stone amphitheatre steps.',
      null,
      'Dress warmly for outdoor evening seating. Entry begins 20 minutes before the first set.',
      dToday, todayStart2, todayEnd2, todayDead2,
      'West Quad Amphitheatre', 160, '/covers/cultural.svg',
      'published', '', 1, now, now
    ],
    [
      'evt_4', 'usr_org_3', 'cat_sprt',
      'Inter-Department 3v3 Basketball Cup',
      'Fast-paced single-elimination 3v3 half-court tournament pitting engineering, sciences, humanities, and design squads against each other for the Autumn Challenge Trophy.\n\nReferees, scorekeepers, and court hydration stations are managed by the Intramural Sports Council.',
      null,
      'Register individually to be placed on your department bracket or note your 3-player squad name during sign-up.',
      dIn4, '14:00', '18:30', `${dIn2}T20:00`,
      'Northbridge Fieldhouse, Court A', 48, '/covers/sports.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_5', 'usr_org_1', 'cat_talk',
      'Distributed Systems at Scale: Alumni Panel',
      'Three Northbridge alumni engineers share architecture lessons from running high-throughput production systems, covering observability, graceful degradation, and incident post-mortems.\n\nFollowed by a 35-minute open Q&A and informal coffee social in the atrium.',
      null,
      'Submit questions in advance via your registration note if you want them prioritized during Q&A.',
      dTomorrow, '16:00', '17:45', `${dTomorrow}T15:00`,
      'Turing Auditorium, Room 101', 90, '/covers/meetup.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_6', 'usr_org_2', 'cat_meet',
      'Campus Design & Typography Critique Circle',
      'Bring posters, club zines, or portfolio case studies for a constructive 90-minute peer critique hosted by the Student Design Collective.\n\nWhether you are polishing your first layout or preparing for internship reviews, all disciplines are welcome.',
      null,
      'Optional: bring a printed draft or PDF on a tablet for table review.',
      dIn6, '15:00', '16:30', `${dIn4}T23:59`,
      'Library Commons, Seminar Room B', 3, '/covers/meetup.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_7', 'usr_org_1', 'cat_work',
      'Web Security & API Hardening Clinic',
      'Practical security clinic walking through authentication flows, rate limiting, SQL injection prevention, and secure session cookies in modern full-stack web apps.\n\nNote: Registration closed yesterday so lab containers could be provisioned for confirmed attendees.',
      null,
      'Pre-provisioned sandbox credentials will be distributed at the door.',
      dTomorrow, '13:00', '15:30', `${dYesterday}T23:59`,
      'Innovation Hall, Lab 108', 40, '/covers/hackathon.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_8', 'usr_org_2', 'cat_cult',
      'Autumn Film Society: Indie Shorts Showcase',
      'Curated screening of six award-winning student short films produced across campus media studios this semester, followed by a director roundtable.',
      null,
      'Complimentary popcorn provided; seating is general admission for registered guests.',
      dIn10, '18:30', '21:00', `${dIn6}T23:59`,
      'Founders Theatre', 110, '/covers/cultural.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_9', 'usr_org_3', 'cat_sprt',
      'Sunrise Campus 5K Fun Run',
      'Non-competitive community 5K loop circling the Botanical Ridge trail and main academic quad. Open to walkers, joggers, and competitive runners alike.',
      null,
      'Check-in opens at 06:45 at the Fieldhouse East Plaza. Bib numbers assigned on arrival.',
      dIn14, '07:15', '09:00', `${dIn10}T23:59`,
      'Fieldhouse East Plaza', 200, '/covers/sports.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_10', 'usr_org_1', 'cat_hack',
      'Winter Hardware Prototyping Jam (Draft)',
      'Early draft planning for our winter microcontroller and CAD sprint. Finalizing lab safety slots and component budget before publishing.',
      null,
      'Pending equipment inventory confirmation.',
      dIn14, '10:00', '18:00', `${dIn10}T18:00`,
      'Engineering West, Maker Bay', 50, '/covers/workshop.svg',
      'draft', '', 0, now, now
    ],
    [
      'evt_11', 'usr_org_1', 'cat_talk',
      'Intro to Open Source Maintainer Workflows',
      'Completed session covering Git hygiene, code reviews, issue triage, and sustainable open-source contribution practices for first-time campus contributors.',
      null,
      'Slides archived in the ACM chapter repository.',
      dPast3, '16:00', '17:30', `${dPast3}T14:00`,
      'Turing Auditorium, Room 101', 75, '/covers/meetup.svg',
      'published', '', 0, now, now
    ],
    [
      'evt_12', 'usr_org_2', 'cat_cult',
      'Printmaking & Poster Studio Open House',
      'Completed afternoon workshop introducing risograph colour separation and campus poster design traditions.',
      null,
      'All inks and heavyweight cotton paper supplied.',
      dPast7, '14:00', '17:00', `${dPast7}T12:00`,
      'Fine Arts Annex, Room 12', 30, '/covers/cultural.svg',
      'published', '', 0, now, now
    ],
  ];

  const insertReg = db.prepare(`
    INSERT INTO registrations (id, event_id, user_id, status, note, ticket_code, registered_at, updated_at)
    VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?)
  `);

  const insertSaved = db.prepare(`
    INSERT INTO saved_events (id, event_id, user_id, saved_at)
    VALUES (?, ?, ?, ?)
  `);

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, event_id, type, title, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertReport = db.prepare(`
    INSERT INTO event_reports (id, event_id, reporter_id, reason, details, status, admin_note, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', '', ?)
  `);

  const tx = db.transaction(() => {
    for (const u of users) insertUser.run(...u);
    for (const c of categories) insertCat.run(...c);
    for (const e of events) insertEvent.run(...e);

    const regSeeds: Array<[string, string, string, string, string, string]> = [
      ['reg_1', 'evt_1', 'usr_stu_1', 'Excited to build an accessible transit companion!', 'QL-48219A', formatDateOffset(-2) + 'T10:15:00.000Z'],
      ['reg_2', 'evt_1', 'usr_stu_2', 'Hardware + web dashboard team.', 'QL-48220B', formatDateOffset(-1) + 'T14:30:00.000Z'],
      ['reg_3', 'evt_1', 'usr_stu_4', 'First hackathon on campus!', 'QL-48221C', now],
      ['reg_4', 'evt_2', 'usr_stu_1', 'Bringing STM32 experience.', 'QL-51004D', formatDateOffset(-1) + 'T09:00:00.000Z'],
      ['reg_5', 'evt_2', 'usr_stu_2', '', 'QL-51005E', now],
      ['reg_6', 'evt_3', 'usr_stu_3', 'Bringing acoustic trio.', 'QL-60211F', formatDateOffset(-1) + 'T18:20:00.000Z'],
      ['reg_7', 'evt_4', 'usr_stu_2', 'MechEng Squad Alpha', 'QL-77310G', formatDateOffset(-2) + 'T11:45:00.000Z'],
      ['reg_8', 'evt_6', 'usr_stu_1', '', 'QL-88101H', formatDateOffset(-2) + 'T12:00:00.000Z'],
      ['reg_9', 'evt_6', 'usr_stu_3', '', 'QL-88102J', formatDateOffset(-1) + 'T13:10:00.000Z'],
      ['reg_10', 'evt_6', 'usr_stu_4', '', 'QL-88103K', now],
      ['reg_11', 'evt_11', 'usr_stu_1', '', 'QL-11901L', formatDateOffset(-5) + 'T10:00:00.000Z'],
      ['reg_12', 'evt_11', 'usr_stu_4', '', 'QL-11902M', formatDateOffset(-4) + 'T15:00:00.000Z'],
      ['reg_13', 'evt_12', 'usr_stu_3', '', 'QL-12001N', formatDateOffset(-8) + 'T09:30:00.000Z'],
    ];
    for (const r of regSeeds) {
      insertReg.run(r[0], r[1], r[2], r[3], r[4], r[5], r[5]);
    }

    insertSaved.run('sav_1', 'evt_5', 'usr_stu_1', now);
    insertSaved.run('sav_2', 'evt_3', 'usr_stu_1', now);
    insertSaved.run('sav_3', 'evt_8', 'usr_stu_3', now);

    insertNotif.run(
      'ntf_1', 'usr_stu_1', 'evt_1', 'registration_confirmed',
      'Spot confirmed: Northbridge Civic AI Build Sprint',
      'Your pass QL-48219A is active for Innovation Hall, Level 2.',
      0, now
    );
    insertNotif.run(
      'ntf_2', 'usr_stu_1', 'evt_2', 'event_reminder',
      'Happening today: Embedded Robotics & Sensor Lab',
      'Starts at 17:30 in Engineering West, Studio 304. Bring closed-toe shoes.',
      0, now
    );

    insertReport.run(
      'rep_1', 'evt_6', 'usr_stu_2',
      'Capacity too small for demand',
      'The critique room only has 3 seats listed — could the organiser check if a larger seminar room is available?',
      now
    );
  });

  tx();
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function generateTicketCode(): string {
  return `QL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
