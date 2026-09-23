import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeFile,
  emlText,
  emlLinkSource,
  importFingerprint,
  parseDate,
  parseText,
  purchaseFingerprint,
  extractImport,
} from "../artifacts/api-server/src/dvy/import-parser";
import { extractReturnLinks } from "../artifacts/api-server/src/dvy/automation";
import { identifyMerchant } from "../artifacts/api-server/src/dvy/merchants";
import { dueNotifications } from "../artifacts/api-server/src/dvy/reminders";
import {
  DEFAULT_SETTINGS,
  emptyState,
  type Account,
  type Purchase,
} from "../lib/domain/src/index";

test("dates reject impossible dates and do not assume a legal return period", () => {
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("2026-02-29"), null);
  assert.equal(parseDate("29/02/2028"), "2028-02-29");
  const result = parseText(
    "Tienda: Zara\nProducto: Camiseta blanca\nPedido: AB-12345\nFecha de compra: 10/09/2026\nTotal: 29,99 EUR\nTienes 30 días para devolver",
  );
  assert.equal(result.candidates[0].purchasedAt, "2026-09-10");
  assert.equal(result.candidates[0].deadline, null);
  assert.equal(result.candidates[0].priceMinor, 2999);
  assert.equal(result.candidates[0].store, "Zara");
  assert.equal(result.candidates[0].orderNumber, "AB-12345");
  assert.equal(
    parseText("Fecha límite de devolución: 30/09/2026").candidates[0].deadline,
    "2026-09-30",
  );
  assert.equal(
    parseText("Fecha límite de devolución: 30/09/2026").candidates[0]
      .purchasedAt,
    "",
  );
});
test("MIME decodes quoted printable and base64 text without requesting remote content", () => {
  const eml =
    'Subject: Ticket\r\nContent-Type: multipart/alternative; boundary="test-boundary"\r\n\r\n--test-boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nProducto: Pantal=C3=B3n\r\n--test-boundary\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    Buffer.from(
      '<p>Pedido: 123456</p><img src="https://evil.test/pixel"><script>steal()</script>',
    ).toString("base64") +
    "\r\n--test-boundary--";
  const text = emlText(eml);
  assert.match(text, /Pantalón/);
  assert.match(text, /123456/);
  assert.doesNotMatch(text, /steal|evil.test/);
});
test("file validation rejects masquerading formats and active HTML", () => {
  assert.throws(() =>
    decodeFile({
      name: "x.pdf",
      mime: "application/pdf",
      base64: Buffer.from("<html>unsafe</html>").toString("base64"),
    }),
  );
  assert.throws(() =>
    decodeFile({
      name: "x.html",
      mime: "text/html",
      base64: Buffer.from("<script>x()</script>").toString("base64"),
    }),
  );
  assert.throws(() =>
    decodeFile({ name: "x.txt", mime: "text/plain", base64: "not base64" }),
  );
  assert.equal(
    decodeFile({
      name: "../x.txt",
      mime: "text/plain",
      base64: Buffer.from("Ticket").toString("base64"),
    }).file.name,
    ".._x.txt",
  );
});
test("import dedupe includes owner and exact content; unknown orders never deduplicate legitimate purchases", () => {
  assert.equal(
    importFingerprint("a", " text "),
    importFingerprint("a", "text"),
  );
  assert.notEqual(
    importFingerprint("a", "text"),
    importFingerprint("b", "text"),
  );
  const purchase = {
    store: "Zara",
    orderNumber: "1234",
    title: "Top",
    purchasedAt: "2026-09-01",
    priceMinor: 1000,
    currency: "EUR",
  };
  assert.equal(
    purchaseFingerprint(purchase),
    purchaseFingerprint({ ...purchase, store: " zara " }),
  );
  assert.equal(purchaseFingerprint({ ...purchase, orderNumber: "" }), null);
  assert.notEqual(
    purchaseFingerprint(purchase),
    purchaseFingerprint({ ...purchase, title: "Trousers" }),
  );
});
test("only exact official domains are extracted and merchant regions remain distinct", () => {
  const links = extractReturnLinks(
    "https://www.zara.com/es/returns?token=secret https://www.zara.com.evil.test/returns https://user:pass@www.zara.com/returns https://127.0.0.1/return https://shop.mango.com/es/returns?x=1&amp;y=2",
  );
  assert.equal(links.length, 2);
  assert.equal(links[1].url, "https://shop.mango.com/es/returns?x=1&y=2");
  assert.equal(identifyMerchant("Mango Outlet"), undefined);
  assert.equal(identifyMerchant("Zara", "US"), undefined);
  assert.equal(identifyMerchant("H&M", "ES")?.id, "hm_es");
});
test("no OCR is claimed without provider configuration", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await extractImport("", {
      name: "ticket.pdf",
      mime: "application/pdf",
      base64: Buffer.from("%PDF-1.4 fake test").toString("base64"),
    });
    assert.equal(result.candidates.length, 0);
    assert.match(result.message, /requiere configurar OPENAI_API_KEY/);
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
  }
});
test("reminders honor timezone/hour, dedupe, changed deadlines and available quantities", () => {
  const account: Account = {
    id: "a",
    email: "a@example.test",
    name: "A",
    verified: false,
    inboundAddress: null,
    settings: { ...DEFAULT_SETTINGS, timezone: "Europe/Madrid" },
  };
  const state = emptyState();
  const p: Purchase = {
    id: "p",
    title: "Top",
    store: "Zara",
    merchantId: "zara_es",
    orderNumber: "1234",
    country: "ES",
    seller: "",
    currency: "EUR",
    priceMinor: 1000,
    quantity: 2,
    purchasedAt: "2026-09-01",
    deliveredAt: null,
    deadline: "2026-09-23",
    deadlineQuality: "manual",
    deadlineSource: "Ticket",
    notes: "",
    archived: false,
    keptQuantity: 0,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  };
  state.purchases.push(p);
  assert.equal(
    dueNotifications(account, state, new Date("2026-09-20T06:00:00Z")).length,
    0,
  );
  const first = dueNotifications(
    account,
    state,
    new Date("2026-09-20T09:00:00Z"),
  );
  assert.equal(first.length, 1);
  assert.match(first[0].body, /3 días/);
  state.notifications.push(...first);
  assert.equal(
    dueNotifications(account, state, new Date("2026-09-20T10:00:00Z")).length,
    0,
  );
  p.deadline = "2026-09-21";
  assert.equal(
    dueNotifications(account, state, new Date("2026-09-20T09:00:00Z")).length,
    1,
  );
  p.keptQuantity = 2;
  assert.equal(
    dueNotifications(account, state, new Date("2026-09-20T09:00:00Z")).length,
    0,
  );
});

test("draft returns retain purchase reminders; exchanges do not request a cash refund; empty settings silence reminders", () => {
  const account: Account = {
    id: "a",
    email: "a@example.test",
    name: "A",
    verified: false,
    inboundAddress: null,
    settings: { ...DEFAULT_SETTINGS, timezone: "Europe/Madrid" },
  };
  const state = emptyState();
  const p: Purchase = {
    id: "p",
    title: "Top",
    store: "Zara",
    merchantId: "zara_es",
    orderNumber: "1234",
    country: "ES",
    seller: "",
    currency: "EUR",
    priceMinor: 1000,
    quantity: 1,
    purchasedAt: "2026-09-01",
    deliveredAt: null,
    deadline: "2026-09-23",
    deadlineQuality: "manual",
    deadlineSource: "Ticket",
    notes: "",
    archived: false,
    keptQuantity: 0,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  };
  state.purchases.push(p);
  state.returns.push({
    id: "r",
    items: [{ purchaseId: "p", quantity: 1 }],
    status: "draft",
    outcome: "refund",
    reference: "",
    dispatchBy: null,
    trackingUrl: "",
    notes: "",
    expectedMinor: 1000,
    currency: "EUR",
    refunds: [],
    events: [],
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  });
  const now = new Date("2026-09-20T09:00:00Z");
  assert.equal(dueNotifications(account, state, now).length, 1);
  state.returns[0].status = "requested";
  assert.equal(dueNotifications(account, state, now).length, 0);
  state.returns[0].status = "received";
  state.returns[0].outcome = "exchange";
  assert.equal(dueNotifications(account, state, now).length, 0);
  state.returns[0].outcome = "refund";
  assert.equal(dueNotifications(account, state, now).length, 1);
  account.settings.reminderDays = [];
  assert.equal(dueNotifications(account, state, now).length, 0);
});
test("a changed deadline or completed return invalidates an earlier notification key", () => {
  const account: Account = {
    id: "a",
    email: "a@example.test",
    name: "A",
    verified: true,
    inboundAddress: null,
    settings: { ...DEFAULT_SETTINGS, timezone: "Europe/Madrid" },
  };
  const state = emptyState();
  const p: Purchase = {
    id: "p",
    title: "Top",
    store: "Zara",
    merchantId: null,
    orderNumber: "1234",
    country: "ES",
    seller: "",
    currency: "EUR",
    priceMinor: 1000,
    quantity: 1,
    purchasedAt: "2026-09-01",
    deliveredAt: null,
    deadline: "2026-09-23",
    deadlineQuality: "manual",
    deadlineSource: "",
    notes: "",
    archived: false,
    keptQuantity: 0,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  };
  state.purchases.push(p);
  const now = new Date("2026-09-20T09:00:00Z");
  const first = dueNotifications(account, state, now)[0];
  state.notifications.push(first);
  p.deadline = "2026-10-30";
  assert.equal(
    dueNotifications(account, { ...state, notifications: [] }, now).some(
      (n) => n.dedupeKey === first.dedupeKey,
    ),
    false,
  );
  p.deadline = "2026-09-23";
  p.keptQuantity = 1;
  assert.equal(
    dueNotifications(account, { ...state, notifications: [] }, now).some(
      (n) => n.dedupeKey === first.dedupeKey,
    ),
    false,
  );
});

test("HTML and MIME preserve exact official return href tokens without navigating", () => {
  const fetchBefore = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched++;
    throw new Error("No link prefetch allowed");
  };
  try {
    const expected =
      "https://www.zara.com/es/es/return?token=a%2Bb%3D%3D&signature=XyZ.;";
    const html =
      '<a href="https://www.zara.com/es/es/return?token=a%2Bb%3D%3D&amp;signature=XyZ.;">Devolver</a><script>const url="https://www.zara.com/return?evil=script"</script><img src="https://www.zara.com/return?evil=image"><a href="javascript:alert(1)">No</a><a href="https://www.zara.com.evil.test/return">No</a>';
    assert.deepEqual(
      extractReturnLinks(html).map((x) => x.url),
      [expected],
    );
    const b64 =
      "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
      Buffer.from(html).toString("base64");
    assert.deepEqual(
      extractReturnLinks(emlLinkSource(b64)).map((x) => x.url),
      [expected],
    );
    const qp =
      "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
      html.replace(/=/g, "=3D");
    assert.deepEqual(
      extractReturnLinks(emlLinkSource(qp)).map((x) => x.url),
      [expected],
    );
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
