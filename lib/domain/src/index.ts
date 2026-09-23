export type Theme = "system" | "light" | "dark";
export interface Settings {
  theme: Theme;
  timezone: string;
  reminderDays: number[];
  reminderHour: number;
  emailReminders: boolean;
  country: string;
}
export interface Account {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  inboundAddress: string | null;
  settings: Settings;
}
export interface Purchase {
  id: string;
  title: string;
  store: string;
  merchantId: string | null;
  orderNumber: string;
  country: string;
  seller: string;
  currency: string;
  priceMinor: number | null;
  quantity: number;
  purchasedAt: string;
  deliveredAt: string | null;
  deadline: string | null;
  deadlineQuality: "manual" | "evidenced" | "estimated" | "missing";
  deadlineSource: string;
  notes: string;
  archived: boolean;
  keptQuantity: number;
  createdAt: string;
  updatedAt: string;
}
export type ReturnStatus =
  | "draft"
  | "requested"
  | "authorized"
  | "shipped"
  | "received"
  | "resolved"
  | "cancelled";
export type ReturnOutcome = "refund" | "exchange" | "voucher";
export interface CaseEvent {
  id: string;
  type: string;
  at: string;
  note: string;
  source: "user" | "email" | "system";
}
export interface Refund {
  id: string;
  amountMinor: number;
  currency: string;
  kind: "issued" | "received";
  at: string;
}
export interface ReturnCase {
  id: string;
  items: { purchaseId: string; quantity: number }[];
  status: ReturnStatus;
  outcome: ReturnOutcome;
  reference: string;
  dispatchBy: string | null;
  trackingUrl: string;
  notes: string;
  expectedMinor: number | null;
  currency: string;
  refunds: Refund[];
  events: CaseEvent[];
  createdAt: string;
  updatedAt: string;
}
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  purchaseId: string | null;
  returnId: string | null;
  read: boolean;
  createdAt: string;
  dedupeKey: string;
}
export interface ImportRecord {
  id: string;
  kind: string;
  status: "queued" | "processing" | "needs_review" | "completed" | "failed";
  title: string;
  message: string;
  purchaseIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface DocumentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  purchaseId: string | null;
  returnId: string | null;
  createdAt: string;
}
export interface AppState {
  revision: number;
  purchases: Purchase[];
  returns: ReturnCase[];
  notifications: AppNotification[];
  imports: ImportRecord[];
  documents: DocumentMeta[];
}
export interface Capability {
  state: "ready" | "not_configured" | "degraded";
  label: string;
  detail: string;
}
export interface Capabilities {
  emailInbound: Capability;
  extraction: Capability;
  search: Capability;
  emailReminders: Capability;
  scheduler: Capability;
  storage: Capability;
}
export interface Merchant {
  id: string;
  name: string;
  aliases: string[];
  country: string;
  hosts: string[];
  helpUrl: string;
  scope: string;
}
export interface LinkResult {
  status: "resolved" | "needs_review" | "not_found" | "unavailable";
  merchantId: string | null;
  url: string | null;
  host: string | null;
  kind: "portal" | "orders" | "policy" | "support" | null;
  label: string;
  explanation: string;
  checkedAt: string | null;
  sourceUrl: string | null;
  verified: boolean;
}
export const RETURN_LABELS: Record<ReturnStatus, string> = {
  draft: "Preparando",
  requested: "Solicitada",
  authorized: "Lista para enviar",
  shipped: "Enviada",
  received: "Recibida por la tienda",
  resolved: "Completada",
  cancelled: "Cancelada",
};
export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  timezone: "Europe/Madrid",
  reminderDays: [7, 3, 1, 0],
  reminderHour: 9,
  emailReminders: false,
  country: "ES",
};
export const emptyState = (): AppState => ({
  revision: 0,
  purchases: [],
  returns: [],
  notifications: [],
  imports: [],
  documents: [],
});
export function localDate(
  now = new Date(),
  timezone = "Europe/Madrid",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function daysRemaining(
  date: string | null,
  timezone = "Europe/Madrid",
  now = new Date(),
): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== date
  )
    return null;
  return Math.round(
    (value - Date.parse(`${localDate(now, timezone)}T12:00:00Z`)) / 86400000,
  );
}
export function deadlineLabel(
  p: Pick<Purchase, "deadline" | "deadlineQuality">,
  timezone = "Europe/Madrid",
): string {
  const d = daysRemaining(p.deadline, timezone);
  if (d === null) return "Plazo por confirmar";
  const label =
    d < 0
      ? "Plazo registrado vencido"
      : d === 0
        ? "Vence hoy"
        : d === 1
          ? "Vence mañana"
          : `Quedan ${d} días`;
  return p.deadlineQuality === "estimated"
    ? `Estimado · ${label.toLowerCase()}`
    : label;
}
export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function formatMoney(minor: number | null, currency = "EUR"): string {
  if (minor === null) return "Importe pendiente";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    minor / 10 ** currencyDigits(currency),
  );
}
export function reservedQuantity(state: AppState, purchaseId: string): number {
  return state.returns
    .filter(
      (r) =>
        r.status !== "cancelled" ||
        r.events.some((e) =>
          ["shipped", "received", "resolved"].includes(e.type),
        ),
    )
    .flatMap((r) => r.items)
    .filter((i) => i.purchaseId === purchaseId)
    .reduce((sum, i) => sum + i.quantity, 0);
}
export function availableQuantity(state: AppState, p: Purchase): number {
  return Math.max(
    0,
    p.quantity - p.keptQuantity - reservedQuantity(state, p.id),
  );
}
