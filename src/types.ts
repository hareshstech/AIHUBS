export type UserRole = 'student' | 'organiser' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'flagged';
export type RegistrationStatus = 'confirmed' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  year_of_study: string;
  club_name: string;
  bio: string;
  interests: string[];
  status: UserStatus;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  accent_color: string;
  sort_order: number;
  event_count?: number;
}

export interface AISummary {
  tldr: string;
  whoShouldAttend: string;
  takeaways: string[];
}

export interface CampusEvent {
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
  ai_summary: AISummary | null;
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
  featured: boolean;
  registration_count: number;
  seats_remaining: number;
  is_full: boolean;
  is_past: boolean;
  is_deadline_passed: boolean;
  is_registered: boolean;
  my_ticket_code: string | null;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  department: string;
  year_of_study: string;
  status: RegistrationStatus;
  note: string;
  ticket_code: string;
  registered_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  event_id: string | null;
  event_title?: string | null;
  type:
    | 'registration_confirmed'
    | 'registration_cancelled'
    | 'event_updated'
    | 'event_cancelled'
    | 'event_reminder'
    | 'announcement'
    | 'moderation';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface EventReport {
  id: string;
  event_id: string;
  event_title: string;
  event_status: EventStatus;
  reporter_id: string;
  reporter_name: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  admin_note: string;
  created_at: string;
  resolved_at: string | null;
}

export interface StudentDashboardData {
  registeredUpcoming: CampusEvent[];
  savedEvents: CampusEvent[];
  happeningToday: CampusEvent[];
  happeningThisWeek: CampusEvent[];
  trendingEvents: CampusEvent[];
  recentlyAdded: CampusEvent[];
  unreadNotifications: number;
}

export interface OrganiserOverviewData {
  stats: {
    totalEvents: number;
    publishedEvents: number;
    draftEvents: number;
    upcomingEvents: number;
    pastEvents: number;
    totalRegistrations: number;
    averageFillRate: number;
  };
  events: CampusEvent[];
  registrationTrends: Array<{ date: string; count: number }>;
}

export interface AdminOverviewData {
  stats: {
    totalUsers: number;
    studentsCount: number;
    organisersCount: number;
    adminsCount: number;
    publishedEvents: number;
    flaggedEvents: number;
    totalRegistrations: number;
    openReports: number;
  };
  users: User[];
  events: CampusEvent[];
  reports: EventReport[];
  categories: Category[];
}
