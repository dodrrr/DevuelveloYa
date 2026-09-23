import { useState, useRef, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  CalendarDays,
  Package,
  RotateCcw,
  Check,
  Pencil,
  Archive,
  Trash2,
  Circle,
  CheckCircle2,
  Link,
  Search,
  Wallet,
  Undo2,
} from "lucide-react";
import { api, errorText } from "./api";
import {
  Button,
  Confirm,
  Documents,
  ErrorBox,
  Field,
  Sheet,
  SuccessBox,
} from "./components";
import { PurchaseForm } from "./forms";
import {
  availableQuantity,
  formatMoney,
  deadlineLabel,
  daysRemaining,
  currencyDigits,
  localDate,
  RETURN_LABELS,
  type Account,
  type AppState,
  type LinkResult,
  type Purchase,
  type ReturnCase,
  type ReturnStatus,
} from "../../../../lib/domain/src/index";

export function dateLabel(date: string | null) {
  if (!date) return "Sin confirmar";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}
export function safeUrl(url: string) {
  try {
    const value = new URL(url);
    return value.protocol === "https:" ? value.href : null;
  } catch {
    return null;
  }
}
export function PurchaseDetail({
  purchase: p,
  state,
  account,
  onClose,
  reload,
  openReturn,
}: {
  purchase: Purchase;
  state: AppState;
  account: Account;
  onClose: () => void;
  reload: () => Promise<void>;
  openReturn: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkResult | null>(null);
  const [confirm, setConfirm] = useState<"keep" | "archive" | "delete" | null>(
    null,
  );
  const available = availableQuantity(state, p);
  const days = daysRemaining(p.deadline, account.settings.timezone);
  const cases = state.returns.filter((r) =>
    r.items.some((i) => i.purchaseId === p.id),
  );
  async function findLink() {
    setBusy(true);
    setError(null);
    try {
      setLink(
        await api<LinkResult>(`/purchases/${p.id}/resolve-link`, {
          method: "POST",
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Tu compra"
      subtitle={p.orderNumber ? `Pedido ${p.orderNumber}` : p.store}
      onClose={onClose}
    >
      <div className="purchase-detail-hero">
        <div className="store-mark large">
          {p.store.slice(0, 1).toUpperCase()}
        </div>
        <p className="eyebrow">{p.store}</p>
        <h2>{p.title}</h2>
        <p>
          {formatMoney(p.priceMinor, p.currency)}
          <span>
            {" "}
            total · {p.quantity} {p.quantity === 1 ? "unidad" : "unidades"}
          </span>
        </p>
      </div>
      <div
        className={`deadline-panel ${days !== null && days <= 3 ? "urgent" : ""}`}
      >
        <CalendarDays size={21} />
        <div>
          <strong>{deadlineLabel(p, account.settings.timezone)}</strong>
          <span>
            {p.deadline
              ? `Fecha registrada: ${dateLabel(p.deadline)}`
              : "Comprueba el pedido o la política de la tienda."}
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Editar plazo"
          onClick={() => setEditing(true)}
        >
          <Pencil size={17} />
        </button>
      </div>
      <ErrorBox message={error} />
      <section className="detail-section">
        <div className="section-heading">
          <h3>El siguiente paso</h3>
          <span className="subtle-badge">{available} disponibles</span>
        </div>
        {available > 0 ? (
          <>
            <p className="muted">
              Encuentra el acceso oficial de la tienda y prepara tu devolución.
              Confirmarás cada paso tú.
            </p>
            <Button
              busy={busy}
              variant="secondary"
              onClick={() => void findLink()}
            >
              <Search size={17} />
              {link
                ? "Comprobar enlace de nuevo"
                : "Buscar enlace de devolución"}
            </Button>
            {link && (
              <div className="link-result">
                <div className="link-heading">
                  {link.verified ? (
                    <ShieldCheck size={18} />
                  ) : (
                    <Link size={18} />
                  )}
                  <strong>{link.label}</strong>
                </div>
                <p>{link.explanation}</p>
                {link.url && safeUrl(link.url) && (
                  <a
                    className="d-button primary"
                    href={safeUrl(link.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {!link.verified
                      ? "Revisar enlace encontrado"
                      : link.kind === "policy"
                        ? "Consultar política oficial"
                        : link.kind === "orders"
                          ? "Ir a mis pedidos"
                          : "Abrir enlace oficial"}
                    <ArrowUpRight size={17} />
                  </a>
                )}
                <small>
                  {link.host || "Sin dominio confirmado"}
                  {link.checkedAt
                    ? ` · Comprobado ${dateLabel(link.checkedAt)}`
                    : ""}
                  {link.verified
                    ? " · Destino verificado"
                    : " · Revisa el destino"}
                </small>
                <p className="small">
                  Abrir el enlace no solicita ni confirma una devolución.
                </p>
              </div>
            )}
            <Button onClick={() => setCreating(true)}>
              <RotateCcw size={17} />
              Preparar devolución
              <ArrowRight size={17} />
            </Button>
          </>
        ) : (
          <p className="muted">
            Ya has asignado todas las unidades. Puedes consultar tus
            devoluciones o editar esta compra.
          </p>
        )}
      </section>
      {cases.length > 0 && (
        <section className="detail-section">
          <h3>Devoluciones de esta compra</h3>
          {cases.map((r) => (
            <button
              key={r.id}
              className="setting-row"
              onClick={() => openReturn(r.id)}
            >
              <RotateCcw size={18} />
              <div>
                <strong>{RETURN_LABELS[r.status]}</strong>
                <span>
                  {r.items.find((i) => i.purchaseId === p.id)?.quantity}{" "}
                  unidad(es) · {dateLabel(r.createdAt)}
                </span>
              </div>
              <ArrowRight size={16} />
            </button>
          ))}
        </section>
      )}
      <section className="detail-section">
        <div className="section-heading">
          <h3>Información de la compra</h3>
          <button className="small-action" onClick={() => setEditing(true)}>
            Editar
            <Pencil size={14} />
          </button>
        </div>
        <dl className="detail-data">
          <div>
            <dt>Comprado</dt>
            <dd>{dateLabel(p.purchasedAt)}</dd>
          </div>
          <div>
            <dt>Entregado</dt>
            <dd>{dateLabel(p.deliveredAt)}</dd>
          </div>
          <div>
            <dt>Vendedor</dt>
            <dd>{p.seller || p.store}</dd>
          </div>
          <div>
            <dt>País</dt>
            <dd>{p.country}</dd>
          </div>
          <div>
            <dt>Me quedo</dt>
            <dd>
              {p.keptQuantity} de {p.quantity}
            </dd>
          </div>
          <div>
            <dt>Origen del plazo</dt>
            <dd>{p.deadlineSource || "Sin documento de origen"}</dd>
          </div>
        </dl>
        {p.notes && <p className="note-block">{p.notes}</p>}
      </section>
      <Documents
        documents={state.documents.filter((d) => d.purchaseId === p.id)}
        purchaseId={p.id}
        reload={reload}
      />
      <div className="detail-actions">
        {p.keptQuantity > 0 && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Undo2 size={16} />
            Reconsiderar lo que me quedo
          </Button>
        )}
        {available > 0 && (
          <Button variant="secondary" onClick={() => setConfirm("keep")}>
            <Check size={16} />
            Me lo quedo
          </Button>
        )}
        <Button variant="ghost" onClick={() => setConfirm("archive")}>
          <Archive size={16} />
          {p.archived ? "Recuperar compra" : "Archivar compra"}
        </Button>
        <Button
          variant="ghost"
          className="danger-text"
          onClick={() => setConfirm("delete")}
        >
          <Trash2 size={16} />
          Eliminar compra
        </Button>
      </div>
      {editing && (
        <PurchaseForm
          purchase={p}
          timezone={account.settings.timezone}
          country={account.settings.country}
          reload={reload}
          onClose={() => setEditing(false)}
        />
      )}
      {creating && (
        <CreateReturn
          purchase={p}
          state={state}
          onClose={() => setCreating(false)}
          reload={reload}
          onCreated={(id) => {
            setCreating(false);
            openReturn(id);
          }}
        />
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "keep"
              ? "¿Te quedas con lo pendiente?"
              : confirm === "archive"
                ? p.archived
                  ? "Recuperar esta compra"
                  : "Archivar esta compra"
                : "¿Eliminar esta compra?"
          }
          label={
            confirm === "keep"
              ? "Sí, me lo quedo"
              : confirm === "archive"
                ? p.archived
                  ? "Recuperar"
                  : "Archivar"
                : "Eliminar compra"
          }
          danger={confirm === "delete"}
          onClose={() => setConfirm(null)}
          run={async () => {
            await api(`/purchases/${p.id}`, {
              method: confirm === "delete" ? "DELETE" : "PATCH",
              body:
                confirm === "delete"
                  ? undefined
                  : confirm === "keep"
                    ? { keptQuantity: p.keptQuantity + available }
                    : { archived: !p.archived },
            });
            await reload();
            if (confirm === "delete") onClose();
          }}
        >
          {confirm === "keep"
            ? `Marcaremos ${available} unidad(es) como conservadas. Puedes corregirlo desde la información de la compra.`
            : confirm === "archive"
              ? "La compra seguirá disponible en el historial."
              : "Esta acción elimina la compra. Si tiene devoluciones asociadas, tendrás que conservarla o archivarla."}
        </Confirm>
      )}
    </Sheet>
  );
}
function CreateReturn({
  purchase: p,
  state,
  onClose,
  reload,
  onCreated,
}: {
  purchase: Purchase;
  state: AppState;
  onClose: () => void;
  reload: () => Promise<void>;
  onCreated: (id: string) => void;
}) {
  const operationId = useRef(crypto.randomUUID()).current;
  const [quantity, setQuantity] = useState(1);
  const [outcome, setOutcome] = useState("refund");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = availableQuantity(state, p);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{
        return?: ReturnCase;
        returnCase?: ReturnCase;
        id?: string;
      }>("/returns", {
        method: "POST",
        body: {
          operationId,
          items: [{ purchaseId: p.id, quantity }],
          outcome,
          currency: p.currency,
        },
      });
      await reload();
      const id = result.return?.id || result.returnCase?.id || result.id;
      if (id) onCreated(id);
      else onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Preparar devolución"
      subtitle={p.title}
      onClose={() => !busy && onClose()}
    >
      <form className="d-form" onSubmit={submit}>
        <Field
          label="¿Cuántas unidades devuelves?"
          hint={`${max} unidad(es) disponibles.`}
        >
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            required
            min="1"
            max={max}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <Field label="¿Qué quieres recibir?">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="refund">Reembolso</option>
            <option value="exchange">Cambio</option>
            <option value="voucher">Vale de compra</option>
          </select>
        </Field>
        <div className="import-tip">
          <Package size={21} />
          <p>
            Crearemos un seguimiento. La solicitud a la tienda la debes
            completar en su canal oficial.
          </p>
        </div>
        <ErrorBox message={error} />
        <Button busy={busy} type="submit">
          Crear seguimiento
          <ArrowRight size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
const nextStatus: Partial<Record<ReturnStatus, ReturnStatus>> = {
  draft: "requested",
  requested: "authorized",
  authorized: "shipped",
  shipped: "received",
  received: "resolved",
};
const nextLabel: Partial<Record<ReturnStatus, string>> = {
  draft: "Ya la he solicitado",
  requested: "La tienda la ha autorizado",
  authorized: "Ya he entregado el paquete",
  shipped: "La tienda la ha recibido",
  received: "Completar devolución",
};
const nextHelp: Record<ReturnStatus, string> = {
  draft:
    "Solicita la devolución en el canal oficial de la tienda y guarda aquí su referencia.",
  requested:
    "Espera las instrucciones de la tienda. Confirma si necesitas etiqueta, QR o una recogida.",
  authorized:
    "Prepara el paquete y entrégalo antes de la fecha indicada. Guarda el justificante.",
  shipped:
    "Consulta el transportista y conserva el justificante hasta que la tienda confirme la recepción.",
  received:
    "Comprueba el cambio, vale o reembolso antes de dar esta devolución por completada.",
  resolved: "Seguimiento completado. Conserva aquí todos los documentos.",
  cancelled:
    "Esta devolución se ha cancelado. Las unidades vuelven a estar disponibles.",
};
export function ReturnDetail({
  value: r,
  state,
  account,
  onClose,
  reload,
}: {
  value: ReturnCase;
  state: AppState;
  account: Account;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const [event, setEvent] = useState<ReturnStatus | null>(null);
  const [refund, setRefund] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const received = r.refunds
    .filter((f) => f.kind === "received")
    .reduce((s, f) => s + f.amountMinor, 0);
  const issued = r.refunds
    .filter((f) => f.kind === "issued")
    .reduce((s, f) => s + f.amountMinor, 0);
  const title = r.items
    .map(
      (i) =>
        state.purchases.find((p) => p.id === i.purchaseId)?.title ||
        "Compra eliminada",
    )
    .join(", ");
  async function addNote(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/returns/${r.id}/events`, { method: "POST", body: { note } });
      await reload();
      setNote("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Tu devolución"
      subtitle={
        r.reference ? `Referencia ${r.reference}` : dateLabel(r.createdAt)
      }
      onClose={onClose}
    >
      <div className="return-detail-top">
        <div className="mini-icon">
          <RotateCcw size={24} />
        </div>
        <h2>{title}</h2>
        <span
          className={`status-badge ${r.status === "resolved" ? "complete" : ""}`}
        >
          {RETURN_LABELS[r.status]}
        </span>
        <p className="muted small">
          {r.items.reduce((s, i) => s + i.quantity, 0)} unidad(es) ·{" "}
          {
            {
              refund: "Reembolso",
              exchange: "Cambio",
              voucher: "Vale de compra",
            }[r.outcome]
          }
        </p>
      </div>
      <section className="next-action">
        <p className="eyebrow">SIGUIENTE PASO</p>
        <h3>
          {r.status === "resolved"
            ? "Todo en orden."
            : r.status === "cancelled"
              ? "Seguimiento cancelado."
              : RETURN_LABELS[r.status]}
        </h3>
        <p>{nextHelp[r.status]}</p>
        {r.dispatchBy && (
          <div className="dispatch-info">
            <CalendarDays size={17} />
            Enviar antes del {dateLabel(r.dispatchBy)}
          </div>
        )}
        {nextStatus[r.status] && (
          <Button onClick={() => setEvent(nextStatus[r.status]!)}>
            {nextLabel[r.status]}
            <ArrowRight size={16} />
          </Button>
        )}
        {r.trackingUrl && safeUrl(r.trackingUrl) && (
          <a
            className="d-button secondary"
            href={safeUrl(r.trackingUrl)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            Seguir el envío
            <ArrowUpRight size={16} />
          </a>
        )}
      </section>
      {r.outcome === "refund" && (
        <section className="detail-section">
          <div className="section-heading">
            <h3>Tu reembolso</h3>
            <button className="small-action" onClick={() => setRefund(true)}>
              Registrar
              <Wallet size={15} />
            </button>
          </div>
          <div className="refund-summary">
            <div>
              <span>Esperado</span>
              <strong>{formatMoney(r.expectedMinor, r.currency)}</strong>
            </div>
            <div>
              <span>Recibido</span>
              <strong className="success-text">
                {formatMoney(received, r.currency)}
              </strong>
            </div>
          </div>
          <p className="muted small">
            Emitido por la tienda: {formatMoney(issued, r.currency)}. Emitido y
            recibido son comprobaciones distintas; no se suman.
          </p>
          {r.refunds.map((f) => (
            <div className="refund-row" key={f.id}>
              <CheckCircle2 size={16} />
              <div>
                <strong>
                  {f.kind === "received"
                    ? "Recibido en tu cuenta"
                    : "Emitido por la tienda"}
                </strong>
                <span>{dateLabel(f.at)}</span>
              </div>
              <b>{formatMoney(f.amountMinor, f.currency)}</b>
            </div>
          ))}
        </section>
      )}
      <section className="detail-section">
        <div className="section-heading">
          <h3>Actividad</h3>
          <button className="small-action" onClick={() => setEditing(true)}>
            Editar datos
            <Pencil size={14} />
          </button>
        </div>
        <ol className="timeline">
          {[...r.events].reverse().map((e, i) => (
            <li key={e.id}>
              <span className={`timeline-dot ${i === 0 ? "current" : ""}`}>
                <Circle size={8} fill="currentColor" />
              </span>
              <div>
                <strong>
                  {RETURN_LABELS[e.type as ReturnStatus] ||
                    {
                      created: "Seguimiento creado",
                      refund: "Reembolso registrado",
                      note: "Nota añadida",
                    }[e.type] ||
                    "Actualización"}
                </strong>
                <p>{e.note || "Actualización del seguimiento."}</p>
                <time>
                  {dateLabel(e.at)} ·{" "}
                  {e.source === "user"
                    ? "Confirmado por ti"
                    : e.source === "email"
                      ? "Email recibido"
                      : "Sistema"}
                </time>
              </div>
            </li>
          ))}
        </ol>
        <form className="note-form" onSubmit={addNote}>
          <Field label="Añadir una nota">
            <textarea
              placeholder="Novedades, conversación con soporte…"
              value={note}
              maxLength={10000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <ErrorBox message={error} />
          <Button
            busy={busy}
            type="submit"
            variant="secondary"
            disabled={!note.trim()}
          >
            Guardar nota
          </Button>
        </form>
      </section>
      <Documents
        documents={state.documents.filter((d) => d.returnId === r.id)}
        returnId={r.id}
        reload={reload}
      />
      {r.notes && <p className="note-block">{r.notes}</p>}
      {!["resolved", "cancelled"].includes(r.status) && (
        <Button
          variant="ghost"
          className="danger-text"
          onClick={() => setEvent("cancelled")}
        >
          <Undo2 size={16} />
          Cancelar seguimiento
        </Button>
      )}
      {event && (
        <Confirm
          title={
            event === "cancelled"
              ? "¿Cancelar seguimiento?"
              : `Confirmar: ${RETURN_LABELS[event].toLowerCase()}`
          }
          label={
            event === "cancelled"
              ? "Cancelar seguimiento"
              : "Confirmar actualización"
          }
          danger={event === "cancelled"}
          onClose={() => setEvent(null)}
          run={async () => {
            await api(`/returns/${r.id}/events`, {
              method: "POST",
              body: {
                status: event,
                note:
                  event === "cancelled"
                    ? "Seguimiento cancelado por el usuario."
                    : `El usuario confirma: ${RETURN_LABELS[event]}.`,
              },
            });
            await reload();
          }}
        >
          {event === "resolved"
            ? "Confirma que la devolución está resuelta y que has recibido el reembolso, cambio o vale acordado."
            : event === "cancelled"
              ? "Esto cancela el seguimiento en la app. No cancela la solicitud de la tienda."
              : "Actualiza el seguimiento solo si ya has realizado o comprobado este paso. Este botón no envía solicitudes a la tienda."}
        </Confirm>
      )}
      {refund && (
        <RefundForm
          value={r}
          timezone={account.settings.timezone}
          reload={reload}
          onClose={() => setRefund(false)}
        />
      )}
      {editing && (
        <ReturnEdit
          value={r}
          reload={reload}
          onClose={() => setEditing(false)}
        />
      )}
    </Sheet>
  );
}
function RefundForm({
  value: r,
  timezone,
  reload,
  onClose,
}: {
  value: ReturnCase;
  timezone: string;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const operationId = useRef(crypto.randomUUID()).current;
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("received");
  const [at, setAt] = useState(localDate(new Date(), timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/returns/${r.id}/refunds`, {
        method: "POST",
        body: {
          operationId,
          amountMinor: Math.round(
            Number(amount) * 10 ** currencyDigits(r.currency),
          ),
          currency: r.currency,
          kind,
          at,
        },
      });
      await reload();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Registrar reembolso" onClose={() => !busy && onClose()}>
      <form className="d-form" onSubmit={submit}>
        <Field label={`Importe (${r.currency})`}>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={1 / 10 ** currencyDigits(r.currency)}
            step={1 / 10 ** currencyDigits(r.currency)}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="¿Qué has comprobado?">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="received">Ya lo he recibido en mi cuenta</option>
            <option value="issued">La tienda dice que lo ha emitido</option>
          </select>
        </Field>
        <Field label="Fecha">
          <input
            required
            type="date"
            max={localDate(new Date(), timezone)}
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </Field>
        <p className="muted small">
          Puedes registrar abonos parciales. Añade cada movimiento una sola vez.
        </p>
        <ErrorBox message={error} />
        <Button type="submit" busy={busy}>
          Guardar reembolso
          <Check size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
function ReturnEdit({
  value: r,
  reload,
  onClose,
}: {
  value: ReturnCase;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    reference: r.reference,
    dispatchBy: r.dispatchBy,
    trackingUrl: r.trackingUrl,
    notes: r.notes,
    expectedMinor: r.expectedMinor,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/returns/${r.id}`, { method: "PATCH", body: value });
      await reload();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Datos de la devolución" onClose={() => !busy && onClose()}>
      <form className="d-form" onSubmit={submit}>
        <Field label="Referencia de la tienda">
          <input
            value={value.reference}
            onChange={(e) =>
              setValue((v) => ({ ...v, reference: e.target.value }))
            }
          />
        </Field>
        <Field label="Último día para enviar">
          <input
            type="date"
            value={value.dispatchBy || ""}
            onChange={(e) =>
              setValue((v) => ({ ...v, dispatchBy: e.target.value || null }))
            }
          />
        </Field>
        <Field label="Enlace de seguimiento">
          <input
            type="url"
            placeholder="https://…"
            value={value.trackingUrl}
            onChange={(e) =>
              setValue((v) => ({ ...v, trackingUrl: e.target.value }))
            }
          />
        </Field>
        <Field label={`Reembolso esperado (${r.currency})`}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={1 / 10 ** currencyDigits(r.currency)}
            value={
              value.expectedMinor === null
                ? ""
                : value.expectedMinor / 10 ** currencyDigits(r.currency)
            }
            onChange={(e) =>
              setValue((v) => ({
                ...v,
                expectedMinor: e.target.value
                  ? Math.round(
                      Number(e.target.value) * 10 ** currencyDigits(r.currency),
                    )
                  : null,
              }))
            }
          />
        </Field>
        <Field label="Notas">
          <textarea
            rows={3}
            value={value.notes}
            onChange={(e) => setValue((v) => ({ ...v, notes: e.target.value }))}
          />
        </Field>
        <ErrorBox message={error} />
        <Button type="submit" busy={busy}>
          Guardar cambios
          <Check size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
