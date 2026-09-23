import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  availableQuantity,
  emptyState,
  type AppState,
  type Purchase,
  type ReturnCase,
  type ReturnStatus,
} from "../lib/domain/src/index.ts";
import {
  ValidationError,
  applyRefund,
  applyStatusEvent,
  assertStateIntegrity,
  validatePurchase,
  validateReturn,
  validateReturnPatch,
  validateSettings,
} from "../artifacts/api-server/src/dvy/validation.ts";

const purchaseInput = (overrides: Record<string, unknown> = {}) => ({
  title: "Auriculares",
  store: "Tienda de prueba",
  purchasedAt: "2026-03-01",
  deliveredAt: "2026-03-03",
  deadline: "2026-03-20",
  deadlineQuality: "manual",
  currency: "EUR",
  quantity: 3,
  priceMinor: 12999,
  ...overrides,
});

function stateWithPurchase(overrides: Record<string, unknown> = {}): {
  state: AppState;
  purchase: Purchase;
} {
  const state = emptyState();
  const purchase = validatePurchase(purchaseInput(overrides));
  state.purchases.push(purchase);
  return { state, purchase };
}

function addReturn(
  state: AppState,
  purchase: Purchase,
  quantity = 1,
): ReturnCase {
  const result = validateReturn(
    { items: [{ purchaseId: purchase.id, quantity }] },
    state,
  );
  state.returns.push(result);
  return result;
}

function rejectsValidation(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(
      error instanceof ValidationError,
      "Expected a controlled validation error",
    );
    assert.ok(
      error.status >= 400 && error.status < 500,
      "Invalid user input must be a client error",
    );
    return true;
  });
}

test("purchase stores integer minor units and keeps an explicit unknown amount", () => {
  const priced = validatePurchase(purchaseInput({ priceMinor: 1099 }));
  assert.equal(priced.priceMinor, 1099);
  assert.equal(priced.quantity, 3);
  const unknown = validatePurchase(purchaseInput({ priceMinor: null }));
  assert.equal(unknown.priceMinor, null);
});

test("purchase quantities must be bounded positive integers", () => {
  for (const quantity of [
    0,
    -1,
    0.5,
    10000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "3",
  ]) {
    rejectsValidation(() => validatePurchase(purchaseInput({ quantity })));
  }
});

test("money cannot be negative, fractional, non-finite, or an unsafe integer", () => {
  for (const priceMinor of [
    -1,
    10.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "1000",
  ]) {
    rejectsValidation(() => validatePurchase(purchaseInput({ priceMinor })));
  }
});

test("calendar validation rejects impossible dates and timestamps masquerading as dates", () => {
  for (const purchasedAt of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-01-00",
    "2026-03-01T12:00:00Z",
    "01/03/2026",
  ]) {
    rejectsValidation(() => validatePurchase(purchaseInput({ purchasedAt })));
  }
  assert.equal(
    validatePurchase(purchaseInput({ purchasedAt: "2024-02-29" })).purchasedAt,
    "2024-02-29",
  );
});

test("delivery and deadline cannot precede purchase, but expired purchases remain valid", () => {
  rejectsValidation(() =>
    validatePurchase(purchaseInput({ deliveredAt: "2026-02-28" })),
  );
  rejectsValidation(() =>
    validatePurchase(purchaseInput({ deadline: "2026-02-28" })),
  );
  assert.equal(
    validatePurchase(
      purchaseInput({
        purchasedAt: "2020-01-01",
        deliveredAt: "2020-01-02",
        deadline: "2020-01-30",
      }),
    ).deadline,
    "2020-01-30",
  );
});

test("updating a purchase preserves its identity and creation timestamp", () => {
  const original = validatePurchase(purchaseInput());
  const edited = validatePurchase(
    {
      ...original,
      title: "Auriculares revisados",
      id: "forged-id",
      createdAt: "2000-01-01T00:00:00Z",
    },
    original,
  );
  assert.equal(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.equal(edited.title, "Auriculares revisados");
});

test("partial returns reserve only selected units and compute exact totals", () => {
  const { state, purchase } = stateWithPurchase({
    quantity: 3,
    priceMinor: 1099,
  });
  const first = addReturn(state, purchase, 2);
  assert.equal(first.expectedMinor, 733);
  assert.equal(availableQuantity(state, purchase), 1);
  rejectsValidation(() =>
    validateReturn(
      { items: [{ purchaseId: purchase.id, quantity: 2 }] },
      state,
    ),
  );
  const second = addReturn(state, purchase, 1);
  assert.equal(second.expectedMinor, 366);
  assert.equal(availableQuantity(state, purchase), 0);
  assertStateIntegrity(state);
});

test("kept units cannot be included in another return", () => {
  const { state, purchase } = stateWithPurchase({
    quantity: 3,
    keptQuantity: 2,
  });
  assert.equal(availableQuantity(state, purchase), 1);
  rejectsValidation(() =>
    validateReturn(
      { items: [{ purchaseId: purchase.id, quantity: 2 }] },
      state,
    ),
  );
});

test("return quantities reject zero, fractions, duplicate lines, and unknown purchases", () => {
  const { state, purchase } = stateWithPurchase();
  for (const quantity of [0, -1, 1.5, "1"]) {
    rejectsValidation(() =>
      validateReturn({ items: [{ purchaseId: purchase.id, quantity }] }, state),
    );
  }
  rejectsValidation(() => validateReturn({ items: [] }, state));
  rejectsValidation(() =>
    validateReturn({ items: [{ purchaseId: "missing", quantity: 1 }] }, state),
  );
  rejectsValidation(() =>
    validateReturn(
      {
        items: [
          { purchaseId: purchase.id, quantity: 1 },
          { purchaseId: purchase.id, quantity: 1 },
        ],
      },
      state,
    ),
  );
});

test("unknown purchase price leaves expected refund unknown instead of inventing a zero", () => {
  const { state, purchase } = stateWithPurchase({ priceMinor: null });
  assert.equal(addReturn(state, purchase).expectedMinor, null);
});

test("a single return cannot mix currencies", () => {
  const { state, purchase } = stateWithPurchase();
  const other = validatePurchase(purchaseInput({ currency: "USD" }));
  state.purchases.push(other);
  rejectsValidation(() =>
    validateReturn(
      {
        items: [
          { purchaseId: purchase.id, quantity: 1 },
          { purchaseId: other.id, quantity: 1 },
        ],
      },
      state,
    ),
  );
});

test("tracking links require HTTPS without embedded credentials", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  for (const trackingUrl of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://carrier.example/track",
    "https://user:password@carrier.example/track",
    "//carrier.example/track",
  ]) {
    rejectsValidation(() => validateReturnPatch({ trackingUrl }, result));
  }
  const updated = validateReturnPatch(
    { trackingUrl: "https://carrier.example/track?reference=abc" },
    result,
  );
  assert.equal(
    updated.trackingUrl,
    "https://carrier.example/track?reference=abc",
  );
  assert.equal(
    validateReturnPatch({ trackingUrl: "" }, updated).trackingUrl,
    "",
  );
});

test("metadata updates cannot rewrite return identity, inventory, or refund ledger", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  const input = {
    reference: "R-2026",
    id: "forged",
    items: [{ purchaseId: purchase.id, quantity: 999 }],
    status: "resolved",
    refunds: [{ amountMinor: 999999 }],
  };
  try {
    const updated = validateReturnPatch(input, result);
    assert.equal(updated.id, result.id);
    assert.deepEqual(updated.items, result.items);
    assert.equal(updated.status, result.status);
    assert.deepEqual(updated.refunds, result.refunds);
  } catch (error) {
    assert.ok(error instanceof ValidationError);
  }
});

test("cancelling an unsent return releases its units", () => {
  const { state, purchase } = stateWithPurchase({ quantity: 1 });
  const result = addReturn(state, purchase);
  assert.equal(availableQuantity(state, purchase), 0);
  applyStatusEvent(state, result.id, {
    status: "cancelled",
    note: "He decidido conservar la compra",
  });
  assert.equal(state.returns[0].status, "cancelled");
  assert.equal(availableQuantity(state, purchase), 1);
  assertStateIntegrity(state);
});

test("shipment transitions retain an audit trail and cannot return to draft", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  for (const status of [
    "requested",
    "authorized",
    "shipped",
    "received",
  ] as const) {
    applyStatusEvent(state, result.id, { status, note: `Cambio a ${status}` });
    assert.equal(state.returns[0].status, status);
  }
  assert.ok(state.returns[0].events.length >= 4);
  rejectsValidation(() =>
    applyStatusEvent(state, result.id, { status: "draft" }),
  );
  rejectsValidation(() =>
    applyStatusEvent(state, "missing", { status: "requested" }),
  );
});

test("sent, received, and completed returns cannot release units through cancellation", () => {
  for (const status of [
    "shipped",
    "received",
    "resolved",
  ] satisfies ReturnStatus[]) {
    const { state, purchase } = stateWithPurchase({ quantity: 1 });
    const result = addReturn(state, purchase);
    result.status = status;
    rejectsValidation(() =>
      applyStatusEvent(state, result.id, { status: "cancelled" }),
    );
    assert.equal(state.returns[0].status, status);
    assert.equal(availableQuantity(state, purchase), 0);
  }
});

test("an invalid transition note cannot partially change the current return", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  const snapshot = structuredClone(state);
  rejectsValidation(() =>
    applyStatusEvent(state, result.id, { status: "shipped", note: 123 }),
  );
  assert.deepEqual(state, snapshot);
});

test("a legacy cancelled return with shipping history still consumes inventory", () => {
  const { state, purchase } = stateWithPurchase({ quantity: 1 });
  const result = addReturn(state, purchase);
  applyStatusEvent(state, result.id, { status: "shipped" });
  result.status = "cancelled";
  assert.equal(availableQuantity(state, purchase), 0);
  rejectsValidation(() =>
    validateReturn(
      { items: [{ purchaseId: purchase.id, quantity: 1 }] },
      state,
    ),
  );
  state.returns.push({
    ...structuredClone(result),
    id: "conflicting-return",
    status: "draft",
    events: [],
  });
  rejectsValidation(() => assertStateIntegrity(state));
});

test("refund ledger distinguishes issued and actually received money", () => {
  const { state, purchase } = stateWithPurchase({ priceMinor: 10000 });
  const result = addReturn(state, purchase);
  applyRefund(state, result.id, {
    amountMinor: 10000,
    currency: "EUR",
    kind: "issued",
  });
  applyRefund(state, result.id, {
    amountMinor: 6000,
    currency: "EUR",
    kind: "received",
  });
  applyRefund(state, result.id, {
    amountMinor: 4000,
    currency: "EUR",
    kind: "received",
  });
  const refunds = state.returns[0].refunds;
  assert.equal(
    refunds
      .filter((item) => item.kind === "issued")
      .reduce((total, item) => total + item.amountMinor, 0),
    10000,
  );
  assert.equal(
    refunds
      .filter((item) => item.kind === "received")
      .reduce((total, item) => total + item.amountMinor, 0),
    10000,
  );
  assert.equal(new Set(refunds.map((item) => item.id)).size, 3);
});

test("a refund return only resolves when the expected money has actually been received", () => {
  const { state, purchase } = stateWithPurchase({
    priceMinor: 10000,
    quantity: 1,
  });
  const result = addReturn(state, purchase);
  applyStatusEvent(state, result.id, { status: "received" });
  applyRefund(state, result.id, {
    amountMinor: 10000,
    currency: "EUR",
    kind: "issued",
  });
  rejectsValidation(() =>
    applyStatusEvent(state, result.id, { status: "resolved" }),
  );
  applyRefund(state, result.id, {
    amountMinor: 6000,
    currency: "EUR",
    kind: "received",
  });
  rejectsValidation(() =>
    applyStatusEvent(state, result.id, { status: "resolved" }),
  );
  applyRefund(state, result.id, {
    amountMinor: 4000,
    currency: "EUR",
    kind: "received",
  });
  applyStatusEvent(state, result.id, { status: "resolved" });
  assert.equal(state.returns[0].status, "resolved");
});

test("unknown refund expectations cannot be silently resolved as zero", () => {
  const { state, purchase } = stateWithPurchase({ priceMinor: null });
  const result = addReturn(state, purchase);
  rejectsValidation(() =>
    applyStatusEvent(state, result.id, { status: "resolved" }),
  );
});

test("an explicit refund adjustment supports shipping costs without corrupting received totals", () => {
  const { state, purchase } = stateWithPurchase({ priceMinor: 10000 });
  const result = addReturn(state, purchase);
  state.returns[0] = validateReturnPatch({ expectedMinor: 10500 }, result);
  applyRefund(state, result.id, {
    amountMinor: 10500,
    currency: "EUR",
    kind: "received",
  });
  applyStatusEvent(state, result.id, { status: "resolved" });
  assert.equal(state.returns[0].expectedMinor, 10500);
  assert.equal(state.returns[0].status, "resolved");
});

test("refunds reject invalid amounts, foreign currency, and unknown return ids without mutation", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  for (const amountMinor of [
    0,
    -1,
    0.5,
    "100",
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    rejectsValidation(() =>
      applyRefund(state, result.id, {
        amountMinor,
        currency: "EUR",
        kind: "received",
      }),
    );
  }
  rejectsValidation(() =>
    applyRefund(state, result.id, {
      amountMinor: 100,
      currency: "USD",
      kind: "received",
    }),
  );
  rejectsValidation(() =>
    applyRefund(state, "missing", {
      amountMinor: 100,
      currency: "EUR",
      kind: "received",
    }),
  );
  assert.equal(state.returns[0].refunds.length, 0);
});

test("state integrity rejects inventory changes that would oversubscribe returned units", () => {
  const { state, purchase } = stateWithPurchase({ quantity: 3 });
  addReturn(state, purchase, 2);
  purchase.quantity = 1;
  rejectsValidation(() => assertStateIntegrity(state));
});

test("state integrity detects deleted purchase references in existing returns", () => {
  const { state, purchase } = stateWithPurchase();
  addReturn(state, purchase);
  state.purchases = [];
  rejectsValidation(() => assertStateIntegrity(state));
});

test("settings reject timezone typos and invalid notification hours", () => {
  const settings = validateSettings(
    { timezone: "Atlantic/Canary", reminderHour: 8 },
    DEFAULT_SETTINGS,
  );
  assert.equal(settings.timezone, "Atlantic/Canary");
  assert.equal(settings.reminderHour, 8);
  rejectsValidation(() =>
    validateSettings({ timezone: "Europe/NotAPlace" }, DEFAULT_SETTINGS),
  );
  for (const reminderHour of [-1, 24, 8.5, "8"]) {
    rejectsValidation(() =>
      validateSettings({ reminderHour }, DEFAULT_SETTINGS),
    );
  }
});

test("repeating the same refund operation cannot duplicate actual money", () => {
  const { state, purchase } = stateWithPurchase({
    priceMinor: 10000,
    quantity: 1,
  });
  const result = addReturn(state, purchase);
  const payment = {
    operationId: "123e4567-e89b-42d3-a456-426614174000",
    amountMinor: 10000,
    currency: "EUR",
    kind: "received",
    at: "2026-09-20T09:00:00.000Z",
  };
  applyRefund(state, result.id, payment);
  const snapshot = structuredClone(state);
  applyRefund(state, result.id, payment);
  assert.deepEqual(state, snapshot);
  assert.equal(state.returns[0].refunds.length, 1);
  rejectsValidation(() =>
    applyRefund(state, result.id, { ...payment, amountMinor: 9999 }),
  );
  assert.deepEqual(state, snapshot);
});

test("a note may be appended without requesting a status transition", () => {
  const { state, purchase } = stateWithPurchase();
  const result = addReturn(state, purchase);
  applyStatusEvent(state, result.id, {
    note: "La tienda ha confirmado la recogida",
  });
  assert.equal(result.status, "draft");
  assert.equal(result.events.at(-1)?.type, "note");
  assert.equal(
    result.events.at(-1)?.note,
    "La tienda ha confirmado la recogida",
  );
});

test("separate partial returns preserve the final rounding cent", () => {
  const { state, purchase } = stateWithPurchase({
    priceMinor: 100,
    quantity: 3,
  });
  const amounts = [
    addReturn(state, purchase).expectedMinor,
    addReturn(state, purchase).expectedMinor,
    addReturn(state, purchase).expectedMinor,
  ];
  assert.deepEqual(amounts, [33, 34, 33]);
  assert.equal(
    amounts.reduce<number>((sum, amount) => sum + amount!, 0),
    100,
  );
});
