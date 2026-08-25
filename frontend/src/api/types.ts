export type Role = "employee" | "operations" | "facilities" | "super_admin";

export interface User {
  id: number;
  name: string;
  email: string;
  contact_number: string | null;
  address: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface WeeklyDay {
  id: number;
  day_date: string;
  arrival_time: string;
}

export type WeeklyStatus = "submitted" | "approved" | "rejected";

export interface WeeklyRequest {
  id: number;
  employee_id: number;
  week_start_date: string;
  status: WeeklyStatus;
  submitted_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  remarks: string | null;
  days: WeeklyDay[];
  employee?: User | null;
}

export interface DeadlineInfo {
  week_start_date: string;
  deadline: string;
  is_open: boolean;
  arrival_slots: string[];
}

export type AdhocStatus = "open" | "allocated" | "cancelled";

export interface AdhocRequest {
  id: number;
  employee_id: number;
  request_date: string;
  arrival_time: string;
  reason: string;
  status: AdhocStatus;
  created_at: string;
  employee?: User | null;
}

export interface Allocation {
  id: number;
  source_type: "weekly_day" | "adhoc";
  weekly_request_day_id: number | null;
  adhoc_request_id: number | null;
  employee_id: number;
  pickup_time: string;
  driver_name: string;
  driver_contact: string;
  vehicle_number: string;
  allocated_by: number;
  allocated_at: string;
  email_sent_at: string | null;
  employee?: User | null;
}

export interface AddressChange {
  id: number;
  employee_id: number;
  old_address: string | null;
  new_address: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
  employee?: User | null;
}

export interface TransportItem {
  source: "weekly" | "adhoc";
  trip_date: string;
  arrival_time: string;
  status: string;
  allocation: Allocation | null;
}

export interface BoardEntry {
  weekly_request_day_id: number;
  employee_id: number;
  employee_name: string;
  employee_email: string;
  arrival_time: string;
  allocation: Allocation | null;
}

export interface BoardDay {
  day_date: string;
  entries: BoardEntry[];
}

export interface WeekBoard {
  week_start_date: string;
  days: BoardDay[];
}

export interface AllocationInput {
  pickup_time: string;
  driver_name: string;
  driver_contact: string;
  vehicle_number: string;
}

export interface CopyWeekResult {
  copied: number;
  skipped_no_request: number;
  skipped_already_allocated: number;
  details: string[];
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  before_json: Record<string, any> | null;
  after_json: Record<string, any> | null;
  description: string | null;
  created_at: string;
  actor?: User | null;
}

export interface AdminStats {
  users_total: number;
  users_by_role: Record<string, number>;
  weekly_requests_this_week: number;
  allocations_this_week: number;
  emails_sent_total: number;
  pending_weekly_approvals: number;
  open_adhoc: number;
  pending_address_changes: number;
}

export interface BulkRowResult {
  row: number;
  email: string | null;
  status: string;
  detail: string | null;
}

export interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: number;
  rows: BulkRowResult[];
}
