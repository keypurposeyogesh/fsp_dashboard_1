// Shapes used by the legacy course, event, and administration queries.
// Database timestamps are ISO strings in Supabase responses.
export interface MemberSummary {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  users?: { email: string } | null;
}

export interface CourseRow {
  id: string;
  title: string;
  description?: string | null;
  created_at: string;
  course_enrollments?: { id: string }[];
}

export interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  fee?: number | null;
  image_url?: string | null;
  event_registrations?: { id: string }[];
}

export interface RegistrationRow {
  id: string;
  event_id: string;
  status: string;
  registered_at: string;
  members?: Omit<MemberSummary, "id"> | null;
}

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_date: string;
  membership_id?: string | null;
  event_id?: string | null;
  events?: { title: string } | null;
  members?: Omit<MemberSummary, "id"> | null;
}

export interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  course_id?: string | null;
  due_date?: string | null;
  courses?: { title: string } | null;
}

export interface SubmissionRow {
  id: string;
  task_id: string;
  submitted_at: string;
  grade: number | null;
  file_url: string;
  tasks?: { title: string } | null;
  members?: Omit<MemberSummary, "id"> | null;
}

export interface ResourceRow {
  id: string;
  title: string;
  url: string;
  description?: string | null;
  file_url?: string | null;
  type: string;
  course_id?: string | null;
  courses?: { title: string } | null;
}

export interface CommunityPostRow {
  id: string;
  content: string;
  created_at: string;
  parent_post_id: string | null;
  users?: { name: string | null; email?: string; role: string } | null;
}

export interface ActivityLogRow {
  id: string;
  action: string;
  ip_address: string | null;
  user_agent?: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  members?: Omit<MemberSummary, "id"> | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  payload: { title?: string; message?: string } | null;
  created_at: string;
  users?: { email: string } | null;
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}
