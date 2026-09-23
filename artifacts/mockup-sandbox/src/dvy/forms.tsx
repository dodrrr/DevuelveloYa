import { useState, useRef, type FormEvent } from "react";
import {
  ArrowRight,
  ScanLine,
  Upload,
  PenLine,
  Check,
  LoaderCircle,
} from "lucide-react";
import { api, errorText, filePayload } from "./api";
import { Button, ErrorBox, Field, Sheet } from "./components";
import {
  localDate,
  currencyDigits,
  type Purchase,
  type ImportRecord,
} from "../../../../lib/domain/src/index";

type PurchaseValues = Partial<Purchase>;
function minor(value: string, currency: string) {
  return value.trim()
    ? Math.round(
        Number(value.replace(",", ".")) * 10 ** currencyDigits(currency),
      )
    : null;
}
export function PurchaseFields({
  value,
  update,
}: {
  value: PurchaseValues;
  update: (patch: PurchaseValues) => void;
}) {
  const currency = value.currency || "EUR";
  return (
    <>
      <Field label="Artículo">
        <input
          autoFocus
          required
          maxLength={250}
          placeholder="¿Qué has comprado?"
          value={value.title || ""}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>
      <div className="field-grid">
        <Field label="Tienda">
          <input
            required
            placeholder="Nombre de la tienda"
            maxLength={120}
            value={value.store || ""}
            onChange={(e) =>
              update({ store: e.target.value, merchantId: null })
            }
          />
        </Field>
        <Field label="Número de pedido">
          <input
            placeholder="Opcional"
            maxLength={120}
            value={value.orderNumber || ""}
            onChange={(e) => update({ orderNumber: e.target.value })}
          />
        </Field>
      </div>
      <div className="field-grid three">
        <Field label="Importe total" hint="De todas las unidades.">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={1 / 10 ** currencyDigits(currency)}
            placeholder="0,00"
            value={
              value.priceMinor == null
                ? ""
                : value.priceMinor / 10 ** currencyDigits(currency)
            }
            onChange={(e) =>
              update({ priceMinor: minor(e.target.value, currency) })
            }
          />
        </Field>
        <Field label="Moneda">
          <select
            value={currency}
            onChange={(e) => update({ currency: e.target.value })}
          >
            {!["EUR", "USD", "GBP", "MXN", "CHF", "JPY"].includes(currency) && (
              <option value={currency}>{currency}</option>
            )}
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
            <option>MXN</option>
            <option>CHF</option>
            <option>JPY</option>
          </select>
        </Field>
        <Field label="Unidades">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="999"
            required
            value={value.quantity ?? 1}
            onChange={(e) => update({ quantity: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="field-grid">
        <Field label="Fecha de compra">
          <input
            type="date"
            required
            value={value.purchasedAt || ""}
            onChange={(e) => update({ purchasedAt: e.target.value })}
          />
        </Field>
        <Field label="Fecha de entrega" hint="Si ya lo has recibido.">
          <input
            type="date"
            value={value.deliveredAt || ""}
            onChange={(e) => update({ deliveredAt: e.target.value || null })}
          />
        </Field>
      </div>
      <div className="form-divider" />
      <div className="field-grid">
        <Field
          label="Último día para devolver"
          hint="Déjalo vacío si aún no lo sabes."
        >
          <input
            type="date"
            value={value.deadline || ""}
            onChange={(e) =>
              update({
                deadline: e.target.value || null,
                deadlineQuality: e.target.value
                  ? value.deadlineQuality === "missing"
                    ? "manual"
                    : value.deadlineQuality || "manual"
                  : "missing",
              })
            }
          />
        </Field>
        <Field label="Fiabilidad del plazo">
          <select
            value={
              value.deadline ? value.deadlineQuality || "manual" : "missing"
            }
            disabled={!value.deadline}
            onChange={(e) =>
              update({
                deadlineQuality: e.target.value as Purchase["deadlineQuality"],
              })
            }
          >
            {!value.deadline && <option value="missing">Por confirmar</option>}
            <option value="manual">Lo he comprobado yo</option>
            <option value="evidenced">Aparece en un documento</option>
            <option value="estimated">Es una estimación</option>
          </select>
        </Field>
      </div>
      <Field
        label="Origen del plazo"
        hint="Una fecha guardada no sustituye las condiciones de la tienda."
      >
        <input
          placeholder="Ej.: email de confirmación o URL de la política"
          maxLength={2000}
          value={value.deadlineSource || ""}
          onChange={(e) => update({ deadlineSource: e.target.value })}
        />
      </Field>
      <details className="form-details">
        <summary>Vendedor, país y notas</summary>
        <div className="d-form">
          <div className="field-grid">
            <Field label="Vendedor" hint="Útil en marketplaces.">
              <input
                maxLength={120}
                value={value.seller || ""}
                onChange={(e) => update({ seller: e.target.value })}
              />
            </Field>
            <Field label="País de la compra">
              <select
                value={value.country || "ES"}
                onChange={(e) => update({ country: e.target.value })}
              >
                {value.country &&
                  !["ES", "PT", "FR", "DE", "IT", "GB", "US", "MX"].includes(
                    value.country,
                  ) && <option value={value.country}>{value.country}</option>}
                <option value="ES">España</option>
                <option value="PT">Portugal</option>
                <option value="FR">Francia</option>
                <option value="DE">Alemania</option>
                <option value="IT">Italia</option>
                <option value="GB">Reino Unido</option>
                <option value="US">Estados Unidos</option>
                <option value="MX">México</option>
              </select>
            </Field>
          </div>
          <Field
            label="Código de otro país"
            hint="Opcional: código ISO de dos letras, como AR, CO o CL."
          >
            <input
              maxLength={2}
              minLength={2}
              pattern="[A-Za-z]{2}"
              placeholder="ES"
              value={value.country || "ES"}
              onChange={(e) =>
                update({ country: e.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="Notas">
            <textarea
              rows={3}
              maxLength={10000}
              value={value.notes || ""}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Talla, estado del artículo, condiciones especiales…"
            />
          </Field>
        </div>
      </details>
    </>
  );
}
export function PurchaseForm({
  purchase,
  onClose,
  reload,
  timezone,
  country,
}: {
  purchase?: Purchase;
  onClose: () => void;
  reload: () => Promise<void>;
  timezone: string;
  country: string;
}) {
  const operationId = useRef(crypto.randomUUID()).current;
  const [value, setValue] = useState<PurchaseValues>(
    purchase || {
      title: "",
      store: "",
      country,
      currency: "EUR",
      quantity: 1,
      purchasedAt: localDate(new Date(), timezone),
      deadline: null,
      deadlineQuality: "missing",
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(purchase ? `/purchases/${purchase.id}` : "/purchases", {
        method: purchase ? "PATCH" : "POST",
        body: { ...value, ...(!purchase ? { operationId } : {}) },
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
    <Sheet
      title={purchase ? "Editar compra" : "Nueva compra"}
      subtitle="Todo lo importante, en un solo lugar."
      onClose={() => !busy && onClose()}
    >
      <form className="d-form" onSubmit={save}>
        <PurchaseFields
          value={value}
          update={(patch) => setValue((v) => ({ ...v, ...patch }))}
        />
        {purchase && (
          <Field
            label="Unidades que te quedas"
            hint="Pon 0 para volver a considerar su devolución. Las unidades ya asignadas a devoluciones siguen reservadas."
          >
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={value.quantity || 1}
              value={value.keptQuantity || 0}
              onChange={(e) =>
                setValue((v) => ({
                  ...v,
                  keptQuantity: Number(e.target.value),
                }))
              }
            />
          </Field>
        )}
        <ErrorBox message={error} />
        <Button type="submit" busy={busy}>
          {purchase ? "Guardar cambios" : "Guardar compra"}
          <Check size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
export function ImportSheet({
  onClose,
  reload,
  imports,
  extractionReady,
}: {
  onClose: () => void;
  reload: () => Promise<void>;
  imports: ImportRecord[];
  extractionReady: boolean;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PurchaseValues[] | null>(null);
  const active = imports.find((i) => i.id === selected);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ importId: string }>("/imports", {
        method: "POST",
        body: {
          text: text || undefined,
          file: file ? await filePayload(file) : undefined,
        },
      });
      setSelected(result.importId);
      setCandidates(null);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string) {
    setBusy(true);
    setError(null);
    setSelected(id);
    try {
      const result = await api<{
        import: ImportRecord;
        candidates: PurchaseValues[];
      }>(`/imports/${id}`);
      setCandidates(result.candidates || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/imports/${id}/retry`, { method: "POST" });
      setCandidates(null);
      setSelected(id);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!candidates?.length) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/imports/${selected}/confirm`, {
        method: "POST",
        body: { purchases: candidates },
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
    <Sheet
      title={candidates ? "Revisa antes de guardar" : "Añadir desde un ticket"}
      subtitle={
        candidates
          ? "La extracción puede equivocarse. Confirma cada dato."
          : "Pega un email, sube una captura o añade un PDF."
      }
      onClose={() => !busy && onClose()}
    >
      <ErrorBox message={error} />
      {candidates ? (
        <form className="d-form" onSubmit={confirm}>
          {candidates.length ? (
            candidates.map((c, i) => (
              <section className="review-item" key={i}>
                <div className="section-heading">
                  <h3>Artículo {i + 1}</h3>
                  <button
                    type="button"
                    className="small-action danger-text"
                    onClick={() =>
                      setCandidates((cs) => cs!.filter((_, j) => j !== i))
                    }
                  >
                    Descartar
                  </button>
                </div>
                <PurchaseFields
                  value={c}
                  update={(patch) =>
                    setCandidates((cs) =>
                      cs!.map((v, j) => (j === i ? { ...v, ...patch } : v)),
                    )
                  }
                />
              </section>
            ))
          ) : (
            <p className="body-copy">
              No hay artículos extraídos. Puedes cerrar esta ventana y añadir la
              compra manualmente, o solicitar la lectura con IA si está
              disponible.
            </p>
          )}
          {!candidates.length && selected && extractionReady && (
            <div className="import-tip">
              <p>
                Leer con IA enviará este documento a OpenAI para extraer sus
                datos. Revisa la información antes de guardarla.
              </p>
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                onClick={() => void retry(selected)}
              >
                Leer con IA
              </Button>
            </div>
          )}
          <Button type="submit" busy={busy} disabled={!candidates.length}>
            Guardar {candidates.length}{" "}
            {candidates.length === 1 ? "compra" : "compras"}
            <Check size={17} />
          </Button>
        </form>
      ) : (
        <>
          <form className="d-form" onSubmit={submit}>
            <div className="import-tip">
              <ScanLine size={21} />
              <p>
                {extractionReady
                  ? "Extraemos los datos y tú decides qué guardar. Ningún plazo se dará por confirmado sin revisión."
                  : "Puedes extraer datos de texto. El reconocimiento avanzado de imágenes necesita activarse en el servidor."}
              </p>
            </div>
            <Field label="Texto del email o ticket">
              <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pega aquí el pedido, el ticket o las condiciones de devolución…"
                maxLength={60000}
              />
            </Field>
            <label className="dropzone">
              <Upload size={23} />
              <strong>{file ? file.name : "Seleccionar un archivo"}</strong>
              <span>PDF, JPG, PNG, WebP o texto · Máx. 8 MB</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.eml"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {file && (
              <button
                className="small-action"
                type="button"
                onClick={() => setFile(null)}
              >
                Quitar archivo
              </button>
            )}
            <Button busy={busy} disabled={!text.trim() && !file} type="submit">
              Extraer datos
              <ArrowRight size={17} />
            </Button>
          </form>
          {active &&
            (active.status === "queued" || active.status === "processing") && (
              <div className="d-message neutral" role="status">
                <LoaderCircle size={18} className="spin" />
                <span>
                  Preparando la revisión. Puedes seguir usando la app.
                </span>
              </div>
            )}
          <div className="import-history">
            {imports.length > 0 && <h3>Importaciones recientes</h3>}
            {[...imports]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 12)
              .map((i) => (
                <div className="import-row" key={i.id}>
                  <div className="mini-icon">
                    <PenLine size={17} />
                  </div>
                  <div>
                    <strong>{i.title || "Importación"}</strong>
                    <p>
                      {i.message ||
                        {
                          queued: "En cola",
                          processing: "Procesando…",
                          needs_review: "Lista para revisar",
                          completed: "Guardada",
                          failed: "No se pudo extraer",
                        }[i.status]}
                    </p>
                  </div>
                  {i.status === "needs_review" && (
                    <button
                      className="small-action"
                      disabled={busy}
                      onClick={() => void review(i.id)}
                    >
                      Revisar
                      <ArrowRight size={15} />
                    </button>
                  )}
                  {i.status === "failed" && extractionReady && (
                    <button
                      type="button"
                      className="small-action"
                      disabled={busy}
                      onClick={() => void review(i.id)}
                    >
                      Revisar
                    </button>
                  )}
                  {i.status === "completed" && (
                    <Check size={19} className="success-text" />
                  )}
                </div>
              ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
