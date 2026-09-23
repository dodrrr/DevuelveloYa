import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  ArrowRight,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  Package,
  Upload,
  FileText,
  Trash2,
  Download,
} from "lucide-react";
import { api, filePayload, errorText } from "./api";
import type { DocumentMeta } from "../../../../lib/domain/src/index";

export function Button({
  children,
  busy,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`d-button ${variant} ${props.className || ""}`}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <div className="d-message error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div className="d-message success" role="status">
      <CheckCircle2 size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="d-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`d-sheet ${wide ? "wide" : ""}`}
      aria-labelledby={labelId}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <h2 id={labelId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        <div className="sheet-content">{children}</div>
      </div>
    </dialog>
  );
}
export function EmptyState({
  title,
  children,
  action,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`d-empty ${compact ? "compact" : ""}`}>
      <div className="empty-art">
        <Package size={38} strokeWidth={1.25} />
        <span className="empty-check">
          <CheckCircle2 size={18} />
        </span>
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Confirm({
  title,
  children,
  label = "Confirmar",
  danger,
  run,
  onClose,
}: {
  title: string;
  children: ReactNode;
  label?: string;
  danger?: boolean;
  run: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await run();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={title} onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="d-form">
        <div className="body-copy">{children}</div>
        <ErrorBox message={error} />
        <Button
          busy={busy}
          variant={danger ? "danger" : "primary"}
          type="submit"
        >
          {label}
          <ArrowRight size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
export function Documents({
  documents,
  purchaseId,
  returnId,
  reload,
}: {
  documents: DocumentMeta[];
  purchaseId?: string;
  returnId?: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<DocumentMeta | null>(null);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api("/documents", {
        method: "POST",
        body: { ...(await filePayload(file)), purchaseId, returnId },
      });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>Documentos</h3>
        <label className={`small-action upload-link ${busy ? "disabled" : ""}`}>
          <Upload size={16} />
          {busy ? "Subiendo…" : "Adjuntar"}
          <input
            type="file"
            disabled={busy}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.eml"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ErrorBox message={error} />
      {!documents.length ? (
        <p className="muted small">
          Guarda aquí tickets, etiquetas y justificantes. Hasta 8 MB por
          archivo.
        </p>
      ) : (
        <div className="document-list">
          {documents.map((d) => (
            <div key={d.id} className="document-row">
              <FileText size={19} />
              <div>
                <strong>{d.name}</strong>
                <span>{Math.max(1, Math.round(d.size / 1024))} KB</span>
              </div>
              <a
                href={`/api/documents/${d.id}/download`}
                className="icon-button"
                aria-label={`Descargar ${d.name}`}
              >
                <Download size={17} />
              </a>
              <button
                className="icon-button"
                aria-label={`Eliminar ${d.name}`}
                onClick={() => setRemove(d)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {remove && (
        <Confirm
          title="¿Eliminar documento?"
          label="Eliminar documento"
          danger
          onClose={() => setRemove(null)}
          run={async () => {
            await api(`/documents/${remove.id}`, { method: "DELETE" });
            await reload();
          }}
        >
          {remove.name} se eliminará de tu cuenta.
        </Confirm>
      )}
    </section>
  );
}
