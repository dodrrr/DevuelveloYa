import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import {
  Router,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { Account } from "../../../../lib/domain/src/index.js";
import { Store, store, hashToken, type SessionRecord } from "./store.js";
import { record, text, ValidationError } from "./validation.js";

const SESSION_COOKIE = "dvy_session";
const ANON_CSRF_COOKIE = "dvy_anon_csrf";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const hash = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const result = await hash(password, salt);
  return `scrypt-v1$${salt.toString("hex")}$${result.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const pieces = encoded.split("$");
  if (
    pieces.length !== 3 ||
    pieces[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(pieces[1]) ||
    !/^[a-f0-9]{128}$/.test(pieces[2])
  )
    return false;
  const actual = await hash(password, Buffer.from(pieces[1], "hex"));
  return timingSafeEqual(actual, Buffer.from(pieces[2], "hex"));
}
const dummyPasswordHash = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
export function validatePassword(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value, "utf8") > 128
  )
    throw new ValidationError(
      400,
      "La contraseña debe tener al menos 12 caracteres y como máximo 128 bytes.",
    );
  return value;
}
export function normalizeEmail(value: unknown): string {
  const email = text(value, "Email", 254).toLowerCase();
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    ) ||
    email.split("@")[0].length > 64
  )
    throw new ValidationError(400, "Introduce un email válido.");
  return email;
}
function cookie(req: Request, name: string): string | undefined {
  const header = req.get("cookie");
  if (!header) return undefined;
  const values = header
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  try {
    return decodeURIComponent(values[0].slice(name.length + 1));
  } catch {
    return undefined;
  }
}
function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function checkOrigin(req: Request): void {
  let expected: string;
  try {
    expected = new URL(
      process.env.APP_URL || `${req.protocol}://${req.get("host")}`,
    ).origin;
  } catch {
    throw new ValidationError(
      503,
      "Falta configurar el origen seguro de la aplicación.",
    );
  }
  const origin = req.get("origin");
  if (
    !origin ||
    origin !== expected ||
    req.get("sec-fetch-site") === "cross-site"
  )
    throw new ValidationError(
      403,
      "El origen de la solicitud no es válido. Recarga la aplicación.",
    );
}
export function createRequireAccount(db: Store = store): RequestHandler {
  return async (req, res, next) => {
    const token = cookie(req, SESSION_COOKIE);
    const session = token ? await db.getSession(token) : null;
    if (!session) {
      res
        .status(401)
        .json({ error: "Tu sesión ha caducado. Inicia sesión de nuevo." });
      return;
    }
    res.locals.account = session.account;
    res.locals.session = session;
    next();
  };
}
export function createVerifyMutation(db: Store = store): RequestHandler {
  return async (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    checkOrigin(req);
    let session = res.locals.session as SessionRecord | undefined;
    if (!session) {
      const token = cookie(req, SESSION_COOKIE);
      session = (token ? await db.getSession(token) : null) ?? undefined;
      if (session) {
        res.locals.session = session;
        res.locals.account = session.account;
      }
    }
    const expected = session?.csrfToken ?? cookie(req, ANON_CSRF_COOKIE);
    const supplied = req.get("x-csrf-token");
    if (
      !expected ||
      !supplied ||
      !TOKEN_RE.test(expected) ||
      !sameSecret(expected, supplied)
    )
      throw new ValidationError(
        403,
        "La sesión de seguridad ha cambiado. Recarga la aplicación e inténtalo de nuevo.",
      );
    next();
  };
}
export const requireAccount = createRequireAccount();
export const verifyMutation = createVerifyMutation();
export type EmailDelivery = (
  account: Account,
  kind: "verify" | "reset",
  token: string,
) => Promise<void>;
let emailDelivery: EmailDelivery | null = null;
export function setEmailDelivery(delivery: EmailDelivery | null): void {
  emailDelivery = delivery;
}
async function throttle(
  db: Store,
  req: Request,
  scope: string,
  identity?: string,
): Promise<void> {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const ipAllowed = await db.limit(`auth:${scope}:ip:${ip}`, 60, 15 * 60);
  const identityAllowed = identity
    ? await db.limit(`auth:${scope}:identity:${identity}`, 10, 15 * 60)
    : true;
  if (!ipAllowed || !identityAllowed)
    throw new ValidationError(
      429,
      "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.",
    );
}
async function startSession(
  db: Store,
  req: Request,
  res: Response,
  account: Account,
): Promise<void> {
  const oldToken = cookie(req, SESSION_COOKIE);
  if (oldToken && TOKEN_RE.test(oldToken))
    await db.deleteSession(hashToken(oldToken));
  const session = await db.createSession(account.id);
  res.cookie(SESSION_COOKIE, session.token, {
    ...cookieOptions(req),
    expires: session.expiresAt,
  });
  res.clearCookie(ANON_CSRF_COOKIE, cookieOptions(req));
  res.json({ account, csrfToken: session.csrfToken });
}
export function createAuthRouter(db: Store = store): Router {
  const router = Router();
  const authenticated = createRequireAccount(db);
  const protect = createVerifyMutation(db);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/session", async (req, res) => {
    const token = cookie(req, SESSION_COOKIE);
    const session = token ? await db.getSession(token) : null;
    if (session) {
      res.json({ account: session.account, csrfToken: session.csrfToken });
      return;
    }
    if (token) res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    const existing = cookie(req, ANON_CSRF_COOKIE);
    const csrfToken =
      existing && TOKEN_RE.test(existing)
        ? existing
        : randomBytes(32).toString("base64url");
    res.cookie(ANON_CSRF_COOKIE, csrfToken, {
      ...cookieOptions(req),
      maxAge: 24 * 3600000,
    });
    res.json({ account: null, csrfToken });
  });
  router.post("/auth/register", protect, async (req, res) => {
    const input = record(req.body);
    const email = normalizeEmail(input.email);
    await throttle(db, req, "register", email);
    const name = text(input.name, "Nombre", 80);
    if (!name)
      throw new ValidationError(400, "Indica cómo quieres que te llamemos.");
    const password = validatePassword(input.password);
    const passwordHash = await hashPassword(password);
    let account: Account;
    try {
      account = await db.createAccount(email, name, passwordHash);
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ValidationError(
          409,
          "No se puede crear la cuenta con este email. Prueba a iniciar sesión o recupera tu contraseña.",
        );
      throw error;
    }
    res.status(201);
    await startSession(db, req, res, account);
  });
  router.post("/auth/login", protect, async (req, res) => {
    const input = record(req.body);
    const email = normalizeEmail(input.email);
    await throttle(db, req, "login", email);
    if (
      typeof input.password !== "string" ||
      Buffer.byteLength(input.password) > 128
    )
      throw new ValidationError(401, "Email o contraseña incorrectos.");
    const found = await db.credentials(email);
    const valid = await verifyPassword(
      input.password,
      found?.passwordHash ?? dummyPasswordHash,
    );
    if (!found || !valid)
      throw new ValidationError(401, "Email o contraseña incorrectos.");
    await startSession(db, req, res, found.account);
  });
  router.post("/auth/logout", authenticated, protect, async (req, res) => {
    await db.deleteSession((res.locals.session as SessionRecord).tokenHash);
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    const csrfToken = randomBytes(32).toString("base64url");
    res.cookie(ANON_CSRF_COOKIE, csrfToken, {
      ...cookieOptions(req),
      maxAge: 24 * 3600000,
    });
    res.json({ account: null, csrfToken });
  });
  router.post(
    ["/auth/verification/request", "/auth/send-verification"],
    authenticated,
    protect,
    async (_req, res) => {
      const account = res.locals.account as Account;
      if (account.verified) {
        res.json({ sent: false, verified: true });
        return;
      }
      if (!emailDelivery)
        throw new ValidationError(
          503,
          "El envío de emails aún no está configurado.",
        );
      if (!(await db.limit(`verify:${account.id}`, 5, 3600)))
        throw new ValidationError(
          429,
          "Ya has solicitado varios enlaces. Espera una hora.",
        );
      const token = await db.issueAccountToken(account.id, "verify");
      await emailDelivery(account, "verify", token);
      res.json({
        sent: true,
        message:
          "Te hemos enviado un enlace de verificación. Caduca en 24 horas.",
      });
    },
  );
  router.post(
    ["/auth/verify", "/auth/verify-email"],
    protect,
    async (req, res) => {
      await throttle(db, req, "verify-token");
      const token = text(record(req.body).token, "Enlace", 100);
      const account = await db.consumeAccountToken(token, "verify");
      if (!account)
        throw new ValidationError(
          400,
          "El enlace de verificación no es válido o ha caducado.",
        );
      // Verification proves ownership but never signs in another account implicitly.
      const current = res.locals.account as Account | undefined;
      res.json({
        verified: true,
        account: current?.id === account.id ? account : null,
      });
    },
  );
  router.post("/auth/password/forgot", protect, async (req, res) => {
    const email = normalizeEmail(record(req.body).email);
    await throttle(db, req, "forgot", email);
    if (!emailDelivery)
      throw new ValidationError(
        503,
        "La recuperación por email aún no está configurada.",
      );
    const account = await db.getAccountByEmail(email);
    if (account) {
      const token = await db.issueAccountToken(account.id, "reset");
      try {
        await emailDelivery(account, "reset", token);
      } catch {
        /* Keep the outward response identical for registered and unknown addresses. */
      }
    }
    res.json({
      message:
        "Si existe una cuenta con ese email, recibirás un enlace para recuperar el acceso.",
    });
  });
  router.post("/auth/password/reset", protect, async (req, res) => {
    await throttle(db, req, "reset-token");
    const input = record(req.body);
    const token = text(input.token, "Enlace", 100);
    const passwordHash = await hashPassword(validatePassword(input.password));
    const account = await db.consumeAccountToken(token, "reset", passwordHash);
    if (!account)
      throw new ValidationError(
        400,
        "El enlace de recuperación no es válido o ha caducado.",
      );
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    const csrfToken = randomBytes(32).toString("base64url");
    res.cookie(ANON_CSRF_COOKIE, csrfToken, {
      ...cookieOptions(req),
      maxAge: 24 * 3600000,
    });
    res.json({
      account: null,
      csrfToken,
      message:
        "Contraseña actualizada. Inicia sesión de nuevo en tus dispositivos.",
    });
  });
  return router;
}
export const authRouter = createAuthRouter();
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  const err = error as {
    status?: number;
    message?: string;
    type?: string;
    code?: string;
  };
  const status =
    error instanceof ValidationError
      ? error.status
      : err.type === "entity.too.large"
        ? 413
        : err.type === "entity.parse.failed"
          ? 400
          : 500;
  if (status >= 500)
    req.log?.error(
      { errorName: error?.name, errorCode: err.code },
      "API request failed",
    );
  res
    .status(status)
    .json({
      error:
        status === 500
          ? "No se ha podido completar la operación. Tus datos guardados siguen disponibles; inténtalo de nuevo."
          : status === 413
            ? "El archivo o solicitud supera el tamaño permitido."
            : status === 400 && err.type === "entity.parse.failed"
              ? "El formato de la solicitud no es válido."
              : err.message,
    });
};
