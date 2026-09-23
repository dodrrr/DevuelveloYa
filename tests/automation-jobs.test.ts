import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Store } from "../artifacts/api-server/src/dvy/store";
import {
  initializeAutomation,
  processImport,
  runJobs,
} from "../artifacts/api-server/src/dvy/automation";
import { runReminders } from "../artifacts/api-server/src/dvy/reminders";
import { validatePurchase } from "../artifacts/api-server/src/dvy/validation";
import type { AppNotification } from "../lib/domain/src/index";

test("durable jobs survive a new Store instance, deduplicate, and do not invoke paid extraction for inbound mail", async (t) => {
  const pg = new PGlite();
  const connection = {
    query: async (sql: string, values?: any[]) => {
      const r = await pg.query(sql, values);
      return { rows: r.rows, rowCount: r.affectedRows };
    },
  };
  const db = new Store(connection);
  t.after(() => pg.close());
  await db.init();
  await initializeAutomation(db);
  const account = await db.createAccount("jobs@example.test", "Jobs", "unused");
  const original = process.env.OPENAI_API_KEY;
  const fetchBefore = globalThis.fetch;
  let apiCalls = 0;
  process.env.OPENAI_API_KEY = "test-never-sent";
  globalThis.fetch = async () => {
    apiCalls++;
    throw new Error("Unexpected outbound extraction");
  };
  t.after(() => {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
    globalThis.fetch = fetchBefore;
  });
  await db.query(
    "INSERT INTO dvy_import_jobs(id,owner_id,fingerprint,kind,title,payload) VALUES('job-1',$1,'same-email','email','Ticket',$2::jsonb)",
    [
      account.id,
      JSON.stringify({
        text: "Tienda: Zara\nProducto: Top\nPedido: TEST-999\nFecha: 10/09/2026\nTotal: 12,95 EUR",
        allowAI: false,
      }),
    ],
  );
  const restarted = new Store(connection);
  assert.equal(await processImport(restarted), true);
  assert.equal(apiCalls, 0);
  const result = await restarted.query(
    "SELECT * FROM dvy_import_jobs WHERE id='job-1'",
  );
  assert.equal(result.rows[0].status, "needs_review");
  assert.equal(result.rows[0].candidates[0].priceMinor, 1295);
  assert.equal(
    (await restarted.readState(account.id)).imports[0].status,
    "needs_review",
  );
  assert.equal(await processImport(restarted), false);
  await assert.rejects(() =>
    db.query(
      "INSERT INTO dvy_import_jobs(id,owner_id,fingerprint,kind,title,payload) VALUES('job-2',$1,'same-email','email','Ticket','{}')",
      [account.id],
    ),
  );
  assert.deepEqual(await runJobs(restarted), { imports: 0, notifications: 0 });
  assert.ok(
    (await db.query("SELECT last_run FROM dvy_scheduler_meta WHERE id='main'"))
      .rows[0].last_run,
  );
  await db.deleteAccount(account.id);
  assert.equal(
    (await db.query("SELECT id FROM dvy_import_jobs")).rows.length,
    0,
  );
});

test("email outbox cancels stale obligations, respects verified accounts, and sends active reminders once", async (t) => {
  const pg = new PGlite();
  const db = new Store({
    query: async (sql, values) => {
      const r = await pg.query(sql, values);
      return { rows: r.rows, rowCount: r.affectedRows };
    },
  });
  t.after(() => pg.close());
  await db.init();
  await initializeAutomation(db);
  const account = await db.createAccount("mail@example.test", "Mail", "unused");
  await db.query("UPDATE dvy_accounts SET verified=true WHERE id=$1", [
    account.id,
  ]);
  await db.mutateSettings(account.id, (s) => ({ ...s, emailReminders: true }));
  const p = validatePurchase({
    title: "Top",
    store: "Zara",
    purchasedAt: "2026-09-01",
    deadline: "2026-10-20",
    deadlineQuality: "manual",
    priceMinor: 1000,
    quantity: 1,
  });
  const now = new Date("2026-09-20T10:00:00Z");
  const stale: AppNotification = {
    id: "notice-old",
    dedupeKey: `purchase:${p.id}:2026-09-23:3`,
    title: "Plazo",
    body: "Obsoleto",
    purchaseId: p.id,
    returnId: null,
    read: false,
    createdAt: now.toISOString(),
  };
  await db.mutateState(account.id, (s) => {
    s.purchases.push(p);
    s.notifications.push(stale);
  });
  await db.query(
    "INSERT INTO dvy_email_deliveries(id,owner_id,dedupe_key,payload,status,created_at) VALUES('stale',$1,$2,$3::jsonb,'queued',now())",
    [
      account.id,
      stale.dedupeKey,
      JSON.stringify({ title: "old", body: "old" }),
    ],
  );
  const saved = Object.fromEntries(
    ["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM", "APP_URL"].map((k) => [
      k,
      process.env[k],
    ]),
  );
  const fetchBefore = globalThis.fetch;
  let sent = 0;
  Object.assign(process.env, {
    POSTMARK_SERVER_TOKEN: "test-token",
    POSTMARK_FROM: "verified@example.test",
    APP_URL: "https://app.example.test",
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.postmarkapp.com/email");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.To, "mail@example.test");
    sent++;
    return new Response(
      JSON.stringify({ ErrorCode: 0, MessageID: `provider-${sent}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    globalThis.fetch = fetchBefore;
  });
  await runReminders(db, now);
  assert.equal(sent, 0);
  assert.equal(
    (await db.query("SELECT status FROM dvy_email_deliveries WHERE id='stale'"))
      .rows[0].status,
    "cancelled",
  );
  await db.mutateState(account.id, (s) => {
    s.purchases[0].deadline = "2026-09-21";
  });
  await runReminders(db, now);
  assert.equal(sent, 1);
  await runReminders(db, now);
  assert.equal(sent, 1);
  await db.query("UPDATE dvy_accounts SET verified=false WHERE id=$1", [
    account.id,
  ]);
  await db.mutateState(account.id, (s) => {
    s.purchases[0].deadline = "2026-09-20";
  });
  await runReminders(db, now);
  assert.equal(sent, 1);
});
