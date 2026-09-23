import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  LoaderCircle,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  CalendarDays,
  ReceiptText,
  ScanLine,
  Link,
  RefreshCw,
} from "lucide-react";
import { api, ApiError, errorText, setCsrf } from "./api";
import { AccountPage, Auth, Brand } from "./account";
import { Button, EmptyState, ErrorBox, Sheet, SuccessBox } from "./components";
import { ImportSheet, PurchaseForm } from "./forms";
import { dateLabel, PurchaseDetail, ReturnDetail } from "./details";
import {
  availableQuantity,
  daysRemaining,
  deadlineLabel,
  emptyState,
  formatMoney,
  RETURN_LABELS,
  type Account,
  type AppState,
  type Capabilities,
  type Purchase,
  type ReturnCase,
} from "../../../../lib/domain/src/index";
import "./app.css";

type Tab = "purchases" | "returns" | "account";
type Filter = "active" | "urgent" | "missing" | "history";
export default function DevuelveloApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [state, setState] = useState<AppState>(emptyState);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("purchases");
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const verifyToken = new URLSearchParams(window.location.search).get("verify");
  const reload = useCallback(async () => {
    try {
      const result = await api<{ state: AppState; account: Account }>("/state");
      setState(result.state);
      setAccount(result.account);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAccount(null);
        setState(emptyState());
      } else throw e;
    }
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await api<{ account: Account | null; csrfToken: string }>(
        "/session",
      );
      setCsrf(session.csrfToken);
      setAccount(session.account);
      if (session.account) {
        await reload();
        const caps = await api<Capabilities>("/capabilities").catch(() => null);
        setCapabilities(caps);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [reload]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const fn = () => setOnline(navigator.onLine);
    window.addEventListener("online", fn);
    window.addEventListener("offline", fn);
    return () => {
      window.removeEventListener("online", fn);
      window.removeEventListener("offline", fn);
    };
  }, []);
  useEffect(() => {
    if (!account) return;
    const pending = state.imports.some(
      (i) => i.status === "queued" || i.status === "processing",
    );
    const tick = () => {
      if (document.visibilityState === "visible")
        void reload().catch((e) => setError(errorText(e)));
    };
    const id = window.setInterval(tick, pending ? 2500 : 45000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [account?.id, state.imports, reload]);
  useEffect(() => {
    const theme = account?.settings.theme || "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.dvyTheme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          document.documentElement.dataset.dvyTheme === "dark"
            ? "#0c1220"
            : "#f5f7fa",
        );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [account?.settings.theme]);
  useEffect(() => {
    document.title = "DevuélveloYa — Tus compras, bajo control";
  }, []);
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setAccount(null);
    setState(emptyState());
    setTab("purchases");
    setPurchaseId(null);
    setReturnId(null);
    await initialize();
  }
  function changeTab(value: Tab) {
    setTab(value);
    setQuery("");
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  async function confirmVerification() {
    setVerifyBusy(true);
    setError(null);
    try {
      const result = await api<{ message: string }>("/auth/verify", {
        method: "POST",
        body: { token: verifyToken },
      });
      setVerifyMessage(result.message || "Correo verificado.");
      window.history.replaceState({}, "", window.location.pathname);
      await reload();
      setCapabilities(
        await api<Capabilities>("/capabilities").catch(() => null),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setVerifyBusy(false);
    }
  }
  const unread = state.notifications.filter((n) => !n.read).length;
  const activeReturns = state.returns.filter(
    (r) => !["resolved", "cancelled"].includes(r.status),
  ).length;
  const purchase = state.purchases.find((p) => p.id === purchaseId);
  const returnCase = state.returns.find((r) => r.id === returnId);
  if (loading)
    return (
      <div className="d-app loading-screen">
        <Brand />
        <div className="loading-inner">
          <LoaderCircle size={27} className="spin" />
          <p>Poniendo todo en su sitio…</p>
        </div>
      </div>
    );
  if (!account || new URLSearchParams(window.location.search).has("reset"))
    return (
      <>
        {error && (
          <div className="startup-error">
            <ErrorBox message={error} />
            <Button variant="secondary" onClick={() => void initialize()}>
              Volver a conectar
              <RefreshCw size={16} />
            </Button>
          </div>
        )}
        <Auth onLogin={initialize} />
      </>
    );
  return (
    <div className="d-app">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <div className="app-shell">
        <aside className="desktop-sidebar">
          <Brand />
          <div className="sidebar-nav">
            <NavButton tab="purchases" current={tab} onClick={changeTab} />
            <NavButton
              tab="returns"
              current={tab}
              onClick={changeTab}
              count={activeReturns}
            />
            <NavButton tab="account" current={tab} onClick={changeTab} />
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <ShieldCheck size={20} />
              <p>
                Un poco de orden.
                <br />
                <strong>Mucha tranquilidad.</strong>
              </p>
            </div>
            <button
              className="sidebar-profile"
              onClick={() => changeTab("account")}
            >
              <span className="profile-avatar small">
                {account.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{account.name}</strong>
                <span>Tu espacio personal</span>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
        <div className="main-column">
          <header className="app-topbar">
            <Brand compact />
            <span className="topbar-context">
              Tu día, con menos pendientes.
            </span>
            <div className="topbar-actions">
              <button
                className="notification-button icon-button"
                aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}
                onClick={() => setShowNotifications(true)}
              >
                <Bell size={20} />
                {unread > 0 && <span className="notification-dot" />}
              </button>
              <button
                className="mobile-avatar"
                aria-label="Abrir mi cuenta"
                onClick={() => changeTab("account")}
              >
                {account.name.slice(0, 1).toUpperCase()}
              </button>
            </div>
          </header>
          <main id="main-content" className="app-content">
            {!online && (
              <div className="d-message warning" role="status">
                <Inbox size={19} />
                <span>
                  Sin conexión. Tus últimos datos siguen visibles. Conéctate
                  para guardar cambios.
                </span>
              </div>
            )}
            <ErrorBox message={error} />
            {error && (
              <button
                className="small-action retry-action"
                onClick={() =>
                  void reload().catch((e) => setError(errorText(e)))
                }
              >
                Reintentar
                <RefreshCw size={14} />
              </button>
            )}
            {verifyToken && !account.verified && (
              <div className="verification-banner">
                <MailIcon />
                <div>
                  <strong>Confirma tu correo</strong>
                  <p>
                    Activa los avisos por correo cuando el servicio esté
                    configurado.
                  </p>
                </div>
                <Button
                  busy={verifyBusy}
                  onClick={() => void confirmVerification()}
                >
                  Confirmar
                </Button>
              </div>
            )}
            {verifyMessage && <SuccessBox>{verifyMessage}</SuccessBox>}
            {tab === "purchases" ? (
              <PurchasesPage
                account={account}
                state={state}
                filter={filter}
                setFilter={setFilter}
                query={query}
                setQuery={setQuery}
                open={setPurchaseId}
                add={() => setShowAdd(true)}
                importOpen={() => setShowImport(true)}
              />
            ) : tab === "returns" ? (
              <ReturnsPage
                account={account}
                state={state}
                query={query}
                setQuery={setQuery}
                open={setReturnId}
                goPurchases={() => changeTab("purchases")}
              />
            ) : (
              <AccountPage
                account={account}
                capabilities={capabilities}
                reload={reload}
                logout={logout}
                documents={state.documents.filter(
                  (d) => !d.purchaseId && !d.returnId,
                )}
              />
            )}
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavButton tab="purchases" current={tab} onClick={changeTab} />
        <NavButton
          tab="returns"
          current={tab}
          onClick={changeTab}
          count={activeReturns}
        />
        <NavButton tab="account" current={tab} onClick={changeTab} />
      </nav>
      {showAdd && (
        <Sheet
          title="Un lugar para tu compra"
          subtitle="Añádela como te resulte más fácil."
          onClose={() => setShowAdd(false)}
        >
          <div className="add-choices">
            <button
              onClick={() => {
                setShowAdd(false);
                setShowImport(true);
              }}
            >
              <span className="choice-icon">
                <ScanLine size={25} />
              </span>
              <div>
                <strong>Desde un ticket o email</strong>
                <p>Extrae datos y revísalos antes de guardar.</p>
                <span>PDF · Imagen · Texto · Email</span>
              </div>
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setShowManual(true);
              }}
            >
              <span className="choice-icon neutral">
                <ReceiptText size={25} />
              </span>
              <div>
                <strong>Añadir a mano</strong>
                <p>Solo los datos que conoces. Sin suposiciones.</p>
              </div>
              <ChevronRight size={18} />
            </button>
          </div>
          <p className="muted small choice-footer">
            <ShieldCheck size={14} />
            Tú decides qué guardar y cuándo devolver.
          </p>
        </Sheet>
      )}
      {showManual && (
        <PurchaseForm
          timezone={account.settings.timezone}
          country={account.settings.country}
          reload={reload}
          onClose={() => setShowManual(false)}
        />
      )}
      {showImport && (
        <ImportSheet
          onClose={() => setShowImport(false)}
          reload={reload}
          imports={state.imports}
          extractionReady={capabilities?.extraction.state === "ready"}
        />
      )}
      {purchase && (
        <PurchaseDetail
          purchase={purchase}
          state={state}
          account={account}
          reload={reload}
          onClose={() => setPurchaseId(null)}
          openReturn={(id) => {
            setPurchaseId(null);
            setReturnId(id);
          }}
        />
      )}
      {returnCase && (
        <ReturnDetail
          value={returnCase}
          state={state}
          account={account}
          reload={reload}
          onClose={() => setReturnId(null)}
        />
      )}
      {showNotifications && (
        <Notifications
          state={state}
          reload={reload}
          onClose={() => setShowNotifications(false)}
          openPurchase={(id) => {
            setShowNotifications(false);
            setPurchaseId(id);
          }}
          openReturn={(id) => {
            setShowNotifications(false);
            setReturnId(id);
          }}
        />
      )}
    </div>
  );
}
function MailIcon() {
  return <FileText size={24} />;
}
function NavButton({
  tab,
  current,
  onClick,
  count,
}: {
  tab: Tab;
  current: Tab;
  onClick: (t: Tab) => void;
  count?: number;
}) {
  const Icon = { purchases: Package, returns: RotateCcw, account: UserRound }[
    tab
  ];
  return (
    <button
      className={`nav-button ${tab === current ? "active" : ""}`}
      onClick={() => onClick(tab)}
      aria-current={tab === current ? "page" : undefined}
    >
      <span className="nav-icon-wrap">
        <Icon size={21} strokeWidth={tab === current ? 2 : 1.65} />
        {!!count && (
          <span className="nav-count">{count > 99 ? "99+" : count}</span>
        )}
      </span>
      <span>
        {
          { purchases: "Compras", returns: "Devoluciones", account: "Cuenta" }[
            tab
          ]
        }
      </span>
    </button>
  );
}
function PurchasesPage({
  account,
  state,
  filter,
  setFilter,
  query,
  setQuery,
  open,
  add,
  importOpen,
}: {
  account: Account;
  state: AppState;
  filter: Filter;
  setFilter: (v: Filter) => void;
  query: string;
  setQuery: (s: string) => void;
  open: (id: string) => void;
  add: () => void;
  importOpen: () => void;
}) {
  const timezone = account.settings.timezone;
  const active = state.purchases.filter(
    (p) => !p.archived && availableQuantity(state, p) > 0,
  );
  const urgent = active.filter((p) => {
    const d = daysRemaining(p.deadline, timezone);
    return d !== null && d >= 0 && d <= 7;
  });
  const missing = active.filter(
    (p) => !p.deadline || p.deadlineQuality === "estimated",
  );
  const history = state.purchases.filter(
    (p) => p.archived || availableQuantity(state, p) === 0,
  );
  const expired = active.filter(
    (p) => (daysRemaining(p.deadline, timezone) ?? 1) < 0,
  );
  const reviewCount = state.imports.filter(
    (i) => i.status === "needs_review",
  ).length;
  const processing = state.imports.filter((i) =>
    ["queued", "processing"].includes(i.status),
  ).length;
  const list = useMemo(
    () =>
      ({ active, urgent, missing, history })[filter]
        .filter((p) =>
          `${p.title} ${p.store} ${p.orderNumber}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => {
          const ad = daysRemaining(a.deadline, timezone) ?? 100000;
          const bd = daysRemaining(b.deadline, timezone) ?? 100000;
          return ad - bd || b.createdAt.localeCompare(a.createdAt);
        }),
    [state, filter, query, timezone],
  );
  const hasPurchases = state.purchases.length > 0;
  const totalByCurrency = active.reduce<Record<string, number>>((totals, p) => {
    if (p.priceMinor !== null)
      totals[p.currency] =
        (totals[p.currency] || 0) +
        Math.round((p.priceMinor * availableQuantity(state, p)) / p.quantity);
    return totals;
  }, {});
  const totals = Object.entries(totalByCurrency);
  return (
    <>
      <header className="page-heading purchases-heading">
        <div>
          <p className="eyebrow">
            HOLA, {account.name.split(" ")[0].toLocaleUpperCase()}
          </p>
          <h1>
            Tus compras.
            <br className="mobile-break" />
            <span>Todo en orden.</span>
          </h1>
          <p>Más tiempo para decidir. Menos cosas que recordar.</p>
        </div>
        <Button
          className="heading-add"
          aria-label="Añadir compra"
          onClick={add}
        >
          <Plus size={20} />
          <span>Añadir compra</span>
        </Button>
      </header>
      <section className="overview-grid">
        <div className="overview-primary">
          <div className="overview-top">
            <span className="overview-caption">TU MARGEN PARA DECIDIR</span>
            <span className="overview-spark">
              <Sparkles size={18} />
            </span>
          </div>
          <div className="overview-number">
            {active.length}
            <span>
              {active.length === 1
                ? "compra por decidir"
                : "compras por decidir"}
            </span>
          </div>
          <div className="overview-bottom">
            <span>
              {active.length === 0
                ? "Tu próxima compra tiene su sitio aquí."
                : totals.length === 1
                  ? `${formatMoney(totals[0][1], totals[0][0])} en compras pendientes`
                  : totals.length > 1
                    ? `${totals.length} monedas · importes por separado`
                    : "Importes pendientes de completar"}
            </span>
            <ArrowUpRight size={21} />
          </div>
        </div>
        <button
          className="overview-secondary"
          onClick={() => setFilter("urgent")}
        >
          <span className="mini-icon amber">
            <Clock3 size={21} />
          </span>
          <div>
            <strong>{urgent.length}</strong>
            <span>
              {urgent.length === 1 ? "plazo esta semana" : "plazos esta semana"}
            </span>
          </div>
          <ChevronRight size={17} />
        </button>
        <button
          className="overview-secondary"
          onClick={() => setFilter("missing")}
        >
          <span className="mini-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <strong>{missing.length}</strong>
            <span>
              {missing.length === 1
                ? "fecha por revisar"
                : "fechas por revisar"}
            </span>
          </div>
          <ChevronRight size={17} />
        </button>
      </section>
      {(reviewCount > 0 || processing > 0) && (
        <button className="attention-banner blue" onClick={importOpen}>
          <div className="mini-icon">
            <ScanLine size={20} />
          </div>
          <div>
            <strong>
              {reviewCount
                ? `${reviewCount} ${reviewCount === 1 ? "ticket listo" : "tickets listos"} para revisar`
                : "Estamos preparando tus tickets"}
            </strong>
            <p>
              {reviewCount
                ? "Comprueba los datos antes de guardarlos."
                : "La extracción continúa en segundo plano."}
            </p>
          </div>
          <ArrowRight size={17} />
        </button>
      )}
      {expired.length > 0 && (
        <div className="attention-banner warm">
          <Clock3 size={20} />
          <div>
            <strong>
              {expired.length}{" "}
              {expired.length === 1
                ? "plazo registrado ha vencido"
                : "plazos registrados han vencido"}
            </strong>
            <p>Revisa las condiciones de la tienda antes de descartarlos.</p>
          </div>
        </div>
      )}
      <section className="purchases-section">
        <div className="section-heading purchases-section-heading">
          <h2>Tu colección de compras</h2>
          <button className="small-action desktop-import" onClick={importOpen}>
            <ScanLine size={17} />
            Importar ticket
          </button>
          <button
            className="icon-button mobile-add"
            aria-label="Añadir compra"
            onClick={add}
          >
            <Plus size={21} />
          </button>
        </div>
        <div className="collection-toolbar">
          <div
            className="filter-tabs"
            role="group"
            aria-label="Filtrar compras"
          >
            {(
              [
                { key: "active", label: "Pendientes", count: active.length },
                { key: "urgent", label: "Esta semana", count: urgent.length },
                { key: "missing", label: "Por revisar", count: missing.length },
                { key: "history", label: "Historial", count: history.length },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                className={filter === f.key ? "active" : ""}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.count > 0 && <span>{f.count}</span>}
              </button>
            ))}
          </div>
          <div className="search-box">
            <Search size={17} />
            <input
              aria-label="Buscar compras por artículo, tienda o pedido"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar compra o tienda"
            />
            {query && (
              <button aria-label="Borrar búsqueda" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        {list.length ? (
          <div className="purchase-grid">
            {list.map((p) => (
              <PurchaseCard
                key={p.id}
                value={p}
                state={state}
                timezone={timezone}
                onClick={() => open(p.id)}
              />
            ))}
          </div>
        ) : !hasPurchases ? (
          <div className="first-purchase-card">
            <EmptyState
              title="Empieza con tu primera compra."
              action={
                <Button onClick={add}>
                  <Plus size={17} />
                  Añadir mi primera compra
                </Button>
              }
            >
              Un ticket, un email o unos pocos datos.
              <br />
              Nos encargamos de ponerlos en orden.
            </EmptyState>
            <div className="first-steps">
              <div>
                <span>01</span>
                <strong>Guarda tu compra</strong>
                <p>Importa el ticket o añádela a mano.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Revisa el plazo</strong>
                <p>Confirma la fecha de la tienda.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Decide con calma</strong>
                <p>Devuelve o quédatela. Tú eliges.</p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            title={
              query
                ? "No encontramos esa compra."
                : filter === "urgent"
                  ? "Sin prisas esta semana."
                  : filter === "missing"
                    ? "Las fechas, bajo control."
                    : filter === "history"
                      ? "Tu historial empieza aquí."
                      : "Nada pendiente. Qué bien."
            }
            action={
              query ? (
                <Button variant="secondary" onClick={() => setQuery("")}>
                  Borrar búsqueda
                </Button>
              ) : filter === "active" ? (
                <Button variant="secondary" onClick={add}>
                  Añadir una compra
                  <Plus size={16} />
                </Button>
              ) : undefined
            }
          >
            {query
              ? "Prueba con otro artículo, tienda o número de pedido."
              : filter === "urgent"
                ? "Aquí verás las compras cuyo plazo vence en los próximos 7 días."
                : filter === "missing"
                  ? "Aquí aparecerán los plazos sin confirmar y las estimaciones."
                  : filter === "history"
                    ? "Encontrarás las compras archivadas, conservadas o ya asignadas a una devolución."
                    : "Tus próximas compras tendrán su espacio aquí."}
          </EmptyState>
        )}
      </section>
      <div className="page-footnote">
        <ShieldCheck size={14} />
        <span>
          Tú confirmas los plazos. Nosotros te ayudamos a recordarlos.
        </span>
      </div>
    </>
  );
}
function PurchaseCard({
  value: p,
  state,
  timezone,
  onClick,
}: {
  value: Purchase;
  state: AppState;
  timezone: string;
  onClick: () => void;
}) {
  const days = daysRemaining(p.deadline, timezone);
  const tone =
    !p.deadline || p.deadlineQuality === "estimated"
      ? "unconfirmed"
      : days !== null && days <= 3
        ? "urgent"
        : days !== null && days <= 7
          ? "soon"
          : "calm";
  const quantity = availableQuantity(state, p);
  return (
    <button className="purchase-card" onClick={onClick}>
      <div className="purchase-card-top">
        <span className={`store-mark tone-${p.store.length % 4}`}>
          {p.store.slice(0, 1).toLocaleUpperCase()}
        </span>
        <div className="purchase-merchant">
          <strong>{p.store}</strong>
          <span>{dateLabel(p.purchasedAt)}</span>
        </div>
        <ArrowUpRight size={18} className="card-arrow" />
      </div>
      <div className="purchase-card-body">
        <h3>{p.title}</h3>
        <p>
          {formatMoney(p.priceMinor, p.currency)}
          {p.quantity > 1 && <span> · {p.quantity} unidades</span>}
        </p>
      </div>
      <div className="purchase-card-bottom">
        <span className={`deadline-badge ${tone}`}>
          <span />
          {p.archived
            ? "Archivada"
            : quantity === 0
              ? p.keptQuantity === p.quantity
                ? "Te la has quedado"
                : "En seguimiento"
              : deadlineLabel(p, timezone)}
        </span>
        <span className="purchase-card-qty">
          {p.quantity > 1
            ? `${quantity} pendientes`
            : p.orderNumber
              ? `#${p.orderNumber.slice(-8)}`
              : "Ver compra"}
        </span>
      </div>
    </button>
  );
}
function ReturnsPage({
  account,
  state,
  query,
  setQuery,
  open,
  goPurchases,
}: {
  account: Account;
  state: AppState;
  query: string;
  setQuery: (s: string) => void;
  open: (id: string) => void;
  goPurchases: () => void;
}) {
  const [history, setHistory] = useState(false);
  const [outcome, setOutcome] = useState("all");
  const current = state.returns.filter(
    (r) => !["resolved", "cancelled"].includes(r.status),
  );
  const done = state.returns.filter((r) =>
    ["resolved", "cancelled"].includes(r.status),
  );
  const list = (history ? done : current).filter(
    (r) =>
      (outcome === "all" || r.outcome === outcome) &&
      `${r.reference} ${r.items
        .map((i) => {
          const p = state.purchases.find((p) => p.id === i.purchaseId);
          return `${p?.title} ${p?.store}`;
        })
        .join(" ")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const pending = current
    .filter((r) => r.outcome === "refund")
    .reduce<Record<string, number>>((totals, r) => {
      if (r.expectedMinor !== null)
        totals[r.currency] =
          (totals[r.currency] || 0) +
          Math.max(
            0,
            r.expectedMinor -
              r.refunds
                .filter((f) => f.kind === "received")
                .reduce((s, f) => s + f.amountMinor, 0),
          );
      return totals;
    }, {});
  const received = state.returns.reduce<Record<string, number>>((totals, r) => {
    for (const f of r.refunds.filter((f) => f.kind === "received"))
      totals[f.currency] = (totals[f.currency] || 0) + f.amountMinor;
    return totals;
  }, {});
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">HASTA EL ÚLTIMO PASO</p>
        <h1>
          Devolver.<span>Y respirar.</span>
        </h1>
        <p>Del primer clic al dinero de vuelta.</p>
      </header>
      <div className="returns-summary">
        <div>
          <span className="mini-icon">
            <RotateCcw size={21} />
          </span>
          <p>
            En curso<strong>{current.length}</strong>
          </p>
        </div>
        <div>
          <span className="mini-icon amber">
            <Clock3 size={21} />
          </span>
          <p>
            Por recibir
            <strong>
              {Object.keys(pending).length
                ? Object.entries(pending).map(([c, m]) => (
                    <span key={c}>{formatMoney(m, c)}</span>
                  ))
                : "—"}
            </strong>
          </p>
        </div>
        <div>
          <span className="mini-icon green">
            <CheckCircle2Icon />
          </span>
          <p>
            Ya recibido
            <strong>
              {Object.keys(received).length
                ? Object.entries(received).map(([c, m]) => (
                    <span key={c}>{formatMoney(m, c)}</span>
                  ))
                : "—"}
            </strong>
          </p>
        </div>
      </div>
      <div className="section-heading">
        <h2>Cada paso, claro.</h2>
        <select
          className="compact-select"
          aria-label="Filtrar por resultado"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          <option value="refund">Reembolsos</option>
          <option value="exchange">Cambios</option>
          <option value="voucher">Vales</option>
        </select>
      </div>
      <div className="collection-toolbar">
        <div className="filter-tabs">
          <button
            className={!history ? "active" : ""}
            onClick={() => setHistory(false)}
          >
            En curso{current.length > 0 && <span>{current.length}</span>}
          </button>
          <button
            className={history ? "active" : ""}
            onClick={() => setHistory(true)}
          >
            Historial{done.length > 0 && <span>{done.length}</span>}
          </button>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Buscar devoluciones"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar devolución"
          />
          {query && (
            <button aria-label="Borrar búsqueda" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      {list.length ? (
        <div className="return-list">
          {[...list]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((r) => (
              <ReturnCard
                key={r.id}
                value={r}
                state={state}
                onClick={() => open(r.id)}
              />
            ))}
        </div>
      ) : (
        <EmptyState
          title={
            state.returns.length === 0
              ? "Cada devolución, acompañada."
              : history
                ? "Un historial sin pendientes."
                : "Todo al día."
          }
          action={
            state.returns.length === 0 ? (
              <Button variant="secondary" onClick={goPurchases}>
                Elegir una compra
                <ArrowRight size={17} />
              </Button>
            ) : undefined
          }
        >
          {state.returns.length === 0
            ? "Abre una compra y pulsa Preparar devolución. Guardarás cada paso, documento y reembolso aquí."
            : "No hay devoluciones que coincidan con esta vista."}
        </EmptyState>
      )}
      <div className="page-footnote">
        <ShieldCheck size={14} />
        <span>Los pasos se actualizan cuando tú los confirmas.</span>
      </div>
    </>
  );
}
function CheckCircle2Icon() {
  return <Check size={21} />;
}
function ReturnCard({
  value: r,
  state,
  onClick,
}: {
  value: ReturnCase;
  state: AppState;
  onClick: () => void;
}) {
  const p = state.purchases.find((p) => p.id === r.items[0]?.purchaseId);
  const index = [
    "draft",
    "requested",
    "authorized",
    "shipped",
    "received",
    "resolved",
  ].indexOf(r.status);
  return (
    <button className="return-card" onClick={onClick}>
      <div className="return-card-head">
        <span className="store-mark">{(p?.store || "D").slice(0, 1)}</span>
        <div>
          <span className="muted small">
            {p?.store || "Compra"} ·{" "}
            {r.items.reduce((s, i) => s + i.quantity, 0)} unidad(es)
          </span>
          <h3>
            {p?.title || "Devolución"}
            {r.items.length > 1 ? ` y ${r.items.length - 1} más` : ""}
          </h3>
        </div>
        <ArrowUpRight size={18} />
      </div>
      <div className="return-progress" aria-label={RETURN_LABELS[r.status]}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={i <= index ? "done" : ""} />
        ))}
      </div>
      <div className="return-card-foot">
        <span
          className={`status-badge ${r.status === "resolved" ? "complete" : ""}`}
        >
          {RETURN_LABELS[r.status]}
        </span>
        <strong>
          {r.outcome === "refund"
            ? formatMoney(r.expectedMinor, r.currency)
            : r.outcome === "exchange"
              ? "Cambio"
              : "Vale de compra"}
        </strong>
      </div>
    </button>
  );
}
function Notifications({
  state,
  reload,
  onClose,
  openPurchase,
  openReturn,
}: {
  state: AppState;
  reload: () => Promise<void>;
  onClose: () => void;
  openPurchase: (id: string) => void;
  openReturn: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function read(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Tus avisos"
      subtitle="Lo que necesita un poco de atención."
      onClose={onClose}
    >
      <ErrorBox message={error} />
      {state.notifications.length > 0 ? (
        <>
          <button
            className="small-action mark-read"
            disabled={busy}
            onClick={() => void read("all")}
          >
            Marcar todos como leídos
            <Check size={15} />
          </button>
          <div className="notifications-list">
            {[...state.notifications]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((n) => (
                <div
                  className={`notification-item ${!n.read ? "unread" : ""}`}
                  key={n.id}
                >
                  <div className="mini-icon">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <time>{dateLabel(n.createdAt)}</time>
                    <div className="notification-actions">
                      {(n.purchaseId || n.returnId) && (
                        <button
                          className="small-action"
                          onClick={() => {
                            void read(n.id);
                            if (n.returnId) openReturn(n.returnId);
                            else if (n.purchaseId) openPurchase(n.purchaseId);
                          }}
                        >
                          Ver detalle
                          <ArrowRight size={14} />
                        </button>
                      )}
                      {!n.read && (
                        <button
                          className="small-action"
                          disabled={busy}
                          onClick={() => void read(n.id)}
                        >
                          Leído
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      ) : (
        <EmptyState compact title="Todo tranquilo por aquí.">
          Tus avisos aparecerán aquí cuando una compra o devolución necesite
          atención.
        </EmptyState>
      )}
    </Sheet>
  );
}
