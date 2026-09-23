import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import type {
  Account,
  Capabilities,
  DocumentMeta,
  ImportRecord,
  LinkResult,
  Purchase,
} from "../../../../lib/domain/src/index";
import { store, type Store } from "./store";
import { createRequireAccount, createVerifyMutation } from "./auth";
import { validatePurchase, ValidationError } from "./validation";
import {
  decodeFile,
  emlText,
  emlLinkSource,
  extractImport,
  importFingerprint,
  purchaseFingerprint,
  stripHtml,
  type ImportFile,
} from "./import-parser";
import { identifyMerchant, merchants, resolveReturnLink } from "./merchants";
import { trustedUrl } from "./safe-fetch";
import { emailConfigured } from "./email";
import { runReminders } from "./reminders";

const json = <T>(value: T | string): T =>
  typeof value === "string" ? JSON.parse(value) : value;
const fail = (message: string, status = 400) =>
  new ValidationError(status, message);
const limitedText = (value: unknown, max = 160000) =>
  typeof value === "string" ? value.slice(0, max) : "";
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export async function initializeAutomation(db: Store = store): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS dvy_import_jobs(
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, payload JSONB NOT NULL,
    candidates JSONB NOT NULL DEFAULT '[]', links JSONB NOT NULL DEFAULT '[]', purchase_ids JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, lease_until TIMESTAMPTZ,
    message TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(owner_id,fingerprint)
  )`);
  await db.query(
    "CREATE INDEX IF NOT EXISTS dvy_import_pending ON dvy_import_jobs(status,created_at)",
  );
  await db.query(`CREATE TABLE IF NOT EXISTS dvy_email_deliveries(
    id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL,payload JSONB NOT NULL,status TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL,
    attempted_at TIMESTAMPTZ,provider_id TEXT,last_error TEXT,UNIQUE(owner_id,dedupe_key)
  )`);
  await db.query(
    "CREATE TABLE IF NOT EXISTS dvy_scheduler_meta(id TEXT PRIMARY KEY,last_run TIMESTAMPTZ,details JSONB)",
  );
}
function recordFor(row: any): ImportRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    message: row.message || "Esperando lectura",
    purchaseIds: json<string[]>(row.purchase_ids || []),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export function extractReturnLinks(
  text: string,
): { url: string; host: string }[] {
  const results: { url: string; host: string }[] = [];
  const seen = new Set<string>();
  const passive = text
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi, " ");
  const hrefs = [
    ...passive.matchAll(
      /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
    ),
  ].map((m) => m[1] ?? m[2] ?? m[3]);
  const visible = stripHtml(passive).match(/https:\/\/[^\s<>"']+/gi) || [];
  const raw = [
    ...hrefs.map((value) => ({ value, attribute: true })),
    ...visible.map((value) => ({ value, attribute: false })),
  ];
  for (const match of raw.slice(0, 100)) {
    const decoded = match.value.replace(/&(?:amp|#0*38|#x0*26);/gi, "&");
    const value = match.attribute ? decoded : decoded.replace(/[),.;]+$/g, "");
    try {
      const u = new URL(value);
      const merchant = merchants.find((m) => m.hosts.includes(u.hostname));
      if (!merchant || !/(?:return|devolu|refund)/i.test(u.pathname)) continue;
      trustedUrl(u.href, merchant.hosts);
      if (u.href.length > 4000 || seen.has(u.href)) continue;
      seen.add(u.href);
      results.push({ url: u.href, host: u.hostname });
    } catch {
      /* Untrusted email links are ignored. */
    }
  }
  return results.slice(0, 20);
}
async function enqueue(
  db: Store,
  owner: Account,
  input: {
    text: string;
    file?: ImportFile;
    kind: string;
    title: string;
    fingerprint?: string;
    html?: string;
  },
): Promise<string> {
  const fingerprint =
    input.fingerprint || importFingerprint(owner.id, input.text, input.file);
  const old = await db.query(
    "SELECT id FROM dvy_import_jobs WHERE owner_id=$1 AND fingerprint=$2",
    [owner.id, fingerprint],
  );
  if (old.rows[0]) return old.rows[0].id;
  const recent = await db.query(
    "SELECT count(*) AS count FROM dvy_import_jobs WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",
    [owner.id],
  );
  if (Number(recent.rows[0].count) >= 20)
    throw fail(
      "Has alcanzado 20 importaciones en una hora. Inténtalo más tarde.",
      429,
    );
  const id = randomUUID();
  let documentId: string | null = null;
  if (input.file) {
    const decoded = decodeFile(input.file);
    documentId = randomUUID();
    await db.putDocument(
      owner.id,
      {
        id: documentId,
        name: decoded.file.name,
        mime: decoded.file.mime,
        size: decoded.bytes.length,
        purchaseId: null,
        returnId: null,
        createdAt: new Date().toISOString(),
      },
      decoded.bytes,
    );
  }
  const extractedText =
    input.file && ["text/plain", "message/rfc822"].includes(input.file.mime)
      ? `${input.text}\n${input.file.mime === "message/rfc822" ? emlLinkSource(Buffer.from(input.file.base64, "base64").toString("utf8")) : Buffer.from(input.file.base64, "base64").toString("utf8")}`
      : input.text;
  const result = await db.query(
    "INSERT INTO dvy_import_jobs(id,owner_id,fingerprint,kind,title,payload,links) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(owner_id,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING *",
    [
      id,
      owner.id,
      fingerprint,
      input.kind,
      input.title,
      JSON.stringify({
        text: input.text,
        documentId,
        allowAI: !input.kind.startsWith("email"),
      }),
      JSON.stringify(
        extractReturnLinks(`${extractedText}\n${input.html || ""}`),
      ),
    ],
  );
  const row = result.rows[0];
  if (row.id !== id && documentId)
    await db.deleteDocument(owner.id, documentId);
  await db.mutateState(owner.id, (state) => {
    if (!state.imports.some((i) => i.id === row.id))
      state.imports.unshift(recordFor(row));
  });
  return row.id;
}
export async function processImport(db: Store, id?: string): Promise<boolean> {
  const claimed = await db.query(
    `UPDATE dvy_import_jobs SET status='processing',lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
    WHERE id=(SELECT id FROM dvy_import_jobs WHERE (status='queued' OR (status='processing' AND lease_until<now())) AND attempts<4 ${id ? "AND id=$1" : ""} ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
    id ? [id] : [],
  );
  const row = claimed.rows[0];
  if (!row) return false;
  try {
    await db.mutateState(row.owner_id, (state) => {
      const current = state.imports.find((i) => i.id === row.id);
      if (current && current.status !== "completed") {
        current.status = "processing";
        current.updatedAt = new Date().toISOString();
      } else if (!current) state.imports.unshift(recordFor(row));
    });
    const payload = json<{
      text: string;
      documentId?: string;
      allowAI?: boolean;
    }>(row.payload);
    let file: ImportFile | undefined;
    if (payload.documentId) {
      const document = await db.readDocument(row.owner_id, payload.documentId);
      if (document)
        file = {
          name: document.meta.name,
          mime: document.meta.mime,
          base64: document.bytes.toString("base64"),
        };
      else throw fail("El documento original ya no está disponible");
    }
    if (
      payload.allowAI !== false &&
      process.env.OPENAI_API_KEY &&
      !(await db.limit(`ai:${row.owner_id}`, 20, 3600))
    )
      throw fail(
        "Has alcanzado 20 lecturas asistidas en una hora. Reintenta más tarde.",
        429,
      );
    const result = await extractImport(
      payload.text || "",
      file,
      payload.allowAI !== false,
    );
    const updated = await db.query(
      "UPDATE dvy_import_jobs SET status='needs_review',candidates=$2::jsonb,message=$3,lease_until=NULL,updated_at=now() WHERE id=$1 RETURNING *",
      [row.id, JSON.stringify(result.candidates), result.message],
    );
    await db.mutateState(row.owner_id, (state) => {
      const index = state.imports.findIndex((i) => i.id === row.id);
      const record = recordFor(updated.rows[0]);
      if (index >= 0 && state.imports[index].status !== "completed")
        state.imports[index] = record;
      else if (index < 0) state.imports.unshift(record);
    });
  } catch (error) {
    const message =
      error instanceof ValidationError
        ? error.message
        : "No se pudo completar la lectura. El archivo permanece guardado; puedes reintentar.";
    await db.query(
      "UPDATE dvy_import_jobs SET status='failed',message=$2,lease_until=NULL,updated_at=now() WHERE id=$1",
      [row.id, message],
    );
    try {
      await db.mutateState(row.owner_id, (state) => {
        const item = state.imports.find((i) => i.id === row.id);
        if (item && item.status !== "completed") {
          item.status = "failed";
          item.message = message;
          item.updatedAt = new Date().toISOString();
        }
      });
    } catch {
      /* Account may have been deleted while extracting. */
    }
  }
  return true;
}
export async function runJobs(
  db: Store = store,
): Promise<{ imports: number; notifications: number }> {
  let imports = 0;
  for (let i = 0; i < 8; i++) {
    if (!(await processImport(db))) break;
    imports++;
  }
  const exhausted = await db.query(
    "UPDATE dvy_import_jobs SET status='failed',message='Lectura interrumpida repetidamente; reintenta desde la app',updated_at=now() WHERE status='processing' AND lease_until<now() AND attempts>=4 RETURNING *",
  );
  for (const row of exhausted.rows)
    await db.mutateState(row.owner_id, (state) => {
      const index = state.imports.findIndex((i) => i.id === row.id);
      if (index >= 0 && state.imports[index].status !== "completed")
        state.imports[index] = recordFor(row);
      else if (index < 0) state.imports.unshift(recordFor(row));
    });
  const notifications = await runReminders(db);
  await db.query(
    "INSERT INTO dvy_scheduler_meta(id,last_run,details) VALUES('main',now(),$1::jsonb) ON CONFLICT(id) DO UPDATE SET last_run=EXCLUDED.last_run,details=EXCLUDED.details",
    [JSON.stringify({ imports, notifications })],
  );
  // Raw email bodies are only needed to retry extraction; retain at most 30 days.
  await db.query(
    "UPDATE dvy_import_jobs SET payload='{}'::jsonb WHERE status IN('completed','needs_review','failed') AND updated_at<now()-interval '30 days' AND payload<>'{}'::jsonb",
  );
  return { imports, notifications };
}
async function capabilities(
  db: Store,
  account: Account,
): Promise<Capabilities> {
  const heartbeat = await db.query(
    "SELECT last_run FROM dvy_scheduler_meta WHERE id='main'",
  );
  const active =
    heartbeat.rows[0] &&
    Date.now() - new Date(heartbeat.rows[0].last_run).getTime() <
      2 * 60 * 60 * 1000;
  const inbound = !!(
    process.env.INBOUND_DOMAIN &&
    process.env.POSTMARK_WEBHOOK_USER &&
    process.env.POSTMARK_WEBHOOK_PASSWORD &&
    account.inboundAddress
  );
  return {
    emailInbound: {
      state: inbound
        ? account.verified
          ? "ready"
          : "degraded"
        : "not_configured",
      label: "Reenvío de correos",
      detail: inbound
        ? account.verified
          ? "Reenvía desde el email verificado de tu cuenta a tu dirección personal. Cada correo se guarda para revisar; no conectamos toda tu bandeja."
          : "Confirma tu email para autorizar el reenvío a tu dirección personal."
        : "Pendiente de configurar dominio de entrada y webhook de Postmark. Puedes pegar texto o importar un archivo.",
    },
    extraction: {
      state: process.env.OPENAI_API_KEY ? "ready" : "degraded",
      label: "Lectura de tickets",
      detail: process.env.OPENAI_API_KEY
        ? "Texto, EML, PDF e imágenes con revisión obligatoria. La lectura asistida envía el documento a OpenAI; puede tener coste y errores."
        : "Texto y EML: extracción local disponible. PDF e imágenes: se guardan; su lectura requiere OPENAI_API_KEY.",
    },
    search: {
      state: process.env.BRAVE_SEARCH_API_KEY ? "ready" : "degraded",
      label: "Enlaces de devolución",
      detail: `Fuentes oficiales de ${merchants.length} tiendas de España y enlaces oficiales presentes en tus correos. ${process.env.BRAVE_SEARCH_API_KEY ? "Búsqueda web adicional: sus resultados requieren comprobar el dominio." : "La búsqueda de otras tiendas requiere BRAVE_SEARCH_API_KEY."}`,
    },
    emailReminders: {
      state: emailConfigured()
        ? account.verified
          ? "ready"
          : "degraded"
        : "not_configured",
      label: "Avisos por email",
      detail: emailConfigured()
        ? account.verified
          ? "Disponible si activas los avisos en Ajustes. Su ejecución depende del programador."
          : "Confirma tu dirección antes de activar entregas de correo."
        : "Configura Postmark, remitente y APP_URL. Los avisos dentro de la app permanecen disponibles.",
    },
    scheduler: {
      state: active
        ? "ready"
        : process.env.CRON_SECRET
          ? "degraded"
          : "not_configured",
      label: "Programador de avisos",
      detail: active
        ? `Última ejecución: ${new Date(heartbeat.rows[0].last_run).toISOString()}. Las tareas se ejecutan cada minuto mientras el servidor está activo. Configura un programador externo para mantener los avisos cuando Replit lo suspenda.`
        : "No hay una ejecución reciente confirmada. Configura una tarea horaria que ejecute runJobs o llame al endpoint protegido; abrir la app no garantiza avisos en segundo plano.",
    },
    storage: {
      state: "ready",
      label: "Guardado persistente",
      detail:
        "Cuenta, compras, devoluciones y archivos guardados en PostgreSQL. Límite de cuenta: 100 MB y 500 documentos; copia de seguridad de la base de datos a cargo del despliegue.",
    },
  };
}
export function createAutomationRouter(db: Store = store): Router {
  const router = Router();
  router.use(createRequireAccount(db));
  router.use(createVerifyMutation(db));
  router.get(
    "/capabilities",
    route(async (_req, res) =>
      res.json(await capabilities(db, res.locals.account)),
    ),
  );
  router.post(
    "/imports",
    route(async (req, res) => {
      if (!(await db.limit(`imports:${res.locals.account.id}`, 30, 3600)))
        throw fail(
          "Demasiadas solicitudes de importación. Espera una hora.",
          429,
        );
      const text = limitedText(req.body?.text);
      const file = req.body?.file ? decodeFile(req.body.file).file : undefined;
      if (!text.trim() && !file)
        throw fail("Pega un correo o adjunta un archivo");
      const importId = await enqueue(db, res.locals.account, {
        text,
        file,
        kind: file?.mime || "text",
        title: file?.name || "Texto importado",
      });
      res.status(202).json({ importId });
      void processImport(db, importId).catch(() => {});
    }),
  );
  router.get(
    "/imports/:id",
    route(async (req, res) => {
      const result = await db.query(
        "SELECT * FROM dvy_import_jobs WHERE owner_id=$1 AND id=$2",
        [res.locals.account.id, req.params.id],
      );
      const row = result.rows[0];
      if (!row) throw fail("Importación no encontrada", 404);
      const saved = (await db.readState(res.locals.account.id)).imports.find(
        (i) => i.id === row.id,
      );
      res.json({
        import: saved?.status === "completed" ? saved : recordFor(row),
        candidates: json(row.candidates),
      });
    }),
  );
  router.post(
    "/imports/:id/retry",
    route(async (req, res) => {
      if (!(await db.limit(`retry:${res.locals.account.id}`, 10, 3600)))
        throw fail(
          "Has alcanzado el límite de reintentos. Espera una hora.",
          429,
        );
      const result = await db.query(
        "UPDATE dvy_import_jobs SET status='queued',attempts=0,payload=jsonb_set(payload,'{allowAI}','true'::jsonb),updated_at=now() WHERE owner_id=$1 AND id=$2 AND status IN('failed','needs_review') AND payload<>'{}'::jsonb RETURNING *",
        [res.locals.account.id, req.params.id],
      );
      if (!result.rows[0])
        throw fail(
          "Esta importación no puede reintentarse. Vuelve a adjuntar el documento.",
          409,
        );
      await db.mutateState(res.locals.account.id, (state) => {
        const current = state.imports.find((i) => i.id === req.params.id);
        if (current && current.status !== "completed") {
          current.status = "queued";
          current.message = "Esperando nueva lectura";
          current.updatedAt = new Date().toISOString();
        } else if (!current) state.imports.unshift(recordFor(result.rows[0]));
      });
      res.status(202).json({ importId: req.params.id });
      void processImport(db, String(req.params.id)).catch(() => {});
    }),
  );
  router.post(
    "/imports/:id/confirm",
    route(async (req, res) => {
      const owner = res.locals.account as Account;
      const id = String(req.params.id);
      const result = await db.query(
        "SELECT * FROM dvy_import_jobs WHERE owner_id=$1 AND id=$2",
        [owner.id, id],
      );
      const job = result.rows[0];
      if (!job) throw fail("Importación no encontrada", 404);
      if (!["needs_review", "completed"].includes(job.status))
        throw fail("Espera a que termine la lectura", 409);
      if (
        !Array.isArray(req.body?.purchases) ||
        !req.body.purchases.length ||
        req.body.purchases.length > 40
      )
        throw fail("Revisa entre 1 y 40 artículos antes de guardarlos");
      const purchases = req.body.purchases.map((p: unknown) =>
        validatePurchase(p),
      );
      let ids: string[] = [];
      const state = await db.mutateState(owner.id, (state) => {
        let record = state.imports.find((i) => i.id === id);
        if (record?.status === "completed") {
          ids = record.purchaseIds;
          return;
        }
        if (!record) {
          record = recordFor(job);
          state.imports.unshift(record);
        }
        for (const p of purchases) {
          const fingerprint = purchaseFingerprint(p);
          const old = fingerprint
            ? state.purchases.find(
                (x) => purchaseFingerprint(x) === fingerprint,
              )
            : undefined;
          if (old) ids.push(old.id);
          else {
            state.purchases.unshift(p);
            ids.push(p.id);
          }
        }
        record.status = "completed";
        record.purchaseIds = [...new Set(ids)];
        record.message = "Artículos revisados y guardados";
        record.updatedAt = new Date().toISOString();
      });
      const payload = json<{ documentId?: string }>(job.payload);
      if (payload.documentId && ids[0]) {
        const doc = await db.readDocument(owner.id, payload.documentId);
        if (doc)
          await db.putDocument(
            owner.id,
            { ...doc.meta, purchaseId: ids[0] },
            doc.bytes,
          );
      }
      await db.query(
        "UPDATE dvy_import_jobs SET status='completed',purchase_ids=$3::jsonb,payload=jsonb_build_object('documentId',payload->'documentId'),updated_at=now() WHERE owner_id=$1 AND id=$2",
        [owner.id, id, JSON.stringify(ids)],
      );
      res.json({ state: await db.readState(owner.id), purchaseIds: ids });
    }),
  );
  router.post(
    "/purchases/:id/resolve-link",
    route(async (req, res) => {
      if (!(await db.limit(`links:${res.locals.account.id}`, 30, 3600)))
        throw fail(
          "Has alcanzado el límite de búsquedas. Espera una hora.",
          429,
        );
      const owner = res.locals.account as Account;
      const p = (await db.readState(owner.id)).purchases.find(
        (p) => p.id === req.params.id,
      );
      if (!p) throw fail("Artículo no encontrado", 404);
      const m = identifyMerchant(p.store, p.country);
      if (m) {
        const jobs = await db.query(
          "SELECT links,created_at FROM dvy_import_jobs WHERE owner_id=$1 AND purchase_ids @> $2::jsonb ORDER BY created_at DESC LIMIT 5",
          [owner.id, JSON.stringify([p.id])],
        );
        for (const j of jobs.rows) {
          const link = json<{ url: string; host: string }[]>(j.links).find(
            (l) => m.hosts.includes(l.host),
          );
          if (link) {
            const response: LinkResult = {
              status: "needs_review",
              merchantId: m.id,
              url: link.url,
              host: link.host,
              kind: "portal",
              label: "Abrir enlace de tu correo",
              explanation:
                "Enlace de devolución extraído de un correo que revisaste, en un dominio oficial de la tienda. Puede ser personal o haber caducado. No se ha abierto automáticamente ni comprobado que autorice esta devolución; confirma el pedido antes de continuar.",
              checkedAt: null,
              sourceUrl: null,
              verified: false,
            };
            return res.json(response);
          }
        }
      }
      return res.json(await resolveReturnLink(p));
    }),
  );
  router.post(
    "/documents",
    route(async (req, res) => {
      const decoded = decodeFile(req.body);
      const meta: DocumentMeta = {
        id: randomUUID(),
        name: decoded.file.name,
        mime: decoded.file.mime,
        size: decoded.bytes.length,
        purchaseId:
          typeof req.body.purchaseId === "string" ? req.body.purchaseId : null,
        returnId:
          typeof req.body.returnId === "string" ? req.body.returnId : null,
        createdAt: new Date().toISOString(),
      };
      await db.putDocument(res.locals.account.id, meta, decoded.bytes);
      res.status(201).json(meta);
    }),
  );
  router.get(
    "/documents/:id/download",
    route(async (req, res) => {
      const doc = await db.readDocument(
        res.locals.account.id,
        String(req.params.id),
      );
      if (!doc) throw fail("Documento no encontrado", 404);
      res.setHeader("Content-Type", doc.meta.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(doc.meta.name).replace(/'/g, "%27")}`,
      );
      res.send(doc.bytes);
    }),
  );
  router.delete(
    "/documents/:id",
    route(async (req, res) => {
      await db.deleteDocument(res.locals.account.id, String(req.params.id));
      res.status(204).end();
    }),
  );
  return router;
}
function constantEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
export function createAutomationPublicRouter(db: Store = store): Router {
  const router = Router();
  router.post(
    "/internal/run-jobs",
    route(async (req, res) => {
      const token = process.env.CRON_SECRET;
      if (
        !token ||
        !constantEqual(req.headers.authorization || "", `Bearer ${token}`)
      )
        throw fail("No autorizado", 401);
      res.json(await runJobs(db));
    }),
  );
  router.post(
    "/webhooks/postmark",
    route(async (req, res) => {
      const user = process.env.POSTMARK_WEBHOOK_USER,
        password = process.env.POSTMARK_WEBHOOK_PASSWORD;
      if (
        !user ||
        !password ||
        !constantEqual(
          req.headers.authorization || "",
          `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
        )
      )
        throw fail("Webhook no autorizado", 403);
      const body = req.body;
      if (!body || typeof body !== "object") throw fail("Correo inválido");
      const recipients = [
        body.OriginalRecipient,
        ...(Array.isArray(body.ToFull)
          ? body.ToFull.map((x: any) => x?.Email)
          : []),
      ]
        .filter((x: unknown): x is string => typeof x === "string")
        .map((x: string) => x.trim().toLowerCase());
      const accounts = (await db.listAccounts()).filter(
        (a) =>
          a.inboundAddress &&
          recipients.includes(a.inboundAddress.toLowerCase()),
      );
      if (accounts.length !== 1) throw fail("Destinatario no autorizado", 403);
      const owner = accounts[0];
      const sender =
        typeof body.FromFull?.Email === "string"
          ? body.FromFull.Email.toLowerCase().trim()
          : "";
      if (!owner.verified || sender !== owner.email.toLowerCase())
        throw fail("Reenvía desde el email verificado de tu cuenta", 403);
      if (
        typeof body.MessageID !== "string" ||
        body.MessageID.length > 200 ||
        !body.MessageID
      )
        throw fail("Falta identificador de mensaje");
      const spam =
        Array.isArray(body.Headers) &&
        body.Headers.some(
          (h: any) =>
            String(h?.Name).toLowerCase() === "x-spam-status" &&
            /^yes/i.test(String(h.Value)),
        );
      if (spam) throw fail("Correo no autorizado", 403);
      const text = `${limitedText(body.Subject, 200)}\n${limitedText(body.TextBody) || stripHtml(limitedText(body.HtmlBody))}`;
      const fingerprint = createHash("sha256")
        .update(`${owner.id}\0${owner.inboundAddress}\0${body.MessageID}`)
        .digest("hex");
      // The authenticated webhook and opaque recipient alias determine the account.
      // FromFull is only a claimed-sender filter, not proof of SMTP authentication.
      // Inbound content never triggers paid AI until the signed-in owner requests it.
      // Email body, ReplyTo, order number and attachments never choose the account.
      const importId = await enqueue(db, owner, {
        text,
        kind: "email",
        html: limitedText(body.HtmlBody),
        title: limitedText(body.Subject, 160) || "Correo reenviado",
        fingerprint,
      });
      // Attachments remain untrusted. Explicit supported types only, with per-account quota.
      const attachments = Array.isArray(body.Attachments)
        ? body.Attachments.slice(0, 5)
        : [];
      for (const a of attachments) {
        try {
          const decoded = decodeFile({
            name: a.Name,
            mime: a.ContentType,
            base64: a.Content,
          });
          const attachmentKey = createHash("sha256")
            .update(`${fingerprint}\0${decoded.file.base64}`)
            .digest("hex");
          await enqueue(db, owner, {
            text: "",
            file: decoded.file,
            kind: "email-attachment",
            title: decoded.file.name,
            fingerprint: attachmentKey,
          });
        } catch {
          /* Unsupported files do not reject an otherwise valid message; original email stays with sender. */
        }
      }
      res.status(200).json({ received: true, importId });
    }),
  );
  return router;
}
