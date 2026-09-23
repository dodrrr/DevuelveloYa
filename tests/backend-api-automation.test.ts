import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Purchase } from "../lib/domain/src/index.ts";
import { createApp } from "../artifacts/api-server/src/app.ts";
import {
  initializeAutomation,
  runJobs,
} from "../artifacts/api-server/src/dvy/automation.ts";
import { Store } from "../artifacts/api-server/src/dvy/store.ts";

test("API automation: reviewed imports, attached originals, isolation, and honest capabilities", async (t) => {
  // These flows must remain usable without paid providers or remote requests.
  for (const key of [
    "OPENAI_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "POSTMARK_SERVER_TOKEN",
    "POSTMARK_WEBHOOK_USER",
    "POSTMARK_WEBHOOK_PASSWORD",
    "CRON_SECRET",
    "APP_URL",
  ]) {
    assert.ok(!process.env[key], `Run this test with ${key} unset`);
  }
  const postgres = new PGlite();
  const database = new Store({
    async query(sql, values) {
      const result = await postgres.query(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows };
    },
  });
  await database.init();
  await initializeAutomation(database);
  const server = createApp(database).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await postgres.close();
  });

  const localFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(
    globalThis,
    "fetch",
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(
        url.origin,
        origin,
        "These API tests must never call an external provider",
      );
      return localFetch(input, init);
    },
  );

  function browser() {
    const cookies = new Map<string, string>();
    let csrf = "";
    return {
      async call(path: string, method = "GET", body?: unknown) {
        const response = await fetch(`${origin}/api${path}`, {
          method,
          headers: {
            Cookie: [...cookies]
              .map(([key, value]) => `${key}=${value}`)
              .join("; "),
            Origin: origin,
            "X-CSRF-Token": csrf,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const value of response.headers.getSetCookie()) {
          const pair = value.split(";")[0];
          const index = pair.indexOf("=");
          cookies.set(pair.slice(0, index), pair.slice(index + 1));
        }
        const responseText = await response.text();
        const data =
          response.headers.get("content-type")?.includes("application/json") &&
          responseText
            ? JSON.parse(responseText)
            : null;
        if (data?.csrfToken) csrf = data.csrfToken;
        return {
          status: response.status,
          data,
          text: responseText,
          headers: response.headers,
        };
      },
    };
  }
  const owner = browser();
  const stranger = browser();
  for (const [client, email] of [
    [owner, "automation-owner@example.test"],
    [stranger, "automation-stranger@example.test"],
  ] as const) {
    assert.equal((await client.call("/session")).status, 200);
    const registration = await client.call("/auth/register", "POST", {
      email,
      name: "Prueba de importación",
      password: "CompraSegura-12345",
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.data));
  }

  async function reviewedImport(importId: string) {
    await runJobs(database);
    for (let tick = 0; tick < 20; tick += 1) {
      const current = await owner.call(`/imports/${importId}`);
      assert.equal(current.status, 200, JSON.stringify(current.data));
      if (current.data.import.status === "needs_review") return current.data;
      assert.notEqual(
        current.data.import.status,
        "failed",
        current.data.import.message,
      );
    }
    assert.fail(
      "Local extraction did not reach needs_review after 20 request ticks",
    );
  }

  await t.test(
    "missing providers are disclosed and sensitive jobs remain protected",
    async () => {
      const response = await owner.call("/capabilities");
      assert.equal(response.status, 200);
      assert.equal(response.data.emailInbound.state, "not_configured");
      assert.equal(response.data.emailReminders.state, "not_configured");
      assert.equal(response.data.extraction.state, "degraded");
      assert.equal(response.data.search.state, "degraded");
      assert.equal(response.data.scheduler.state, "not_configured");
      assert.equal(response.data.storage.state, "ready");
      assert.match(response.data.extraction.detail, /texto|text/i);
      assert.match(response.data.extraction.detail, /OPENAI_API_KEY/);
      assert.equal((await browser().call("/capabilities")).status, 401);
      assert.equal(
        (await browser().call("/internal/run-jobs", "POST")).status,
        401,
      );
      assert.equal(
        (
          await owner.call("/auth/password/forgot", "POST", {
            email: "automation-owner@example.test",
          })
        ).status,
        503,
      );
    },
  );

  await t.test(
    "text requires correction and confirmation; repeated confirmation never duplicates purchases",
    async () => {
      const text =
        "Tienda: Zara\nPedido: API-TXT-2026\nArtículo: Jersey azul\nTotal: 39,95 EUR\n";
      const submitted = await owner.call("/imports", "POST", { text });
      assert.equal(submitted.status, 202, JSON.stringify(submitted.data));
      const importId = submitted.data.importId;
      assert.equal((await stranger.call(`/imports/${importId}`)).status, 404);
      const review = await reviewedImport(importId);
      assert.equal(review.candidates.length, 1);
      assert.equal(review.candidates[0].purchasedAt, "");
      assert.equal(review.candidates[0].deadline, null);
      assert.equal(review.candidates[0].priceMinor, 3995);
      assert.equal((await owner.call("/state")).data.state.purchases.length, 0);
      assert.equal(
        (
          await owner.call(`/imports/${importId}/confirm`, "POST", {
            purchases: review.candidates,
          })
        ).status,
        400,
      );
      const purchases: Partial<Purchase>[] = review.candidates.map(
        (candidate: Partial<Purchase>) => ({
          ...candidate,
          purchasedAt: "2026-03-01",
        }),
      );
      assert.equal(
        (
          await stranger.call(`/imports/${importId}/confirm`, "POST", {
            purchases,
          })
        ).status,
        404,
      );

      const confirmation = await owner.call(
        `/imports/${importId}/confirm`,
        "POST",
        { purchases },
      );
      assert.equal(confirmation.status, 200, JSON.stringify(confirmation.data));
      assert.equal(confirmation.data.purchaseIds.length, 1);
      const replay = await owner.call(`/imports/${importId}/confirm`, "POST", {
        purchases,
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.data));
      assert.deepEqual(replay.data.purchaseIds, confirmation.data.purchaseIds);
      const current = await owner.call("/state");
      assert.equal(current.data.state.purchases.length, 1);
      assert.equal(current.data.state.purchases[0].purchasedAt, "2026-03-01");
      assert.equal(
        (await owner.call(`/imports/${importId}`)).data.import.status,
        "completed",
      );
      const resubmitted = await owner.call("/imports", "POST", { text });
      assert.equal(resubmitted.status, 202);
      assert.equal(resubmitted.data.importId, importId);
      const capabilities = await owner.call("/capabilities");
      assert.equal(capabilities.data.scheduler.state, "ready");
      assert.match(capabilities.data.scheduler.detail, /última ejecución/i);
      assert.equal(capabilities.data.emailReminders.state, "not_configured");
    },
  );

  await t.test(
    "a TXT original is attached to the first reviewed item and remains private",
    async () => {
      const receipt =
        "Tienda: Zara\nPedido: API-FILE-2026\nFecha de compra: 2026-03-05\nArtículo: Camiseta blanca\nArtículo: Calcetines\nTotal: 25,00 EUR\n";
      const submitted = await owner.call("/imports", "POST", {
        file: {
          name: "ticket-original.txt",
          mime: "text/plain",
          base64: Buffer.from(receipt).toString("base64"),
        },
      });
      assert.equal(submitted.status, 202, JSON.stringify(submitted.data));
      const importId = submitted.data.importId;
      const review = await reviewedImport(importId);
      assert.equal(review.candidates.length, 1);
      assert.equal(review.candidates[0].purchasedAt, "2026-03-05");
      const before = (await owner.call("/state")).data.state;
      assert.equal(before.documents.length, 1);
      assert.equal(before.documents[0].purchaseId, null);
      const documentId = before.documents[0].id;
      assert.equal((await stranger.call(`/imports/${importId}`)).status, 404);
      assert.equal(
        (await stranger.call(`/documents/${documentId}/download`)).status,
        404,
      );
      const purchases = [
        { ...review.candidates[0], title: "Camiseta blanca", priceMinor: 1500 },
        { ...review.candidates[0], title: "Calcetines", priceMinor: 1000 },
      ];
      const confirmation = await owner.call(
        `/imports/${importId}/confirm`,
        "POST",
        { purchases },
      );
      assert.equal(confirmation.status, 200, JSON.stringify(confirmation.data));
      assert.equal(confirmation.data.purchaseIds.length, 2);
      const saved = (await owner.call("/state")).data.state;
      assert.equal(saved.purchases.length, 3);
      assert.equal(saved.documents[0].id, documentId);
      assert.equal(
        saved.documents[0].purchaseId,
        confirmation.data.purchaseIds[0],
      );
      assert.equal(
        confirmation.data.state.documents[0].purchaseId,
        confirmation.data.purchaseIds[0],
      );
      assert.equal(confirmation.data.state.revision, saved.revision);
      const downloaded = await owner.call(`/documents/${documentId}/download`);
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.text, receipt);
      assert.match(
        downloaded.headers.get("content-disposition") || "",
        /^attachment;/,
      );
      assert.match(downloaded.headers.get("cache-control") || "", /no-store/);
      const replay = await owner.call(`/imports/${importId}/confirm`, "POST", {
        purchases,
      });
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data.purchaseIds, confirmation.data.purchaseIds);
      assert.equal((await owner.call("/state")).data.state.purchases.length, 3);
      assert.equal(
        (await stranger.call("/state")).data.state.documents.length,
        0,
      );
    },
  );
});
