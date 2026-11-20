# Quadline — Campus Event Discovery & Operations Platform

Quadline unifies campus event discovery, registration, organiser publishing, administrative moderation, and Gemini-powered event intelligence into a single full-stack web application.

## Features Implemented

### Student Experience
- **Campus Event Discovery**: Real-time search by event title, club, organiser, or building; category tabs; timeframe filters (`Upcoming`, `Today`, `This Week`, `Past`, `All`); venue filter; exact date picker; registration availability filter (`Open`, `Closing Within 48h`, `Full`); sorting (`Upcoming First`, `Most Popular`, `Recently Added`).
- **Student Dashboard (`My Campus`)**: Personalized welcome, upcoming confirmed passes with ticket codes (`QL-XXXXXX`), saved events, today/this-week schedule, category shortcuts, editable interests, and **AI Recommended Events**.
- **Atomic Registration System**: Transactional SQLite registration preventing duplicate sign-ups, over-capacity bookings, past-event sign-ups, and post-deadline registrations. Includes 1-click cancellation and automatic seat release.
- **Notifications & Reminders**: Registration confirmations, cancellations, schedule updates, organiser announcements, and automatic 24-hour event/deadline reminders.

### Organiser Studio
- **Dashboard & Analytics**: Live counts of published, draft, upcoming, and past events, total registrations, average fill rate, and daily registration trend bars.
- **Fast Event Composer**: Create/edit events with validation, live card preview, local cover presets, safe magic-byte-verified image uploads (PNG/JPEG/WEBP <= 2 MB), draft/publish controls, and delete confirmation.
- **Registrants & Announcements**: View confirmed and cancelled student rosters, export CSVs, and broadcast announcements to all registered attendees.

### Administration & Moderation
- **Role-Based Governance**: Enforced on every backend API endpoint. Admins can review events, feature/flag/cancel/approve listings, manage user account statuses, resolve/dismiss student reports, and create/delete categories.

### Gemini AI Integration (Server-Side)
All Gemini calls (`gemini-4-hydrogen` via `@google/genai`) run exclusively on the Express backend (`/api/ai/*`):
- **AI Event Description Generator**: Drafts structured event descriptions and attendee instructions from organiser notes.
- **AI Category Recommendation**: Suggests the best-matching campus category from active database categories.
- **AI Event Summarization**: Generates and caches concise 3-point summaries (`tldr`, `whoShouldAttend`, `takeaways`).
- **AI Personalized Recommendations**: Matches students with open upcoming events based on interests and saved/registered history.
- **AI Campus Assistant**: Conversational assistant grounded strictly in live published campus events, returning clickable cited event cards.

## Demo Accounts (Fictional `.edu.example` Data Only)

- **Student**: `maya.chen@northbridge.edu.example` / `Student123!`
- **Organiser**: `acm.organiser@northbridge.edu.example` / `Organiser123!`
- **Admin**: `admin@northbridge.edu.example` / `Admin123!`

## Environment Variables

Configure via `.env` or deployment environment secrets (see `.env.example`):

- `GEMINI_API_KEY`: Server-side Gemini API key (never exposed to browser code).
- `JWT_SECRET`: Secret for signing HTTP-only session cookies.
- `APP_URL`: Public URL of the deployed service.
- `DB_PATH`: Optional SQLite database file path (defaults to `./data/quadline.db`).

## Scripts & Deployment

```bash
npm install
npm run dev      # Starts Express + Vite dev server on port 3000
npm run lint     # TypeScript check
npm run build    # Builds frontend production bundle into dist/
npm start        # Runs Express production server on port 3000 (node server.ts)
```
