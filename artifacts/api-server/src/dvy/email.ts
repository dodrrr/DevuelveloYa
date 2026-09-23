import type { Account } from "../../../../lib/domain/src/index";
export function emailConfigured(): boolean {
  return !!(
    process.env.POSTMARK_SERVER_TOKEN &&
    process.env.POSTMARK_FROM &&
    process.env.APP_URL
  );
}
export function appUrl(): URL {
  if (!process.env.APP_URL) throw new Error("APP_URL no configurada");
  const url = new URL(process.env.APP_URL);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("APP_URL debe ser una URL HTTPS pública");
  url.search = "";
  url.hash = "";
  return url;
}
/** A timeout may mean the provider accepted the message. The durable outbox records
 * an uncertain delivery instead of blindly retrying and sending duplicate email. */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  if (!emailConfigured())
    throw new EmailDeliveryError("Correo no configurado", false);
  let response: Response;
  try {
    response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN!,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM,
        To: to,
        Subject: subject.slice(0, 200),
        TextBody: body,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
        TrackOpens: false,
        TrackLinks: "None",
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EmailDeliveryError(
      "Entrega incierta: comprueba el proveedor antes de reenviar",
      false,
    );
  }
  if (!response.ok)
    throw new EmailDeliveryError(
      "El proveedor no aceptó el correo",
      response.status === 429,
    );
  const result = (await response.json()) as {
    ErrorCode?: number;
    MessageID?: string;
  };
  if (result.ErrorCode !== 0 || !result.MessageID)
    throw new EmailDeliveryError("El proveedor rechazó el correo", false);
  return result.MessageID;
}
export async function sendAccountEmail(
  account: Account,
  kind: "verify" | "reset",
  token: string,
): Promise<void> {
  const url = appUrl();
  url.searchParams.set(kind === "verify" ? "verify" : "reset", token);
  const title =
    kind === "verify"
      ? "Confirma tu email en DevuélveloYa"
      : "Restablece tu contraseña de DevuélveloYa";
  await sendEmail(
    account.email,
    title,
    `${title}\n\nAbre este enlace para continuar:\n${url.href}\n\nSi no solicitaste esta acción, puedes ignorar este mensaje. No compartas este enlace.`,
  );
}
