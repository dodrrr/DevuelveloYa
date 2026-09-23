let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.method && options.method !== "GET"
          ? { "X-CSRF-Token": csrf }
          : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      "No podemos conectar. Comprueba tu conexión y vuelve a intentarlo.",
      0,
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      typeof result.error === "string"
        ? result.error
        : result.error?.message ||
            result.message ||
            `No se pudo completar la operación (${response.status}).`,
      response.status,
    );
  return result as T;
}
export async function filePayload(file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new Error(
      "El archivo supera los 8 MB. Elige una versión más pequeña.",
    );
  const mime =
    file.type ||
    (file.name.toLowerCase().endsWith(".eml")
      ? "message/rfc822"
      : file.name.toLowerCase().endsWith(".txt")
        ? "text/plain"
        : "");
  if (
    ![
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
      "message/rfc822",
    ].includes(mime)
  )
    throw new Error(
      "Elige un PDF, una imagen JPG, PNG, WebP o un archivo de texto.",
    );
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime, base64 };
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Ha ocurrido un error. Vuelve a intentarlo.";
