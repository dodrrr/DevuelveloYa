import { Router } from "express";
import type {
  Account,
  Purchase,
  ReturnCase,
} from "../../../../lib/domain/src/index.js";
import { Store, store, hashToken } from "./store.js";
import {
  createRequireAccount,
  createVerifyMutation,
  verifyPassword,
} from "./auth.js";
import {
  applyRefund,
  applyStatusEvent,
  assertStateIntegrity,
  record,
  validatePurchase,
  validateReturn,
  validateReturnPatch,
  validateSettings,
  ValidationError,
} from "./validation.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function operationFor(
  body: unknown,
  route: string,
): { key: string; fingerprint: string } | undefined {
  const input = record(body);
  if (input.operationId === undefined) return undefined;
  if (
    typeof input.operationId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      input.operationId,
    )
  )
    throw new ValidationError(400, "Identificador de operación inválido.");
  return {
    key: input.operationId,
    fingerprint: hashToken(stableJson({ route, input })),
  };
}

export function createCoreRouter(db: Store = store): Router {
  const router = Router();
  router.use(createRequireAccount(db), createVerifyMutation(db));
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/state", async (_req, res) => {
    const account = res.locals.account as Account;
    res.json({ account, state: await db.readState(account.id) });
  });
  router.post("/purchases", async (req, res) => {
    const account = res.locals.account as Account;
    const input = { ...record(req.body) };
    if (input.country === undefined) input.country = account.settings.country;
    const purchase = validatePurchase(input);
    const operation = operationFor(req.body, "purchase:create");
    if (operation) purchase.id = operation.key;
    const state = await db.mutateState(
      account.id,
      (current) => {
        if (current.purchases.length >= 10_000)
          throw new ValidationError(
            413,
            "Esta cuenta ha alcanzado el límite de 10.000 artículos.",
          );
        current.purchases.push(purchase);
      },
      operation,
    );
    res
      .status(201)
      .json({
        state,
        purchase: state.purchases.find((p) => p.id === purchase.id) ?? null,
      });
  });
  router.patch("/purchases/:id", async (req, res) => {
    let purchase: Purchase | undefined;
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        const index = current.purchases.findIndex(
          (p) => p.id === req.params.id,
        );
        if (index < 0)
          throw new ValidationError(404, "El artículo ya no existe.");
        const previous = current.purchases[index];
        purchase = validatePurchase(req.body, previous);
        const linked = current.returns.some((r) =>
          r.items.some((i) => i.purchaseId === previous.id),
        );
        if (
          linked &&
          [
            "store",
            "merchantId",
            "orderNumber",
            "currency",
            "country",
            "seller",
            "quantity",
            "priceMinor",
          ].some(
            (key) =>
              purchase![key as keyof Purchase] !==
              previous[key as keyof Purchase],
          )
        )
          throw new ValidationError(
            409,
            "Este artículo ya tiene devoluciones. Los datos del pedido, las unidades y el importe deben conservarse para mantener su historial.",
          );
        current.purchases[index] = purchase;
        assertStateIntegrity(current);
      },
    );
    res.json({ state, purchase });
  });
  router.delete("/purchases/:id", async (req, res) => {
    const id = String(req.params.id);
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        if (!current.purchases.some((p) => p.id === id))
          throw new ValidationError(404, "El artículo ya no existe.");
        if (
          current.returns.some((r) => r.items.some((i) => i.purchaseId === id))
        )
          throw new ValidationError(
            409,
            "Este artículo tiene historial de devoluciones. Puedes archivarlo para ocultarlo sin perder su historial.",
          );
        if (current.documents.some((d) => d.purchaseId === id))
          throw new ValidationError(
            409,
            "Elimina primero los documentos del artículo o archívalo para conservarlos.",
          );
        current.purchases = current.purchases.filter((p) => p.id !== id);
        current.notifications = current.notifications.filter(
          (n) => n.purchaseId !== id,
        );
        current.imports.forEach((i) => {
          i.purchaseIds = i.purchaseIds.filter((p) => p !== id);
        });
      },
    );
    res.json({ state });
  });
  router.post("/returns", async (req, res) => {
    let returnCase: ReturnCase | undefined;
    const operation = operationFor(req.body, "return:create");
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        if (current.returns.length >= 10_000)
          throw new ValidationError(
            413,
            "Esta cuenta ha alcanzado el límite de 10.000 devoluciones.",
          );
        returnCase = validateReturn(req.body, current);
        if (operation) returnCase.id = operation.key;
        current.returns.unshift(returnCase);
      },
      operation,
    );
    res
      .status(201)
      .json({
        state,
        returnCase:
          returnCase ??
          state.returns.find((r) => r.id === operation?.key) ??
          null,
      });
  });
  router.patch("/returns/:id", async (req, res) => {
    let returnCase: ReturnCase | undefined;
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        const index = current.returns.findIndex((r) => r.id === req.params.id);
        if (index < 0)
          throw new ValidationError(404, "La devolución ya no existe.");
        const input = record(req.body);
        if (
          input.items !== undefined ||
          input.status !== undefined ||
          input.refunds !== undefined
        )
          throw new ValidationError(
            400,
            "Registra el estado y los reembolsos desde sus acciones. Los artículos de una devolución creada no se pueden sustituir.",
          );
        returnCase = validateReturnPatch(input, current.returns[index]);
        current.returns[index] = returnCase;
      },
    );
    res.json({ state, returnCase });
  });
  router.post("/returns/:id/events", async (req, res) => {
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        const target = current.returns.find((r) => r.id === req.params.id);
        if (target && target.events.length >= 1000)
          throw new ValidationError(
            413,
            "Esta devolución ha alcanzado el límite de 1.000 eventos.",
          );
        applyStatusEvent(current, String(req.params.id), req.body);
      },
    );
    res.json({ state });
  });
  router.post("/returns/:id/refunds", async (req, res) => {
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        const target = current.returns.find((r) => r.id === req.params.id);
        if (target && target.refunds.length >= 1000)
          throw new ValidationError(
            413,
            "Esta devolución ha alcanzado el límite de 1.000 movimientos.",
          );
        applyRefund(current, String(req.params.id), req.body);
      },
    );
    res.status(201).json({ state });
  });
  router.patch("/settings", async (req, res) => {
    const account = await db.mutateSettings(
      (res.locals.account as Account).id,
      (previous) => validateSettings(req.body, previous),
    );
    res.json({ account, state: await db.readState(account.id) });
  });
  router.post("/notifications/:id/read", async (req, res) => {
    const id = String(req.params.id);
    const state = await db.mutateState(
      (res.locals.account as Account).id,
      (current) => {
        if (id !== "all" && !current.notifications.some((n) => n.id === id))
          throw new ValidationError(404, "El aviso ya no existe.");
        current.notifications.forEach((n) => {
          if (id === "all" || n.id === id) n.read = true;
        });
      },
    );
    res.json({ state });
  });
  router.get("/export", async (_req, res) => {
    const account = res.locals.account as Account;
    res.set(
      "Content-Disposition",
      'attachment; filename="devuelveloya-datos.json"',
    );
    res.json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      account,
      state: await db.readState(account.id),
      documentsNote:
        "Incluye los metadatos de documentos. Los archivos originales se descargan individualmente desde Documentos mientras la cuenta esté activa.",
    });
  });
  router.delete("/account", async (req, res) => {
    const account = res.locals.account as Account;
    if (!(await db.limit(`delete-account:${account.id}`, 5, 900)))
      throw new ValidationError(429, "Demasiados intentos. Espera 15 minutos.");
    const password = record(req.body).password;
    const credentials = await db.credentials(account.email);
    if (
      typeof password !== "string" ||
      Buffer.byteLength(password) > 128 ||
      !credentials ||
      !(await verifyPassword(password, credentials.passwordHash))
    )
      throw new ValidationError(
        401,
        "Confirma tu contraseña para eliminar la cuenta.",
      );
    await db.deleteAccount(account.id);
    res.clearCookie("dvy_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure || process.env.NODE_ENV === "production",
    });
    res.json({ deleted: true });
  });
  return router;
}
export const coreRouter = createCoreRouter();
