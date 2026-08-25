import { api } from "./client";
import type {
  AddressChange,
  AdhocRequest,
  AdminStats,
  Allocation,
  AllocationInput,
  AuditLog,
  BulkUploadResult,
  CopyWeekResult,
  DeadlineInfo,
  Page,
  TokenPair,
  TransportItem,
  User,
  WeekBoard,
  WeeklyRequest,
} from "./types";

// ------------------------------- auth ---------------------------------------
export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenPair>("/auth/login", { email, password }).then((r) => r.data),
  register: (payload: {
    name: string;
    email: string;
    contact_number?: string;
    address?: string;
    password: string;
  }) => api.post<TokenPair>("/auth/register", payload).then((r) => r.data),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  forgot: (email: string) =>
    api.post<{ detail: string }>("/auth/forgot-password", { email }).then((r) => r.data),
  reset: (token: string, new_password: string) =>
    api
      .post<{ detail: string }>("/auth/reset-password", { token, new_password })
      .then((r) => r.data),
};

// ------------------------------ profile -------------------------------------
export const userApi = {
  updateMe: (payload: { name?: string; contact_number?: string }) =>
    api.patch<User>("/users/me", payload).then((r) => r.data),
  requestAddressChange: (new_address: string) =>
    api.post<AddressChange>("/users/me/address-change", { new_address }).then((r) => r.data),
  myAddressChanges: () =>
    api.get<AddressChange[]>("/users/me/address-changes").then((r) => r.data),
  list: (params: { q?: string; role?: string; page?: number; size?: number }) =>
    api.get<Page<User>>("/users", { params }).then((r) => r.data),
  get: (id: number) => api.get<User>(`/users/${id}`).then((r) => r.data),
  update: (id: number, payload: Partial<User>) =>
    api.patch<User>(`/users/${id}`, payload).then((r) => r.data),
};

// ------------------------------ weekly --------------------------------------
export const weeklyApi = {
  deadline: (week_start?: string) =>
    api
      .get<DeadlineInfo>("/weekly/deadline", { params: { week_start } })
      .then((r) => r.data),
  mine: () => api.get<WeeklyRequest[]>("/weekly/mine").then((r) => r.data),
  submit: (payload: {
    week_start_date: string;
    days: { day_date: string; arrival_time: string }[];
  }) => api.post<WeeklyRequest>("/weekly", payload).then((r) => r.data),
};

// ------------------------------ adhoc ---------------------------------------
export const adhocApi = {
  create: (payload: { request_date: string; arrival_time: string; reason: string }) =>
    api.post<AdhocRequest>("/adhoc", payload).then((r) => r.data),
  mine: () => api.get<AdhocRequest[]>("/adhoc/mine").then((r) => r.data),
};

// ---------------------------- my transport ----------------------------------
export const transportApi = {
  mine: () => api.get<TransportItem[]>("/transport/mine").then((r) => r.data),
};

// ---------------------------- operations ------------------------------------
export const operationsApi = {
  stats: () =>
    api.get<Record<string, number>>("/operations/stats").then((r) => r.data),
  weekly: (status = "submitted", page = 1) =>
    api
      .get<Page<WeeklyRequest>>("/operations/weekly", { params: { status, page } })
      .then((r) => r.data),
  approveWeekly: (id: number) =>
    api.post<WeeklyRequest>(`/operations/weekly/${id}/approve`).then((r) => r.data),
  rejectWeekly: (id: number, remarks: string) =>
    api
      .post<WeeklyRequest>(`/operations/weekly/${id}/reject`, { remarks })
      .then((r) => r.data),
  adhoc: (page = 1, status?: string) =>
    api
      .get<Page<AdhocRequest>>("/operations/adhoc", { params: { page, status } })
      .then((r) => r.data),
  addressChanges: (status = "pending", page = 1) =>
    api
      .get<Page<AddressChange>>("/operations/address-changes", {
        params: { status, page },
      })
      .then((r) => r.data),
  approveAddress: (id: number) =>
    api
      .post<AddressChange>(`/operations/address-changes/${id}/approve`)
      .then((r) => r.data),
  rejectAddress: (id: number) =>
    api
      .post<AddressChange>(`/operations/address-changes/${id}/reject`)
      .then((r) => r.data),
};

// ---------------------------- facilities ------------------------------------
export const facilitiesApi = {
  board: (week_start: string) =>
    api.get<WeekBoard>("/facilities/board", { params: { week_start } }).then((r) => r.data),
  allocateWeekly: (weekly_request_day_id: number, data: AllocationInput) =>
    api
      .post<Allocation>("/facilities/allocate/weekly", {
        weekly_request_day_id,
        ...data,
      })
      .then((r) => r.data),
  allocateWeeklyBulk: (
    items: (AllocationInput & { weekly_request_day_id: number })[],
  ) =>
    api
      .post<Allocation[]>("/facilities/allocate/weekly/bulk", { items })
      .then((r) => r.data),
  copyWeek: (source_day_date: string, week_start_date: string) =>
    api
      .post<CopyWeekResult>("/facilities/copy-week", {
        source_day_date,
        week_start_date,
      })
      .then((r) => r.data),
  adhoc: () => api.get<AdhocRequest[]>("/facilities/adhoc").then((r) => r.data),
  allocateAdhoc: (adhoc_request_id: number, data: AllocationInput) =>
    api
      .post<Allocation>("/facilities/allocate/adhoc", { adhoc_request_id, ...data })
      .then((r) => r.data),
};

// ------------------------------ history -------------------------------------
export const historyApi = {
  allocations: (params: {
    employee?: string;
    driver?: string;
    vehicle?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
  }) =>
    api.get<Page<Allocation>>("/history/allocations", { params }).then((r) => r.data),
};

// ------------------------------- admin --------------------------------------
export const adminApi = {
  stats: () => api.get<AdminStats>("/admin/stats").then((r) => r.data),
  createUser: (payload: {
    name: string;
    email: string;
    contact_number?: string;
    address?: string;
    role: string;
  }) => api.post<User>("/admin/users", payload).then((r) => r.data),
  bulkUpload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<BulkUploadResult>("/admin/users/bulk-upload", form)
      .then((r) => r.data);
  },
  auditLogs: (params: {
    actor_id?: number;
    action?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
  }) => api.get<Page<AuditLog>>("/admin/audit-logs", { params }).then((r) => r.data),
};
