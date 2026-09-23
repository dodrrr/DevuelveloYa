import { randomUUID } from "node:crypto";
import {
  availableQuantity,
  daysRemaining,
  localDate,
  type Account,
  type AppNotification,
  type AppState,
} from "../../../../lib/domain/src/index";
import type { Store } from "./store";
import {
  appUrl,
  emailConfigured,
  EmailDeliveryError,
  sendEmail,
} from "./email";
export function dueNotifications(
  account: Account,
  state: AppState,
  now = new Date(),
): AppNotification[] {
  if (!account.settings.reminderDays.length) return [];
  const tz = account.settings.timezone;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < account.settings.reminderHour) return [];
  const known = new Set(state.notifications.map((n) => n.dedupeKey));
  const results: AppNotification[] = [];
  const stage = (days: number) =>
    days < 0
      ? days >= -7
        ? "vencido"
        : null
      : ([...account.settings.reminderDays]
          .filter((d) => days <= d)
          .sort((a, b) => a - b)[0]
          ?.toString() ?? null);
  const add = (
    dedupeKey: string,
    title: string,
    body: string,
    purchaseId: string | null,
    returnId: string | null,
  ) => {
    if (!known.has(dedupeKey)) {
      known.add(dedupeKey);
      results.push({
        id: randomUUID(),
        dedupeKey,
        title,
        body,
        purchaseId,
        returnId,
        read: false,
        createdAt: now.toISOString(),
      });
    }
  };
  for (const p of state.purchases) {
    const submitted = state.returns
      .filter((r) => r.status !== "draft" && r.status !== "cancelled")
      .flatMap((r) => r.items)
      .filter((i) => i.purchaseId === p.id)
      .reduce((n, i) => n + i.quantity, 0);
    if (
      p.archived ||
      p.quantity - p.keptQuantity - submitted <= 0 ||
      !p.deadline
    )
      continue;
    const days = daysRemaining(p.deadline, tz, now);
    if (days === null) continue;
    const threshold = stage(days);
    if (threshold === null) continue;
    add(
      `purchase:${p.id}:${p.deadline}:${threshold}`,
      days < 0
        ? "Revisa una compra vencida"
        : days === 0
          ? "El plazo registrado vence hoy"
          : "Tu devolución se acerca",
      `${p.title} · ${p.store}. ${days < 0 ? "El plazo registrado ha vencido; comprueba otras opciones en la tienda." : days === 0 ? "Hoy es el último día registrado." : `Quedan ${days} días según tu fecha registrada.`}${p.deadlineQuality === "estimated" ? " La fecha es estimada: confírmala." : ""}`,
      p.id,
      null,
    );
  }
  for (const r of state.returns) {
    if (
      r.dispatchBy &&
      ["draft", "requested", "authorized"].includes(r.status)
    ) {
      const days = daysRemaining(r.dispatchBy, tz, now);
      const threshold = days === null ? null : stage(days);
      if (threshold !== null)
        add(
          `dispatch:${r.id}:${r.dispatchBy}:${threshold}`,
          days! < 0
            ? "Revisa el plazo de envío"
            : "Recuerda enviar tu devolución",
          `Devolución ${r.reference || r.id.slice(0, 8)}. ${days! < 0 ? "El plazo registrado de envío ha vencido." : days === 0 ? "La fecha de envío registrada es hoy." : `Quedan ${days} días para la fecha registrada de envío.`}`,
          null,
          r.id,
        );
    }
    if (
      r.status === "received" &&
      r.outcome === "refund" &&
      r.expectedMinor !== null
    ) {
      const received = r.refunds
        .filter((f) => f.kind === "received")
        .reduce((n, f) => n + f.amountMinor, 0);
      const event = r.events
        .filter(
          (e) => e.type.includes("received") || e.note.includes("Recibida"),
        )
        .at(-1);
      const at = event?.at || r.updatedAt;
      if (
        received < r.expectedMinor &&
        now.getTime() - Date.parse(at) >= 7 * 86400000
      )
        add(
          `refund:${r.id}:${at}`,
          "Comprueba tu reembolso",
          "La devolución consta como recibida y queda dinero pendiente de confirmar. Consulta el plazo indicado por la tienda.",
          null,
          r.id,
        );
    }
  }
  return results;
}
export async function runReminders(
  store: Store,
  now = new Date(),
): Promise<number> {
  let count = 0;
  for (const account of await store.listAccounts()) {
    const snapshot = await store.readState(account.id);
    const due = dueNotifications(account, snapshot, now);
    if (due.length) {
      await store.mutateState(account.id, (state) => {
        for (const n of due)
          if (!state.notifications.some((x) => x.dedupeKey === n.dedupeKey))
            state.notifications.push(n);
      });
      count += due.length;
    }
    if (
      !emailConfigured() ||
      !account.verified ||
      !account.settings.emailReminders
    )
      continue;
    // Include already-created today's notifications so a crash between notification
    // and outbox creation does not silently lose the email. Dedupe is in PostgreSQL.
    const state = await store.readState(account.id);
    const eligible = new Set(
      dueNotifications(account, { ...state, notifications: [] }, now).map(
        (n) => n.dedupeKey,
      ),
    );
    for (const n of state.notifications.filter(
      (n) =>
        eligible.has(n.dedupeKey) &&
        localDate(new Date(n.createdAt), account.settings.timezone) ===
          localDate(now, account.settings.timezone),
    )) {
      const inserted = await store.query(
        "INSERT INTO dvy_email_deliveries(id,owner_id,dedupe_key,payload,status,created_at) VALUES($1,$2,$3,$4::jsonb,'queued',now()) ON CONFLICT(owner_id,dedupe_key) DO NOTHING RETURNING id",
        [
          randomUUID(),
          account.id,
          n.dedupeKey,
          JSON.stringify({ title: n.title, body: n.body }),
        ],
      );
      void inserted;
    }
  }
  // Claim atomically. Never retry an interrupted 'sending' automatically: the
  // provider may already have accepted it and has no idempotency key contract.
  await store.query(
    "UPDATE dvy_email_deliveries SET status='uncertain',last_error='Entrega interrumpida; consultar proveedor' WHERE status='sending' AND attempted_at < now()-interval '5 minutes'",
  );
  const claimed = await store.query(
    "UPDATE dvy_email_deliveries SET status='sending',attempted_at=now() WHERE id IN(SELECT id FROM dvy_email_deliveries WHERE status='queued' AND (attempted_at IS NULL OR attempted_at<now()-interval '5 minutes') ORDER BY created_at LIMIT 30 FOR UPDATE SKIP LOCKED) RETURNING *",
  );
  for (const row of claimed.rows) {
    const account = await store.getAccount(row.owner_id);
    if (
      !account?.verified ||
      !account.settings.emailReminders ||
      !emailConfigured()
    ) {
      await store.query(
        "UPDATE dvy_email_deliveries SET status='cancelled' WHERE id=$1",
        [row.id],
      );
      continue;
    }
    const state = await store.readState(account.id);
    const current = dueNotifications(
      account,
      { ...state, notifications: [] },
      now,
    ).find((n) => n.dedupeKey === row.dedupe_key);
    if (!current) {
      await store.query(
        "UPDATE dvy_email_deliveries SET status='cancelled' WHERE id=$1",
        [row.id],
      );
      continue;
    }
    try {
      const id = await sendEmail(
        account.email,
        `DevuélveloYa · ${current.title}`,
        `${current.body}\n\nAbre tu espacio para revisar: ${appUrl().href}\n\nPuedes desactivar estos avisos en Ajustes.`,
      );
      await store.query(
        "UPDATE dvy_email_deliveries SET status='sent',provider_id=$2 WHERE id=$1",
        [row.id, id],
      );
    } catch (error) {
      await store.query(
        "UPDATE dvy_email_deliveries SET status=$2,last_error=$3 WHERE id=$1",
        [
          row.id,
          error instanceof EmailDeliveryError && error.retryable
            ? "queued"
            : "uncertain",
          error instanceof Error
            ? error.message.slice(0, 250)
            : "Error de entrega",
        ],
      );
    }
  }
  return count;
}
