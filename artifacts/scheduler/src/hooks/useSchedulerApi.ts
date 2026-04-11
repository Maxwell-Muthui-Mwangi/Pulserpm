import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { schedulerFetch } from "../lib/customFetch";

const API = "/scheduler/api";

export interface Student {
  id: number;
  tutorId: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "archived";
  color: string | null;
  paymentStatus: "paid" | "pending" | "overdue";
  createdAt: string;
  updatedAt: string;
}

export interface ClassRecord {
  id: number;
  tutorId: number;
  studentId: number;
  studentName?: string;
  courseName: string;
  subject: string | null;
  isRecurring: boolean;
  recurringDays: number[] | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  semesterStart: string | null;
  semesterEnd: string | null;
  location: string | null;
  hourlyRate: number;
  notes: string | null;
  status: "active" | "completed" | "cancelled";
  agreedAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: number;
  tutorId: number;
  studentId: number;
  classId: number | null;
  title: string;
  notes: string | null;
  dueDate: string;
  status: "pending" | "in_progress" | "completed" | "submitted" | "overdue" | "not_started";
  priority: "low" | "medium" | "high" | "urgent";
  estimatedHours: number | null;
  actualHours: number | null;
  notified48h: boolean;
  notifiedDayOf: boolean;
  notified2h: boolean;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  studentColor?: string;
  className?: string | null;
}

export interface AssignmentsResponse {
  data: Assignment[];
  total: number;
  limit: number;
  offset: number;
}

export interface Payment {
  id: number;
  tutorId: number;
  studentId: number;
  studentName?: string;
  description: string | null;
  agreedAmount: number;
  paidAmount: number;
  status: "pending" | "paid" | "partial" | "overdue";
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentsResponse = Payment[];

export interface EarningsResponse {
  totalEarned: number;
  totalPending: number;
  totalOverdue: number;
  monthlyRevenue: { month: string; amount: number }[];
  byStudent: { studentId: number; studentName: string; earned: number; pending: number }[];
  recentTransactions: Payment[];
}

export interface DashboardResponse {
  upcomingAssignments: Assignment[];
  overdueAssignments: Assignment[];
  recentPayments: Payment[];
  stats: {
    totalStudents: number;
    activeStudents: number;
    pendingAssignments: number;
    overdueAssignments: number;
    monthlyEarnings: number;
    pendingPayments: number;
  };
}

export interface CalendarEntry {
  date: string;
  assignments: Assignment[];
  classes: ClassRecord[];
}

export interface HeatmapEntry {
  date: string;
  count: number;
}

export interface SearchResult {
  students: Student[];
  assignments: Assignment[];
}

export interface StudentBody {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  status?: "active" | "archived";
  color?: string;
  paymentStatus?: "paid" | "pending" | "overdue";
}

export interface ClassBody {
  studentId: number;
  courseName: string;
  subject?: string;
  isRecurring?: boolean;
  recurringDays?: number[] | null;
  date?: string | null;
  startTime?: string;
  endTime?: string;
  semesterStart?: string | null;
  semesterEnd?: string | null;
  location?: string;
  hourlyRate?: number | null;
  notes?: string;
  status?: "active" | "completed" | "cancelled";
  agreedAmount?: number;
  estimatedHoursPerSession?: number;
}

export interface AssignmentBody {
  studentId: number;
  classId?: number | null;
  title: string;
  notes?: string;
  dueDate: string;
  status?: "pending" | "in_progress" | "completed" | "submitted" | "overdue" | "not_started";
  priority?: "low" | "medium" | "high" | "urgent";
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export interface PaymentBody {
  studentId: number;
  description?: string;
  agreedAmount: number;
  paidAmount?: number;
  status?: "pending" | "paid" | "partial" | "overdue";
  dueDate?: string;
  paidAt?: string;
  notes?: string;
}

export function useSchedulerDashboard() {
  return useQuery({
    queryKey: ["scheduler", "dashboard"],
    queryFn: () => schedulerFetch<DashboardResponse>(`${API}/dashboard`),
  });
}

export function useSchedulerHeatmap(year?: number) {
  return useQuery({
    queryKey: ["scheduler", "heatmap", year],
    queryFn: () => schedulerFetch<HeatmapEntry[]>(`${API}/dashboard/heatmap${year ? `?year=${year}` : ""}`),
  });
}

export function useSchedulerStudents(params?: { search?: string; status?: string; isActive?: boolean }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  else if (params?.isActive !== undefined) q.set("status", params.isActive ? "active" : "archived");
  return useQuery({
    queryKey: ["scheduler", "students", params],
    queryFn: () => schedulerFetch<Student[]>(`${API}/students?${q}`),
  });
}

export interface StudentProfile {
  student: Student & {
    totalAssignments: number;
    completedAssignments: number;
    completionRate: number;
    totalOwed: number;
    totalPaid: number;
  };
  assignments: Assignment[];
  classes: ClassRecord[];
  payments: Payment[];
}

export function useSchedulerStudent(id: number) {
  return useQuery({
    queryKey: ["scheduler", "student", id],
    queryFn: () => schedulerFetch<StudentProfile>(`${API}/students/${id}`),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StudentBody) => schedulerFetch<Student>(`${API}/students`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduler", "students"] }),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<StudentBody>) => schedulerFetch<Student>(`${API}/students/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduler", "students"] }),
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => schedulerFetch<{ ok: boolean }>(`${API}/students/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduler", "students"] }),
  });
}

export function useSchedulerClasses(params?: { studentId?: number; isRecurring?: boolean }) {
  const q = new URLSearchParams();
  if (params?.studentId) q.set("studentId", String(params.studentId));
  if (params?.isRecurring !== undefined) q.set("isRecurring", String(params.isRecurring));
  return useQuery({
    queryKey: ["scheduler", "classes", params],
    queryFn: () => schedulerFetch<ClassRecord[]>(`${API}/classes?${q}`),
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ClassBody) => schedulerFetch<ClassRecord>(`${API}/classes`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "classes"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
    },
  });
}

export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<ClassBody>) => schedulerFetch<ClassRecord>(`${API}/classes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "classes"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
    },
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => schedulerFetch<{ ok: boolean }>(`${API}/classes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "classes"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
    },
  });
}

export function useSchedulerAssignments(params?: { studentId?: number; classId?: number; status?: string; priority?: string; limit?: number; offset?: number; dateFrom?: string; dateTo?: string; search?: string }) {
  const q = new URLSearchParams();
  if (params?.studentId) q.set("studentId", String(params.studentId));
  if (params?.classId) q.set("classId", String(params.classId));
  if (params?.status) q.set("status", params.status);
  if (params?.priority) q.set("priority", params.priority);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  if (params?.search) q.set("search", params.search);
  return useQuery({
    queryKey: ["scheduler", "assignments", params],
    queryFn: () => schedulerFetch<AssignmentsResponse>(`${API}/assignments?${q}`),
  });
}

export function useSchedulerCalendar(params?: { month?: number; year?: number }) {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  return useQuery({
    queryKey: ["scheduler", "calendar", params],
    queryFn: () => schedulerFetch<Assignment[]>(`${API}/calendar?${q}`),
    enabled: !!(params?.month && params?.year),
  });
}

export function useSchedulerWeekly(params?: { weekStart?: string }) {
  const q = new URLSearchParams();
  if (params?.weekStart) q.set("weekStart", params.weekStart);
  return useQuery({
    queryKey: ["scheduler", "weekly", params],
    queryFn: () => schedulerFetch<Assignment[]>(`${API}/weekly?${q}`),
    enabled: !!params?.weekStart,
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignmentBody) => schedulerFetch<Assignment>(`${API}/assignments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "weekly"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "dashboard"] });
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<AssignmentBody>) => schedulerFetch<Assignment>(`${API}/assignments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "weekly"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "dashboard"] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => schedulerFetch<{ ok: boolean }>(`${API}/assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "weekly"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "dashboard"] });
    },
  });
}

export function useRescheduleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: number; dueDate: string }) =>
      schedulerFetch<Assignment>(`${API}/assignments/${id}/reschedule`, { method: "PATCH", body: JSON.stringify({ dueDate }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "calendar"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "weekly"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "dashboard"] });
    },
  });
}

export function useExportAssignments(params?: { status?: string; studentId?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.studentId) q.set("studentId", String(params.studentId));
  return useQuery({
    queryKey: ["scheduler", "export", params],
    queryFn: () => schedulerFetch<string>(`${API}/export/assignments?${q}`, { responseType: "text" }),
    enabled: false,
  });
}

export function useSchedulerPayments(params?: { studentId?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.studentId) q.set("studentId", String(params.studentId));
  if (params?.status) q.set("status", params.status);
  return useQuery({
    queryKey: ["scheduler", "payments", params],
    queryFn: () => schedulerFetch<PaymentsResponse>(`${API}/payments?${q}`),
  });
}

export function useSchedulerEarnings(params?: { year?: number; month?: number }) {
  const q = new URLSearchParams();
  if (params?.year) q.set("year", String(params.year));
  if (params?.month !== undefined) q.set("month", String(params.month));
  return useQuery({
    queryKey: ["scheduler", "earnings", params],
    queryFn: () => schedulerFetch<EarningsResponse>(`${API}/earnings?${q}`),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentBody) => schedulerFetch<Payment>(`${API}/payments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "payments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "earnings"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "dashboard"] });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<PaymentBody>) => schedulerFetch<Payment>(`${API}/payments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "payments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "earnings"] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => schedulerFetch<{ ok: boolean }>(`${API}/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler", "payments"] });
      qc.invalidateQueries({ queryKey: ["scheduler", "earnings"] });
    },
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ["scheduler", "search", q],
    queryFn: () => schedulerFetch<SearchResult>(`${API}/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
}
