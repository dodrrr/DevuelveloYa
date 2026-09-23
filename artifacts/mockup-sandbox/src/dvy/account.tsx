import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  Bell,
  ShieldCheck,
  Mail,
  LogOut,
  Moon,
  Globe2,
  Trash2,
  CheckCircle2,
  CircleHelp,
  Copy,
  Zap,
  KeyRound,
} from "lucide-react";
import { api, errorText, setCsrf } from "./api";
import {
  Button,
  Confirm,
  Documents,
  ErrorBox,
  Field,
  Sheet,
  SuccessBox,
} from "./components";
import type {
  Account,
  Capabilities,
  Settings,
  DocumentMeta,
} from "../../../../lib/domain/src/index";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-icon">
        <ArrowRight size={19} strokeWidth={2.8} />
      </span>
      <span>
        devuélvelo<span className="brand-ya">ya.</span>
      </span>
    </div>
  );
}
export function Auth({ onLogin }: { onLogin: () => Promise<void> }) {
  const token = new URLSearchParams(window.location.search).get("reset");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    token ? "reset" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "forgot") {
        const result = await api<{ message: string }>("/auth/password/forgot", {
          method: "POST",
          body: { email: values.email },
        });
        setSuccess(
          result.message ||
            "Si la cuenta existe y el correo está configurado, recibirás un enlace para recuperar el acceso.",
        );
      } else if (mode === "reset") {
        const resetResult = await api<{ csrfToken?: string }>(
          "/auth/password/reset",
          { method: "POST", body: { token, password: values.password } },
        );
        if (resetResult.csrfToken) setCsrf(resetResult.csrfToken);
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        setSuccess("Contraseña actualizada. Ya puedes iniciar sesión.");
      } else {
        const result = await api<{ csrfToken?: string }>(`/auth/${mode}`, {
          method: "POST",
          body: values,
        });
        if (result.csrfToken) setCsrf(result.csrfToken);
        await onLogin();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="d-app auth-app">
      <div className="auth-wrap">
        <header className="auth-header">
          <Brand />
          <span className="auth-header-note">
            <ShieldCheck size={15} />
            Tu espacio personal
          </span>
        </header>
        <main className="auth-main">
          <section className="auth-intro">
            <div className="intro-kicker">
              <span />
              TUS COMPRAS, BAJO CONTROL
            </div>
            <h1>
              Compra con calma.
              <br />
              <span>Decide a tiempo.</span>
            </h1>
            <p>
              Tickets, plazos y devoluciones.
              <br />
              Todo en su sitio. Nada se te pasa.
            </p>
            <div className="auth-illustration" aria-hidden="true">
              <div className="illustration-orbit orbit-one" />
              <div className="illustration-orbit orbit-two" />
              <div className="floating-receipt">
                <div className="receipt-line">
                  <span className="mini-icon">
                    <CheckCircle2 size={22} />
                  </span>
                  <span className="receipt-stamp">EN ORDEN</span>
                </div>
                <div className="receipt-title">
                  Un poco más
                  <br />
                  de tranquilidad.
                </div>
                <div className="receipt-rule" />
                <div className="receipt-bottom">
                  <span>Menos pendientes.</span>
                  <ArrowUpRight size={23} />
                </div>
              </div>
              <div className="floating-mini">
                <Bell size={18} />
                <span>
                  El momento de decidir.<small>Avisos a tu medida</small>
                </span>
                <Check size={16} />
              </div>
            </div>
            <div className="intro-features">
              <span>
                <CheckCircle2 size={15} />
                Plazos claros
              </span>
              <span>
                <CheckCircle2 size={15} />
                Enlaces oficiales
              </span>
              <span>
                <CheckCircle2 size={15} />
                Todo a mano
              </span>
            </div>
          </section>
          <section className="auth-card">
            <p className="eyebrow">BIENVENIDO A TU TRANQUILIDAD</p>
            <h2>
              {mode === "register"
                ? "Empieza a tenerlo claro."
                : mode === "forgot"
                  ? "Recupera tu acceso."
                  : mode === "reset"
                    ? "Una nueva contraseña."
                    : "Qué bien tenerte aquí."}
            </h2>
            <p className="muted">
              {mode === "register"
                ? "Crea tu cuenta y añade tu primera compra."
                : mode === "forgot"
                  ? "Te enviaremos un enlace si el correo está configurado."
                  : mode === "reset"
                    ? "Elige una contraseña de al menos 12 caracteres."
                    : "Entra y retoma tus compras donde las dejaste."}
            </p>
            {(mode === "login" || mode === "register") && (
              <div className="auth-segment">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  className={mode === "register" ? "active" : ""}
                  onClick={() => {
                    setMode("register");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Crear cuenta
                </button>
              </div>
            )}
            <form className="d-form" onSubmit={submit}>
              {mode === "register" && (
                <Field label="Tu nombre">
                  <input
                    name="name"
                    autoComplete="given-name"
                    required
                    maxLength={80}
                    placeholder="Cómo te llamas"
                  />
                </Field>
              )}
              {mode !== "reset" && (
                <Field label="Correo electrónico">
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    placeholder="tu@email.com"
                    maxLength={254}
                  />
                </Field>
              )}
              {mode !== "forgot" && (
                <Field
                  label="Contraseña"
                  hint={
                    mode === "register" || mode === "reset"
                      ? "Mínimo 12 caracteres. Usa una contraseña única."
                      : undefined
                  }
                >
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    required
                    placeholder={
                      mode === "login"
                        ? "Tu contraseña"
                        : "Al menos 12 caracteres"
                    }
                  />
                </Field>
              )}
              <ErrorBox message={error} />
              {success && <SuccessBox>{success}</SuccessBox>}
              <Button type="submit" busy={busy}>
                {mode === "register"
                  ? "Crear mi cuenta"
                  : mode === "forgot"
                    ? "Enviar enlace"
                    : mode === "reset"
                      ? "Guardar contraseña"
                      : "Entrar a mi espacio"}
                <ArrowRight size={18} />
              </Button>
            </form>
            <div className="auth-footer">
              {mode === "login" ? (
                <button
                  className="small-action"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  He olvidado mi contraseña
                </button>
              ) : mode === "forgot" || mode === "reset" ? (
                <button
                  className="small-action"
                  onClick={() => {
                    const location = new URL(window.location.href);
                    location.searchParams.delete("reset");
                    window.history.replaceState(
                      {},
                      "",
                      `${location.pathname}${location.search}`,
                    );
                    setMode("login");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Volver a iniciar sesión
                </button>
              ) : (
                <p>
                  Tu cuenta guarda tus compras y documentos de forma privada.
                </p>
              )}
            </div>
          </section>
        </main>
        <footer className="auth-bottom">
          <span>Menos pendientes. Más tranquilidad.</span>
          <span>Diseñado para tu día a día.</span>
        </footer>
      </div>
    </div>
  );
}
export function AccountPage({
  account,
  capabilities,
  reload,
  logout,
  documents,
}: {
  account: Account;
  capabilities: Capabilities | null;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  documents: DocumentMeta[];
}) {
  const [modal, setModal] = useState<
    "preferences" | "reminders" | "privacy" | "delete" | "logout" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState(false);
  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ message: string }>(
        "/auth/verification/request",
        { method: "POST" },
      );
      setMessage(
        result.message || "Revisa tu correo para confirmar la dirección.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `devuelveloya-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage(
        "Datos exportados. Los documentos se descargan desde cada compra o devolución.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">A TU MANERA</p>
        <h1>Tu espacio.</h1>
        <p>Un poco de orden. Mucha tranquilidad.</p>
      </header>
      <section className="profile-card">
        <div className="profile-avatar">
          {account.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2>{account.name}</h2>
          <p>{account.email}</p>
          <span
            className={`verified-label ${account.verified ? "success-text" : ""}`}
          >
            <ShieldCheck size={13} />
            {account.verified
              ? "Correo verificado"
              : "Correo pendiente de verificar"}
          </span>
        </div>
        {!account.verified && (
          <button
            className="small-action"
            disabled={busy}
            onClick={() => void verify()}
          >
            Verificar
            <ArrowRight size={15} />
          </button>
        )}
      </section>
      <ErrorBox message={error} />
      {message && <SuccessBox>{message}</SuccessBox>}
      <div className="settings-columns">
        <div>
          <h3 className="group-label">PREFERENCIAS</h3>
          <section className="settings-group">
            <button
              className="setting-row"
              onClick={() => setModal("preferences")}
            >
              <div className="mini-icon">
                <Moon size={19} />
              </div>
              <div>
                <strong>Apariencia y región</strong>
                <span>
                  {
                    {
                      system: "Según tu dispositivo",
                      light: "Modo claro",
                      dark: "Modo oscuro",
                    }[account.settings.theme]
                  }{" "}
                  · {account.settings.timezone}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
            <button
              className="setting-row"
              onClick={() => setModal("reminders")}
            >
              <div className="mini-icon amber">
                <Bell size={19} />
              </div>
              <div>
                <strong>Avisos a tu medida</strong>
                <span>
                  {account.settings.reminderDays.length
                    ? `${account.settings.reminderDays.join(", ")} días antes del plazo`
                    : "Avisos de plazo desactivados"}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
          </section>
          <h3 className="group-label">TUS DATOS</h3>
          <section className="settings-group">
            <button
              className="setting-row"
              onClick={() => void exportData()}
              disabled={busy}
            >
              <div className="mini-icon">
                <Download size={19} />
              </div>
              <div>
                <strong>Exportar mis datos</strong>
                <span>Compras, devoluciones y configuración en JSON</span>
              </div>
              <ChevronRight size={17} />
            </button>
            <button className="setting-row" onClick={() => setModal("privacy")}>
              <div className="mini-icon green">
                <ShieldCheck size={19} />
              </div>
              <div>
                <strong>Privacidad y documentos</strong>
                <span>Cómo se guarda y utiliza tu información</span>
              </div>
              <ChevronRight size={17} />
            </button>
            <button className="setting-row" onClick={() => setModal("logout")}>
              <div className="mini-icon">
                <LogOut size={19} />
              </div>
              <div>
                <strong>Cerrar sesión</strong>
                <span>Tus datos seguirán guardados</span>
              </div>
              <ChevronRight size={17} />
            </button>
          </section>
        </div>
        <div>
          <h3 className="group-label">AUTOMATIZACIONES</h3>
          <section className="automation-card">
            <div className="section-heading">
              <div className="mini-icon">
                <Zap size={20} />
              </div>
              <span className="subtle-badge">Estado real</span>
            </div>
            <h2>Menos trabajo para ti.</h2>
            <p className="muted">
              Conexiones que te ayudan a tener todo al día.
            </p>
            {capabilities ? (
              Object.entries(capabilities).map(([key, c]) => (
                <div className="capability" key={key}>
                  <span className={`capability-dot ${c.state}`} />
                  <div>
                    <strong>{c.label}</strong>
                    <p>{c.detail}</p>
                  </div>
                  <span className={`capability-label ${c.state}`}>
                    {c.state === "ready"
                      ? "Activo"
                      : c.state === "degraded"
                        ? "Revisar"
                        : "Sin activar"}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">
                No se pudo consultar el estado de las conexiones.
              </p>
            )}
            {account.inboundAddress && (
              <div className="inbound-address">
                <span>Tu dirección para reenviar tickets</span>
                <strong>{account.inboundAddress}</strong>
                <button
                  className="small-action"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        account.inboundAddress!,
                      );
                      setCopy(true);
                    } catch {
                      setError(
                        "No se pudo copiar. Selecciona la dirección y cópiala manualmente.",
                      );
                    }
                  }}
                >
                  <Copy size={14} />
                  {copy ? "Copiado" : "Copiar dirección"}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
      {documents.length > 0 && (
        <section className="unassociated-documents">
          <h3>Archivos sin asociar</h3>
          <p className="muted small">
            Documentos de importaciones pendientes de guardar, para descargar o
            eliminar.
          </p>
          <Documents documents={documents} reload={reload} />
        </section>
      )}
      <div className="account-end">
        <Brand compact />
        <p>Un lugar para cada compra.</p>
        <button
          className="small-action danger-text"
          onClick={() => setModal("delete")}
        >
          Eliminar mi cuenta
        </button>
      </div>
      {modal === "preferences" && (
        <SettingsForm
          account={account}
          mode="preferences"
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "reminders" && (
        <SettingsForm
          account={account}
          mode="reminders"
          reload={reload}
          onClose={() => setModal(null)}
          capabilities={capabilities}
        />
      )}
      {modal === "privacy" && (
        <Sheet
          title="Tu información, con claridad"
          onClose={() => setModal(null)}
        >
          <div className="privacy-copy">
            <ShieldCheck size={32} />
            <h3>Acceso privado a tu cuenta</h3>
            <p>
              Tus compras y documentos están asociados a tu usuario. La sesión
              se guarda en una cookie y necesitas iniciar sesión para acceder.
            </p>
            <h3>Extracción de documentos</h3>
            <p>
              Cuando subes un archivo para extraer datos, se procesa en el
              servidor. Si está configurada la extracción con IA, el contenido
              se envía al proveedor configurado. Revisa el resultado antes de
              guardarlo.
            </p>
            <h3>Enlaces de tiendas</h3>
            <p>
              Se usan dominios oficiales y comprobaciones de destino. Al
              abrirlos sales de esta app y se aplican las condiciones de la
              tienda.
            </p>
            <h3>Correos y avisos</h3>
            <p>
              Los correos solo se envían cuando el servicio está configurado y
              has activado los avisos. No podemos acceder a tu bandeja de
              entrada; la recepción depende de los mensajes que reenvíes a tu
              dirección asignada.
            </p>
            <h3>Eliminar y exportar</h3>
            <p>
              Puedes exportar tus datos y descargar tus documentos. Eliminar tu
              cuenta borra tus datos de la aplicación; las copias de seguridad
              del alojamiento siguen la política de su operador.
            </p>
          </div>
        </Sheet>
      )}
      {modal === "logout" && (
        <Confirm
          title="¿Cerrar sesión?"
          label="Cerrar sesión"
          onClose={() => setModal(null)}
          run={logout}
        >
          Podrás volver cuando quieras con tu correo y contraseña.
        </Confirm>
      )}
      {modal === "delete" && (
        <DeleteAccount logout={logout} onClose={() => setModal(null)} />
      )}
    </>
  );
}
function SettingsForm({
  account,
  mode,
  reload,
  onClose,
  capabilities,
}: {
  account: Account;
  mode: "preferences" | "reminders";
  reload: () => Promise<void>;
  onClose: () => void;
  capabilities?: Capabilities | null;
}) {
  const [value, setValue] = useState<Settings>(account.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/settings", { method: "PATCH", body: value });
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
      title={
        mode === "preferences" ? "Apariencia y región" : "Avisos a tu medida"
      }
      onClose={() => !busy && onClose()}
    >
      <form className="d-form" onSubmit={submit}>
        {mode === "preferences" ? (
          <>
            <Field label="Apariencia">
              <select
                value={value.theme}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    theme: e.target.value as Settings["theme"],
                  }))
                }
              >
                <option value="system">Según tu dispositivo</option>
                <option value="light">Modo claro</option>
                <option value="dark">Modo oscuro</option>
              </select>
            </Field>
            <Field
              label="Zona horaria"
              hint="Se utiliza para contar los días y programar avisos."
            >
              <select
                value={value.timezone}
                onChange={(e) =>
                  setValue((v) => ({ ...v, timezone: e.target.value }))
                }
              >
                {[
                  ...new Set([
                    value.timezone,
                    "Europe/Madrid",
                    "Atlantic/Canary",
                    "Europe/Lisbon",
                    "Europe/London",
                    "Europe/Paris",
                    "America/Mexico_City",
                    "America/Bogota",
                    "America/Lima",
                    "America/Santiago",
                    "America/Argentina/Buenos_Aires",
                    "America/New_York",
                    "America/Los_Angeles",
                    "UTC",
                  ]),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="País habitual">
              <select
                value={value.country}
                onChange={(e) =>
                  setValue((v) => ({ ...v, country: e.target.value }))
                }
              >
                {!["ES", "PT", "FR", "DE", "IT", "GB", "US", "MX"].includes(
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
            <Field
              label="Código de otro país"
              hint="Código ISO de dos letras, por ejemplo AR, CO o CL."
            >
              <input
                required
                maxLength={2}
                minLength={2}
                pattern="[A-Za-z]{2}"
                value={value.country}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    country: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Field>
          </>
        ) : (
          <>
            <p className="muted">
              Recibe avisos sobre los plazos que has guardado. Un plazo sin
              confirmar necesita primero tu revisión.
            </p>
            <fieldset className="reminder-options">
              <legend>Avísame antes del plazo</legend>
              {[14, 7, 3, 1, 0].map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={value.reminderDays.includes(day)}
                    onChange={(e) =>
                      setValue((v) => ({
                        ...v,
                        reminderDays: e.target.checked
                          ? [...v.reminderDays, day].sort((a, b) => b - a)
                          : v.reminderDays.filter((d) => d !== day),
                      }))
                    }
                  />
                  <span>
                    {day === 0
                      ? "El mismo día"
                      : day === 1
                        ? "1 día antes"
                        : `${day} días antes`}
                  </span>
                  <Check size={16} />
                </label>
              ))}
            </fieldset>
            <Field
              label="Hora del aviso"
              hint={`Zona horaria: ${value.timezone}`}
            >
              <select
                value={value.reminderHour}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    reminderHour: Number(e.target.value),
                  }))
                }
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </Field>
            <label className="toggle-row">
              <div>
                <strong>También por correo</strong>
                <span>
                  {capabilities?.emailReminders.state === "ready"
                    ? account.verified
                      ? "Recibe los avisos en tu correo."
                      : "Primero verifica tu correo."
                    : "El envío por correo aún no está configurado."}
                </span>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={value.emailReminders}
                disabled={
                  capabilities?.emailReminders.state !== "ready" ||
                  !account.verified
                }
                onChange={(e) =>
                  setValue((v) => ({ ...v, emailReminders: e.target.checked }))
                }
              />
            </label>
          </>
        )}
        <ErrorBox message={error} />
        <Button type="submit" busy={busy}>
          Guardar preferencias
          <Check size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
function DeleteAccount({
  logout,
  onClose,
}: {
  logout: () => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/account", { method: "DELETE", body: { password } });
      window.location.replace(window.location.pathname);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Eliminar mi cuenta" onClose={() => !busy && onClose()}>
      <form className="d-form" onSubmit={submit}>
        <p className="body-copy">
          Se eliminarán tus compras, devoluciones, documentos y configuración.
          Exporta antes lo que necesites conservar.
        </p>
        <Field label="Confirma con tu contraseña">
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <label className="checkbox-line">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>Entiendo que esta acción no se puede deshacer.</span>
        </label>
        <ErrorBox message={error} />
        <Button
          type="submit"
          variant="danger"
          busy={busy}
          disabled={!confirmed || !password}
        >
          Eliminar cuenta y datos
          <Trash2 size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
