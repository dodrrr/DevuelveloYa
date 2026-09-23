import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { DocumentMeta } from "../lib/domain/src/index.ts";
import {
  hashPassword,
  verifyPassword,
} from "../artifacts/api-server/src/dvy/auth.ts";
import {
  Store,
  hashToken,
  type QueryPool,
} from "../artifacts/api-server/src/dvy/store.ts";
import {
  validatePurchase,
  ValidationError,
} from "../artifacts/api-server/src/dvy/validation.ts";

// Exercise the production SQL and transaction code against PostgreSQL in process.
// No HTTP server, external database, or network connection is required.
const postgres = new PGlite();
const database: QueryPool = {
  async query(sql, values = []) {
    const result = await postgres.query(sql, values);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  },
};
const store = new Store(database);
before(async () => {
  await store.init();
});
after(async () => {
  await postgres.close();
});

async function account(
  label: string,
  passwordHash = "test-only-password-hash",
) {
  return store.createAccount(
    `${label}-${randomUUID()}@example.test`,
    label,
    passwordHash,
  );
}

function document(
  id: string,
  bytes: Buffer,
  name = "Comprobante.txt",
): DocumentMeta {
  return {
    id,
    name,
    mime: "text/plain",
    size: bytes.length,
    purchaseId: null,
    returnId: null,
    createdAt: new Date().toISOString(),
  };
}

test("password hashes have independent salts, verify correct passwords, and reject malformed hashes", async () => {
  const password = "Una contraseña de prueba 123";
  const [first, second] = await Promise.all([
    hashPassword(password),
    hashPassword(password),
  ]);
  assert.notEqual(first, second);
  assert.notEqual(first.split("$")[1], second.split("$")[1]);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password, second), true);
  assert.equal(
    await verifyPassword("Una contraseña diferente 123", first),
    false,
  );
  for (const malformed of [
    "",
    password,
    "scrypt-v1$bad$bad",
    "scrypt-v2$" + "0".repeat(32) + "$" + "0".repeat(128),
  ]) {
    assert.equal(await verifyPassword(password, malformed), false);
  }
});

test("sessions persist only the token hash and logout invalidates only the selected session", async () => {
  const owner = await account("sesiones");
  const [first, second] = await Promise.all([
    store.createSession(owner.id),
    store.createSession(owner.id),
  ]);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.token, first.csrfToken);
  const persisted = await store.query(
    "SELECT token_hash,csrf_token FROM dvy_sessions WHERE owner_id=$1",
    [owner.id],
  );
  assert.equal(persisted.rows.length, 2);
  assert.ok(
    persisted.rows.some((row) => row.token_hash === hashToken(first.token)),
  );
  assert.ok(
    persisted.rows.every(
      (row) =>
        row.token_hash !== first.token && row.token_hash !== second.token,
    ),
  );
  const session = await store.getSession(first.token);
  assert.equal(session?.account.id, owner.id);
  assert.equal(session?.csrfToken, first.csrfToken);
  assert.equal(await store.getSession("not-a-session-token"), null);
  await store.deleteSession(hashToken(first.token));
  assert.equal(await store.getSession(first.token), null);
  assert.equal((await store.getSession(second.token))?.account.id, owner.id);
  await store.query(
    "UPDATE dvy_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",
    [hashToken(second.token)],
  );
  assert.equal(await store.getSession(second.token), null);
});

test("concurrent state mutations preserve every purchase and monotonically increment revisions", async () => {
  const owner = await account("concurrencia");
  const purchases = Array.from({ length: 8 }, (_, index) =>
    validatePurchase({
      title: `Artículo ${index + 1}`,
      store: "Tienda",
      purchasedAt: "2026-03-01",
      quantity: 1,
      currency: "EUR",
      priceMinor: 1099,
    }),
  );
  const results = await Promise.all(
    purchases.map((purchase) =>
      store.mutateState(owner.id, async (state) => {
        // Yield inside the transaction to expose lost updates in an unsafe implementation.
        await Promise.resolve();
        state.purchases.push(purchase);
      }),
    ),
  );
  const saved = await store.readState(owner.id);
  assert.equal(saved.revision, purchases.length);
  assert.deepEqual(
    results.map((state) => state.revision).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    saved.purchases.map((purchase) => purchase.id).sort(),
    purchases.map((purchase) => purchase.id).sort(),
  );

  await assert.rejects(
    store.mutateState(owner.id, (state) => {
      state.purchases.length = 0;
      throw new ValidationError(400, "Prueba de reversión");
    }),
    ValidationError,
  );
  assert.deepEqual(await store.readState(owner.id), saved);
  await store.mutateState(owner.id, (state) => {
    state.purchases[0].notes = "La siguiente transacción sigue disponible";
  });
  assert.equal((await store.readState(owner.id)).revision, 9);
});

test("idempotency receipts prevent duplicate mutations and reject reuse with different input", async () => {
  const owner = await account("idempotencia");
  const purchase = validatePurchase({
    title: "Compra única",
    store: "Tienda",
    purchasedAt: "2026-03-01",
    quantity: 1,
    currency: "EUR",
    priceMinor: 1999,
  });
  const operation = {
    key: randomUUID(),
    fingerprint: hashToken("POST /purchases: compra única"),
  };
  let runs = 0;
  const apply = () =>
    store.mutateState(
      owner.id,
      (state) => {
        runs += 1;
        state.purchases.push(purchase);
      },
      operation,
    );
  const outcomes = await Promise.all([apply(), apply(), apply()]);
  assert.equal(runs, 1);
  assert.deepEqual(
    outcomes.map((state) => state.revision),
    [1, 1, 1],
  );
  assert.equal((await store.readState(owner.id)).purchases.length, 1);
  await assert.rejects(
    store.mutateState(
      owner.id,
      () => {
        runs += 1;
      },
      { ...operation, fingerprint: hashToken("different request") },
    ),
    (error: unknown) =>
      error instanceof ValidationError && error.status === 409,
  );
  assert.equal(runs, 1);
  assert.equal((await store.readState(owner.id)).revision, 1);

  const failed = {
    key: randomUUID(),
    fingerprint: hashToken("retryable failed request"),
  };
  await assert.rejects(
    store.mutateState(
      owner.id,
      (state) => {
        state.purchases.length = 0;
        throw new ValidationError(
          400,
          "No debe conservar el recibo de una operación fallida",
        );
      },
      failed,
    ),
    ValidationError,
  );
  const recovered = await store.mutateState(
    owner.id,
    (state) => {
      state.purchases[0].notes = "Reintento aplicado";
    },
    failed,
  );
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.purchases[0].notes, "Reintento aplicado");
  const receipts = await store.query(
    "SELECT COUNT(*)::integer AS count FROM dvy_operations WHERE owner_id=$1",
    [owner.id],
  );
  assert.equal(receipts.rows[0].count, 2);
});

test("document contents and metadata stay isolated by owner and survive a new Store instance", async () => {
  const [firstOwner, secondOwner] = await Promise.all([
    account("documentos-a"),
    account("documentos-b"),
  ]);
  const id = randomUUID();
  const firstBytes = Buffer.from("Factura privada de la cuenta A", "utf8");
  const secondBytes = Buffer.from("Factura privada de la cuenta B", "utf8");
  const firstMeta = document(id, firstBytes, "Factura-A.txt");
  const secondMeta = document(id, secondBytes, "Factura-B.txt");
  await store.putDocument(firstOwner.id, firstMeta, firstBytes);
  assert.equal(await store.readDocument(secondOwner.id, id), null);
  await store.putDocument(secondOwner.id, secondMeta, secondBytes);

  const reopened = new Store(database);
  await reopened.init();
  assert.deepEqual(await reopened.readDocument(firstOwner.id, id), {
    meta: firstMeta,
    bytes: firstBytes,
  });
  assert.deepEqual(await reopened.readDocument(secondOwner.id, id), {
    meta: secondMeta,
    bytes: secondBytes,
  });
  assert.deepEqual((await reopened.readState(firstOwner.id)).documents, [
    firstMeta,
  ]);
  assert.deepEqual((await reopened.readState(secondOwner.id)).documents, [
    secondMeta,
  ]);
  await reopened.deleteDocument(firstOwner.id, id);
  assert.equal(await reopened.readDocument(firstOwner.id, id), null);
  assert.deepEqual(await reopened.readDocument(secondOwner.id, id), {
    meta: secondMeta,
    bytes: secondBytes,
  });
});

test("reset tokens are hashed, replace older links, consume once, and revoke every session atomically", async () => {
  const oldHash = await hashPassword("Contraseña anterior 123");
  const newHash = await hashPassword("Contraseña renovada 456");
  const owner = await account("recuperacion", oldHash);
  const sessions = await Promise.all([
    store.createSession(owner.id),
    store.createSession(owner.id),
  ]);
  const oldToken = await store.issueAccountToken(owner.id, "reset");
  const currentToken = await store.issueAccountToken(owner.id, "reset");
  const persisted = await store.query(
    "SELECT token_hash,kind FROM dvy_account_tokens WHERE owner_id=$1",
    [owner.id],
  );
  assert.deepEqual(persisted.rows, [
    { token_hash: hashToken(currentToken), kind: "reset" },
  ]);
  assert.equal(
    await store.consumeAccountToken(oldToken, "reset", newHash),
    null,
  );
  assert.equal(await store.consumeAccountToken(currentToken, "verify"), null);

  const outcomes = await Promise.all([
    store.consumeAccountToken(currentToken, "reset", newHash),
    store.consumeAccountToken(currentToken, "reset", newHash),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(outcomes.find(Boolean)?.id, owner.id);
  assert.equal(
    await store.consumeAccountToken(currentToken, "reset", newHash),
    null,
  );
  for (const session of sessions)
    assert.equal(await store.getSession(session.token), null);
  const credentials = await store.credentials(owner.email);
  assert.equal(credentials?.passwordHash, newHash);
  assert.equal(
    await verifyPassword("Contraseña renovada 456", credentials!.passwordHash),
    true,
  );
  assert.equal(
    await verifyPassword("Contraseña anterior 123", credentials!.passwordHash),
    false,
  );
});

test("account deletion cascades to state, document bytes, sessions, and tokens without affecting other owners", async () => {
  const [owner, survivor] = await Promise.all([
    account("eliminar"),
    account("conservar"),
  ]);
  const id = randomUUID();
  const bytes = Buffer.from("Comprobante para probar eliminación", "utf8");
  const meta = document(id, bytes);
  await store.putDocument(owner.id, meta, bytes);
  await store.putDocument(survivor.id, meta, bytes);
  const session = await store.createSession(owner.id);
  await store.issueAccountToken(owner.id, "verify");
  await store.issueAccountToken(owner.id, "reset");
  await store.mutateState(owner.id, () => {}, {
    key: randomUUID(),
    fingerprint: hashToken("receipt-to-delete"),
  });
  await store.deleteAccount(owner.id);

  assert.equal(await store.getAccount(owner.id), null);
  assert.equal(await store.credentials(owner.email), null);
  assert.equal(await store.getSession(session.token), null);
  assert.equal(await store.readDocument(owner.id, id), null);
  await assert.rejects(
    store.readState(owner.id),
    (error: unknown) =>
      error instanceof ValidationError && error.status === 404,
  );
  for (const table of [
    "dvy_states",
    "dvy_documents",
    "dvy_sessions",
    "dvy_account_tokens",
    "dvy_operations",
  ]) {
    const remaining = await store.query(
      `SELECT COUNT(*)::integer AS count FROM ${table} WHERE owner_id=$1`,
      [owner.id],
    );
    assert.equal(remaining.rows[0].count, 0, `${table} retained account data`);
  }
  assert.equal((await store.getAccount(survivor.id))?.id, survivor.id);
  assert.deepEqual(await store.readDocument(survivor.id, id), { meta, bytes });
  assert.deepEqual((await store.readState(survivor.id)).documents, [meta]);
});

test("existing accounts gain one stable inbound alias when the receiving domain is configured later", async () => {
  const previousDomain = process.env.INBOUND_DOMAIN;
  try {
    delete process.env.INBOUND_DOMAIN;
    const owner = await account("late-domain");
    const session = await store.createSession(owner.id);
    assert.equal(owner.inboundAddress, null);
    process.env.INBOUND_DOMAIN = "Incoming.Example.test";
    const [first, second, authenticated] = await Promise.all([
      store.getAccount(owner.id),
      store.getAccount(owner.id),
      store.getSession(session.token),
    ]);
    assert.match(
      first!.inboundAddress!,
      /^dvy-[a-f0-9]{36}@incoming\.example\.test$/,
    );
    assert.equal(first!.inboundAddress, second!.inboundAddress);
    assert.equal(first!.inboundAddress, authenticated!.account.inboundAddress);
    assert.equal(
      first!.verified,
      false,
      "Provisioning an alias never verifies the account",
    );
    const local = first!.inboundAddress!.split("@")[0];
    process.env.INBOUND_DOMAIN = "new-domain.example.test";
    const changed = await store.getSession(session.token);
    assert.equal(
      changed!.account.inboundAddress,
      `${local}@new-domain.example.test`,
    );
    assert.equal(
      (await store.getAccountByEmail(owner.email))!.inboundAddress,
      changed!.account.inboundAddress,
    );
    process.env.INBOUND_DOMAIN = "https://invalid.example.test/path";
    assert.equal(
      (await store.getAccount(owner.id))!.inboundAddress,
      changed!.account.inboundAddress,
      "Invalid configuration cannot corrupt an existing alias",
    );
  } finally {
    if (previousDomain === undefined) delete process.env.INBOUND_DOMAIN;
    else process.env.INBOUND_DOMAIN = previousDomain;
  }
});
