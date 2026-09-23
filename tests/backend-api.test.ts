import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Store } from "../artifacts/api-server/src/dvy/store";
import { createApp } from "../artifacts/api-server/src/app";
import { initializeAutomation } from "../artifacts/api-server/src/dvy/automation";

test("API real: sesión, aislamiento, persistencia, parciales, documentos y borrado", async (t) => {
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
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await postgres.close();
  });
  function browser() {
    const cookies = new Map<string, string>();
    let csrf = "";
    return {
      async call(
        path: string,
        method = "GET",
        body?: unknown,
        extras: Record<string, string> = {},
      ) {
        const response = await fetch(`${origin}/api${path}`, {
          method,
          headers: {
            Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
            Origin: origin,
            "X-CSRF-Token": csrf,
            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
            ...extras,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const value of response.headers.getSetCookie()) {
          const pair = value.split(";")[0],
            pos = pair.indexOf("=");
          cookies.set(pair.slice(0, pos), pair.slice(pos + 1));
        }
        const data = await response.json().catch(() => null);
        if (data?.csrfToken) csrf = data.csrfToken;
        return { status: response.status, data };
      },
    };
  }
  const a = browser(),
    b = browser();
  assert.equal((await a.call("/session")).status, 200);
  const registered = await a.call("/auth/register", "POST", {
    email: "a@example.test",
    name: "Prueba A",
    password: "CompraSegura-12345",
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  await a.call("/session");
  await b.call("/session");
  assert.equal(
    (
      await b.call("/auth/register", "POST", {
        email: "b@example.test",
        name: "Prueba B",
        password: "CompraSegura-12345",
      })
    ).status,
    201,
  );
  await b.call("/session");
  assert.equal(
    (
      await a.call(
        "/purchases",
        "POST",
        { title: "Ataque" },
        { "X-CSRF-Token": "incorrecto" },
      )
    ).status,
    403,
  );
  const purchaseBody = {
    title: "Tres camisetas",
    store: "Zara",
    orderNumber: "TEST-123",
    country: "ES",
    seller: "",
    currency: "EUR",
    priceMinor: 3000,
    quantity: 3,
    purchasedAt: "2026-09-10",
    deliveredAt: "2026-09-15",
    deadline: "2026-09-30",
    deadlineQuality: "manual",
    deadlineSource: "Ticket de prueba",
    notes: "",
  };
  const create = await a.call("/purchases", "POST", purchaseBody);
  assert.equal(create.status, 201, JSON.stringify(create.data));
  const getState = await a.call("/state");
  const purchase = getState.data.state.purchases[0];
  assert.equal(purchase.quantity, 3);
  assert.equal((await b.call("/state")).data.state.purchases.length, 0);
  assert.equal(
    (await b.call(`/purchases/${purchase.id}`, "PATCH", { title: "Ajeno" }))
      .status,
    404,
  );
  const prepare = await a.call("/returns", "POST", {
    items: [{ purchaseId: purchase.id, quantity: 1 }],
    outcome: "refund",
    currency: "EUR",
  });
  assert.equal(prepare.status, 201, JSON.stringify(prepare.data));
  const current = (await a.call("/state")).data.state;
  const returnCase = current.returns[0];
  assert.equal(
    returnCase.expectedMinor,
    1000,
    "La devolución de 1/3 del total 30 EUR espera 10 EUR",
  );
  assert.equal(
    (
      await a.call("/returns", "POST", {
        items: [{ purchaseId: purchase.id, quantity: 3 }],
        outcome: "refund",
        currency: "EUR",
      })
    ).status,
    409,
  );
  for (const status of ["requested", "authorized", "shipped", "received"]) {
    const result = await a.call(`/returns/${returnCase.id}/events`, "POST", {
      status,
      note: "Hito de prueba",
    });
    assert.equal(
      result.status,
      200,
      `${status}: ${JSON.stringify(result.data)}`,
    );
  }
  const issued = await a.call(`/returns/${returnCase.id}/refunds`, "POST", {
    amountMinor: 1000,
    currency: "EUR",
    kind: "issued",
    at: new Date().toISOString(),
  });
  assert.equal(issued.status, 201, JSON.stringify(issued.data));
  assert.notEqual(
    (await a.call("/state")).data.state.returns[0].status,
    "resolved",
  );
  const partial = await a.call(`/returns/${returnCase.id}/refunds`, "POST", {
    amountMinor: 400,
    currency: "EUR",
    kind: "received",
    at: new Date().toISOString(),
  });
  assert.equal(partial.status, 201, JSON.stringify(partial.data));
  assert.equal(
    (
      await a.call(`/returns/${returnCase.id}/events`, "POST", {
        status: "resolved",
        note: "",
      })
    ).status,
    409,
  );
  await a.call(`/returns/${returnCase.id}/refunds`, "POST", {
    amountMinor: 600,
    currency: "EUR",
    kind: "received",
    at: new Date().toISOString(),
  });
  const done = await a.call(`/returns/${returnCase.id}/events`, "POST", {
    status: "resolved",
    note: "Abono comprobado",
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const doc = await a.call("/documents", "POST", {
    name: "ticket.txt",
    mime: "text/plain",
    base64: Buffer.from("Ticket de prueba sin datos privados").toString(
      "base64",
    ),
    purchaseId: purchase.id,
  });
  assert.equal(doc.status, 201, JSON.stringify(doc.data));
  const document = (await a.call("/state")).data.state.documents[0];
  assert.equal(
    (await b.call(`/documents/${document.id}/download`)).status,
    404,
  );
  const exporting = await a.call("/export");
  assert.equal(exporting.status, 200);
  assert.equal((await a.call("/auth/logout", "POST")).status, 200);
  assert.equal((await a.call("/state")).status, 401);
  await a.call("/session");
  assert.equal(
    (
      await a.call("/auth/login", "POST", {
        email: "a@example.test",
        password: "CompraSegura-12345",
      })
    ).status,
    200,
  );
  await a.call("/session");
  assert.equal(
    (await a.call("/state")).data.state.purchases[0].id,
    purchase.id,
  );
  assert.equal(
    (await a.call("/account", "DELETE", { password: "CompraSegura-12345" }))
      .status,
    200,
  );
  assert.equal((await a.call("/state")).status, 401);
  assert.equal((await b.call("/state")).status, 200);
});
