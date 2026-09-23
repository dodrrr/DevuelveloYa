import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { Store } from "../artifacts/api-server/src/dvy/store";
import { createApp } from "../artifacts/api-server/src/app";
import { initializeAutomation } from "../artifacts/api-server/src/dvy/automation";

test("HTTP mutations preserve purchase, return and payment identity across concurrent retries", async (t) => {
  const postgres = new PGlite();
  const database = new Store({
    query: async (sql, values) => {
      const result = await postgres.query(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows };
    },
  });
  await database.init();
  await initializeAutomation(database);
  const server = createApp(database).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await postgres.close();
  });
  const cookies = new Map<string, string>();
  let csrf = "";
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Cookie: [...cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        Origin: origin,
        "X-CSRF-Token": csrf,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        position = pair.indexOf("=");
      cookies.set(pair.slice(0, position), pair.slice(position + 1));
    }
    const data = await response.json();
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: response.status, data };
  }
  await call("/session");
  const registered = await call("/auth/register", "POST", {
    name: "Idempotencia",
    email: "idempotencia@example.test",
    password: "Reintento-seguro-12345",
  });
  assert.equal(registered.status, 201);
  const purchaseBody = {
    operationId: randomUUID(),
    title: "Tres unidades",
    store: "Tienda",
    country: "ES",
    currency: "EUR",
    quantity: 3,
    priceMinor: 100,
    purchasedAt: "2026-09-01",
    orderNumber: "IDEMPOTENT-ORDER",
  };
  await t.test(
    "concurrent purchase retries return one stable object and revision",
    async () => {
      const [first, second] = await Promise.all([
        call("/purchases", "POST", purchaseBody),
        call("/purchases", "POST", purchaseBody),
      ]);
      assert.equal(first.status, 201, JSON.stringify(first.data));
      assert.equal(second.status, 201, JSON.stringify(second.data));
      assert.equal(first.data.purchase.id, purchaseBody.operationId);
      assert.equal(second.data.purchase.id, first.data.purchase.id);
      assert.equal(first.data.state.revision, second.data.state.revision);
      assert.equal((await call("/state")).data.state.purchases.length, 1);
      assert.equal(
        (await call("/purchases", "POST", { ...purchaseBody, priceMinor: 101 }))
          .status,
        409,
      );
      assert.equal(
        (await call("/state")).data.state.purchases[0].priceMinor,
        100,
      );
    },
  );
  const returnBody = {
    operationId: randomUUID(),
    items: [{ purchaseId: purchaseBody.operationId, quantity: 1 }],
    outcome: "refund",
    currency: "EUR",
  };
  await t.test(
    "concurrent return retries reserve units once and refuse different quantities",
    async () => {
      const [first, second] = await Promise.all([
        call("/returns", "POST", returnBody),
        call("/returns", "POST", returnBody),
      ]);
      assert.equal(first.status, 201, JSON.stringify(first.data));
      assert.equal(second.status, 201, JSON.stringify(second.data));
      assert.equal(first.data.returnCase.id, returnBody.operationId);
      assert.equal(second.data.returnCase.id, first.data.returnCase.id);
      assert.equal(first.data.state.revision, second.data.state.revision);
      assert.equal(first.data.returnCase.expectedMinor, 33);
      assert.equal((await call("/state")).data.state.returns.length, 1);
      assert.equal(
        (
          await call("/returns", "POST", {
            ...returnBody,
            items: [{ purchaseId: purchaseBody.operationId, quantity: 2 }],
          })
        ).status,
        409,
      );
      assert.equal(
        (await call("/state")).data.state.returns[0].items[0].quantity,
        1,
      );
    },
  );
  await t.test(
    "concurrent payment retries cannot duplicate money or reuse an id for a different payment",
    async () => {
      const refundBody = {
        operationId: randomUUID(),
        amountMinor: 33,
        currency: "EUR",
        kind: "received",
      };
      const path = `/returns/${returnBody.operationId}/refunds`;
      const [first, second] = await Promise.all([
        call(path, "POST", refundBody),
        call(path, "POST", refundBody),
      ]);
      assert.equal(first.status, 201, JSON.stringify(first.data));
      assert.equal(second.status, 201, JSON.stringify(second.data));
      assert.equal(
        (await call("/state")).data.state.returns[0].refunds.length,
        1,
      );
      assert.equal(
        (await call(path, "POST", { ...refundBody, amountMinor: 34 })).status,
        409,
      );
      const refund = (await call("/state")).data.state.returns[0].refunds;
      assert.deepEqual(
        refund.map((r: { id: string; amountMinor: number }) => ({
          id: r.id,
          amountMinor: r.amountMinor,
        })),
        [{ id: refundBody.operationId, amountMinor: 33 }],
      );
    },
  );
  await t.test(
    "a transaction key cannot be moved from a purchase to a return",
    async () => {
      const result = await call("/returns", "POST", {
        ...returnBody,
        operationId: purchaseBody.operationId,
      });
      assert.equal(result.status, 409);
      assert.equal((await call("/state")).data.state.returns.length, 1);
    },
  );
});
