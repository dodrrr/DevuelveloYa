import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Purchase,
  type ReturnCase,
  type ReturnStatus,
  type Settings,
} from "../../../../lib/domain/src/index.js";

export class ValidationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError(400, "Se esperaba un objeto válido.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  name: string,
  max = 2000,
  fallback = "",
): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string")
    throw new ValidationError(400, `${name}: introduce texto válido.`);
  const result = value.trim();
  if (result.length > max || /\u0000/.test(result))
    throw new ValidationError(
      400,
      `${name}: el texto es demasiado largo o no es válido.`,
    );
  return result;
}
export function integer(
  value: unknown,
  name: string,
  min = 0,
  max = 1_000_000_000_000,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new ValidationError(
      400,
      `${name}: introduce un número entero entre ${min} y ${max}.`,
    );
  return value;
}
function bool(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    throw new ValidationError(400, `${name}: valor inválido.`);
  return value;
}
export function dateOnly(
  value: unknown,
  name: string,
  nullable = false,
): string | null {
  if (nullable && (value === null || value === "" || value === undefined))
    return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2200-12-31"
  )
    throw new ValidationError(400, `${name}: usa una fecha válida.`);
  const d = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new ValidationError(400, `${name}: la fecha no existe.`);
  return value;
}
function timestamp(value: unknown): string {
  if (value === undefined) return new Date().toISOString();
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    throw new ValidationError(400, "Fecha del movimiento inválida.");
  dateOnly(value.slice(0, 10), "Fecha");
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()))
    throw new ValidationError(400, "Fecha del movimiento inválida.");
  return d.toISOString();
}
export function currency(value: unknown, fallback = "EUR"): string {
  const result = text(value, "Moneda", 3, fallback).toUpperCase();
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("currency");
  if (!/^[A-Z]{3}$/.test(result) || (supported && !supported.includes(result)))
    throw new ValidationError(400, "Selecciona una moneda reconocida.");
  return result;
}
function country(value: unknown, fallback = "ES"): string {
  const result = text(value, "País", 2, fallback).toUpperCase();
  if (!/^[A-Z]{2}$/.test(result))
    throw new ValidationError(400, "Usa un código de país de dos letras.");
  return result;
}
export function safeExternalUrl(value: unknown, fallback = ""): string {
  const result = text(value, "Enlace", 2048, fallback);
  if (!result) return "";
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new ValidationError(400, "El enlace no es válido.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    url.hostname === "localhost" ||
    /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    url.hostname.startsWith("[")
  )
    throw new ValidationError(
      400,
      "Usa un enlace HTTPS público, sin credenciales.",
    );
  return url.href;
}
export function validatePurchase(
  input: unknown,
  previous?: Purchase,
): Purchase {
  const raw = record(input);
  const take = (k: keyof Purchase, fallback?: unknown): unknown =>
    raw[k] === undefined ? (previous?.[k] ?? fallback) : raw[k];
  const title = text(take("title"), "Artículo", 160);
  const store = text(take("store"), "Tienda", 100);
  if (!title || !store)
    throw new ValidationError(400, "Indica el artículo y la tienda.");
  const quantity = integer(take("quantity", 1), "Unidades", 1, 9999);
  const purchasedAt = dateOnly(take("purchasedAt"), "Fecha de compra")!;
  const deliveredAt = dateOnly(
    take("deliveredAt", null),
    "Fecha de entrega",
    true,
  );
  const deadline = dateOnly(take("deadline", null), "Plazo", true);
  if (deliveredAt && deliveredAt < purchasedAt)
    throw new ValidationError(
      400,
      "La entrega no puede ser anterior a la compra.",
    );
  if (deadline && deadline < purchasedAt)
    throw new ValidationError(
      400,
      "El plazo no puede ser anterior a la compra.",
    );
  let quality = take("deadlineQuality", deadline ? "manual" : "missing");
  if (!deadline) quality = "missing";
  if (
    !["manual", "evidenced", "estimated", "missing"].includes(
      String(quality),
    ) ||
    (deadline && quality === "missing")
  )
    throw new ValidationError(
      400,
      "Indica cómo se obtuvo el plazo de devolución.",
    );
  const price = take("priceMinor", null);
  const source = text(take("deadlineSource"), "Fuente del plazo", 1000);
  if (quality === "evidenced" && !source)
    throw new ValidationError(400, "Añade la fuente que confirma el plazo.");
  const merchant = take("merchantId", null);
  return {
    id: previous?.id ?? randomUUID(),
    title,
    store,
    merchantId:
      merchant === null || merchant === ""
        ? null
        : text(merchant, "Tienda identificada", 100),
    orderNumber: text(take("orderNumber"), "Pedido", 120),
    country: country(take("country")),
    seller: text(take("seller"), "Vendedor", 160),
    currency: currency(take("currency")),
    priceMinor:
      price === null ? null : integer(price, "Importe total del artículo"),
    quantity,
    purchasedAt,
    deliveredAt,
    deadline,
    deadlineQuality: quality as Purchase["deadlineQuality"],
    deadlineSource: source,
    notes: text(take("notes"), "Notas", 5000),
    archived: bool(take("archived"), "Archivado", false),
    keptQuantity: integer(
      take("keptQuantity", 0),
      "Unidades conservadas",
      0,
      quantity,
    ),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function validateSettings(
  input: unknown,
  previous: Settings = DEFAULT_SETTINGS,
): Settings {
  const raw = record(input);
  const theme = raw.theme ?? previous.theme;
  if (!["system", "light", "dark"].includes(String(theme)))
    throw new ValidationError(400, "Tema no válido.");
  const timezone = text(raw.timezone, "Zona horaria", 80, previous.timezone);
  try {
    new Intl.DateTimeFormat("es", { timeZone: timezone }).format();
  } catch {
    throw new ValidationError(400, "Zona horaria no válida.");
  }
  const days = raw.reminderDays ?? previous.reminderDays;
  if (!Array.isArray(days) || days.length > 10)
    throw new ValidationError(400, "Elige hasta diez avisos.");
  const reminderDays = [
    ...new Set(days.map((v) => integer(v, "Días de aviso", 0, 365))),
  ].sort((a, b) => b - a);
  return {
    theme: theme as Settings["theme"],
    timezone,
    reminderDays,
    reminderHour: integer(
      raw.reminderHour ?? previous.reminderHour,
      "Hora de aviso",
      0,
      23,
    ),
    emailReminders: bool(
      raw.emailReminders,
      "Avisos por email",
      previous.emailReminders,
    ),
    country: country(raw.country, previous.country),
  };
}
function proportionalMinor(
  total: number,
  units: number,
  quantity: number,
): number {
  // Integer arithmetic preserves cent accuracy even near the supported amount limit.
  const numerator = BigInt(total) * BigInt(units);
  const denominator = BigInt(quantity);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}
function countsUnits(c: ReturnCase): boolean {
  return (
    c.status !== "cancelled" ||
    c.events.some((e) => ["shipped", "received", "resolved"].includes(e.type))
  );
}
export function assertStateIntegrity(state: AppState): void {
  const purchases = new Map(state.purchases.map((p) => [p.id, p]));
  if (purchases.size !== state.purchases.length)
    throw new ValidationError(409, "Hay artículos duplicados.");
  const reserved = new Map<string, number>();
  const returnIds = new Set<string>();
  for (const c of state.returns) {
    if (returnIds.has(c.id))
      throw new ValidationError(409, "La devolución ya existe.");
    returnIds.add(c.id);
    const unique = new Set<string>();
    for (const item of c.items) {
      if (!purchases.has(item.purchaseId))
        throw new ValidationError(
          409,
          "Una devolución hace referencia a un artículo eliminado.",
        );
      if (unique.has(item.purchaseId))
        throw new ValidationError(
          400,
          "Agrupa las unidades del mismo artículo en una sola línea.",
        );
      unique.add(item.purchaseId);
      integer(item.quantity, "Unidades devueltas", 1, 9999);
      if (countsUnits(c))
        reserved.set(
          item.purchaseId,
          (reserved.get(item.purchaseId) ?? 0) + item.quantity,
        );
    }
  }
  for (const p of state.purchases) {
    integer(p.quantity, "Unidades compradas", 1, 9999);
    integer(p.keptQuantity, "Unidades conservadas", 0, p.quantity);
    if ((reserved.get(p.id) ?? 0) + p.keptQuantity > p.quantity)
      throw new ValidationError(
        409,
        `No quedan suficientes unidades disponibles de «${p.title}».`,
      );
  }
}
export function validateReturn(input: unknown, state: AppState): ReturnCase {
  const raw = record(input);
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > 100)
    throw new ValidationError(400, "Selecciona entre 1 y 100 artículos.");
  const items = raw.items.map((value) => {
    const item = record(value);
    return {
      purchaseId: text(item.purchaseId, "Artículo", 100),
      quantity: integer(item.quantity, "Unidades", 1, 9999),
    };
  });
  const purchases = items.map((item) => {
    const p = state.purchases.find((v) => v.id === item.purchaseId);
    if (!p) throw new ValidationError(404, "El artículo ya no existe.");
    return p;
  });
  const currencies = new Set(purchases.map((p) => p.currency));
  const merchants = new Set(
    purchases.map((p) => (p.merchantId ?? p.store).trim().toLowerCase()),
  );
  const orderNumbers = new Set(
    purchases.map((p) => p.orderNumber).filter(Boolean),
  );
  if (currencies.size > 1 || merchants.size > 1 || orderNumbers.size > 1)
    throw new ValidationError(
      400,
      "Agrupa en cada devolución artículos de la misma tienda, pedido y moneda.",
    );
  const expected = purchases.every((p) => p.priceMinor !== null)
    ? purchases.reduce((sum, p, i) => {
        const reserved = state.returns
          .filter(countsUnits)
          .flatMap((r) => r.items)
          .filter((item) => item.purchaseId === p.id)
          .reduce((n, item) => n + item.quantity, 0);
        return (
          sum +
          proportionalMinor(
            p.priceMinor!,
            reserved + items[i].quantity,
            p.quantity,
          ) -
          proportionalMinor(p.priceMinor!, reserved, p.quantity)
        );
      }, 0)
    : null;
  if (expected !== null) integer(expected, "Total esperado");
  const now = new Date().toISOString();
  const created: ReturnCase = {
    id: randomUUID(),
    items,
    status: "draft",
    outcome: "refund",
    reference: "",
    dispatchBy: null,
    trackingUrl: "",
    notes: "",
    expectedMinor: expected,
    currency: purchases[0].currency,
    refunds: [],
    events: [
      {
        id: randomUUID(),
        type: "draft",
        at: now,
        note: "Devolución creada",
        source: "user",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const result = validateReturnPatch(raw, created);
  assertStateIntegrity({ ...state, returns: [...state.returns, result] });
  return result;
}
export function validateReturnPatch(
  input: unknown,
  previous: ReturnCase,
): ReturnCase {
  const raw = record(input);
  const outcome = raw.outcome ?? previous.outcome;
  if (!["refund", "exchange", "voucher"].includes(String(outcome)))
    throw new ValidationError(400, "Resultado de devolución no válido.");
  if (
    raw.currency !== undefined &&
    currency(raw.currency) !== previous.currency
  )
    throw new ValidationError(400, "La moneda debe coincidir con la compra.");
  if (previous.status === "resolved" && outcome !== previous.outcome)
    throw new ValidationError(
      409,
      "No se puede cambiar el resultado de una devolución completada.",
    );
  const expected =
    raw.expectedMinor === undefined
      ? previous.expectedMinor
      : raw.expectedMinor;
  const result: ReturnCase = {
    ...previous,
    outcome: outcome as ReturnCase["outcome"],
    reference: text(raw.reference, "Referencia", 160, previous.reference),
    dispatchBy:
      raw.dispatchBy === undefined
        ? previous.dispatchBy
        : dateOnly(raw.dispatchBy, "Enviar antes de", true),
    trackingUrl: safeExternalUrl(raw.trackingUrl, previous.trackingUrl),
    notes: text(raw.notes, "Notas", 5000, previous.notes),
    expectedMinor:
      expected === null ? null : integer(expected, "Importe esperado"),
    updatedAt: new Date().toISOString(),
  };
  if (
    result.status === "resolved" &&
    result.outcome === "refund" &&
    (result.expectedMinor === null ||
      result.refunds
        .filter((r) => r.kind === "received")
        .reduce((s, r) => s + r.amountMinor, 0) < result.expectedMinor)
  )
    throw new ValidationError(
      409,
      "Una devolución completada debe tener el importe recibido registrado.",
    );
  return result;
}
const orderedStatuses: ReturnStatus[] = [
  "draft",
  "requested",
  "authorized",
  "shipped",
  "received",
  "resolved",
];
export function applyStatusEvent(
  state: AppState,
  caseId: string,
  input: unknown,
): void {
  const raw = record(input);
  const c = state.returns.find((r) => r.id === caseId);
  if (!c) throw new ValidationError(404, "La devolución ya no existe.");
  const note = text(raw.note, "Nota", 2000);
  if (raw.status === undefined || raw.status === c.status) {
    if (!note)
      throw new ValidationError(
        400,
        "Escribe una nota o elige un nuevo estado.",
      );
    c.updatedAt = new Date().toISOString();
    c.events.push({
      id: randomUUID(),
      type: "note",
      at: c.updatedAt,
      note,
      source: "user",
    });
    return;
  }
  const next = raw.status as ReturnStatus;
  if (![...orderedStatuses, "cancelled"].includes(next))
    throw new ValidationError(400, "Estado de devolución no válido.");
  if (c.status === "resolved" || c.status === "cancelled")
    throw new ValidationError(409, "Esta devolución ya está cerrada.");
  if (next === "cancelled") {
    if (
      orderedStatuses.indexOf(c.status) >= orderedStatuses.indexOf("shipped") ||
      c.events.some((e) => ["shipped", "received", "resolved"].includes(e.type))
    )
      throw new ValidationError(
        409,
        "No puedes cancelar una devolución que ya se ha enviado.",
      );
    if (c.refunds.length)
      throw new ValidationError(
        409,
        "Una devolución con movimientos de dinero debe resolverse antes de cerrarse.",
      );
  } else if (orderedStatuses.indexOf(next) <= orderedStatuses.indexOf(c.status))
    throw new ValidationError(
      409,
      "No puedes retroceder el estado de una devolución.",
    );
  if (next === "resolved" && c.outcome === "refund") {
    const received = c.refunds
      .filter((r) => r.kind === "received")
      .reduce((sum, r) => sum + r.amountMinor, 0);
    if (c.expectedMinor === null || received < c.expectedMinor)
      throw new ValidationError(
        409,
        "Registra el importe esperado y el reembolso recibido antes de completar la devolución.",
      );
  }
  c.status = next;
  c.updatedAt = new Date().toISOString();
  c.events.push({
    id: randomUUID(),
    type: next,
    at: c.updatedAt,
    note,
    source: "user",
  });
  assertStateIntegrity(state);
}
export function applyRefund(
  state: AppState,
  caseId: string,
  input: unknown,
): void {
  const raw = record(input);
  const c = state.returns.find((r) => r.id === caseId);
  if (!c) throw new ValidationError(404, "La devolución ya no existe.");
  if (c.status === "cancelled")
    throw new ValidationError(
      409,
      "No puedes añadir un reembolso a una devolución cancelada.",
    );
  if (c.outcome !== "refund")
    throw new ValidationError(
      409,
      "Esta devolución corresponde a un cambio o vale. Cambia el resultado antes de registrar dinero.",
    );
  const amountMinor = integer(raw.amountMinor, "Importe del reembolso", 1);
  const money = currency(raw.currency, c.currency);
  if (money !== c.currency)
    throw new ValidationError(
      400,
      "La moneda del reembolso debe coincidir con la devolución.",
    );
  if (raw.kind !== "issued" && raw.kind !== "received")
    throw new ValidationError(
      400,
      "Indica si el reembolso fue emitido o recibido.",
    );
  let operationId: string | null = null;
  if (raw.operationId !== undefined) {
    operationId = text(raw.operationId, "Identificador de operación", 36);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        operationId,
      )
    )
      throw new ValidationError(400, "Identificador de operación inválido.");
    const existing = c.refunds.find((r) => r.id === operationId);
    if (existing) {
      if (
        existing.amountMinor !== amountMinor ||
        existing.currency !== money ||
        existing.kind !== raw.kind ||
        (raw.at !== undefined && existing.at !== timestamp(raw.at))
      )
        throw new ValidationError(
          409,
          "Este identificador ya corresponde a otro movimiento. Recarga el formulario.",
        );
      return;
    }
    if (
      state.returns.some(
        (r) => r.id !== c.id && r.refunds.some((f) => f.id === operationId),
      )
    )
      throw new ValidationError(
        409,
        "El identificador de movimiento ya se ha usado en otra devolución.",
      );
  }
  const at = timestamp(raw.at);
  const sum =
    c.refunds
      .filter((r) => r.kind === raw.kind)
      .reduce((s, r) => s + r.amountMinor, 0) + amountMinor;
  integer(sum, "Importe acumulado");
  c.refunds.push({
    id: operationId ?? randomUUID(),
    amountMinor,
    currency: money,
    kind: raw.kind,
    at,
  });
  c.updatedAt = new Date().toISOString();
  c.events.push({
    id: randomUUID(),
    type: `refund_${raw.kind}`,
    at: c.updatedAt,
    note:
      raw.kind === "received"
        ? "Reembolso recibido registrado"
        : "Reembolso emitido registrado; pendiente de recibir",
    source: "user",
  });
}
