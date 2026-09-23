import type {
  LinkResult,
  Merchant,
  Purchase,
} from "../../../../lib/domain/src/index";
import { safePublicGet } from "./safe-fetch";

// Each entry is a help/policy source, never a personal return authorization.
// Editorial verification: 2026-09-20; country/seller restrictions must remain visible.
export const REGISTRY_CHECKED_AT = "2026-09-20T00:00:00.000Z";
export const merchants: Merchant[] = [
  {
    id: "zara_es",
    name: "Zara",
    aliases: ["zara", "zara españa"],
    country: "ES",
    hosts: ["www.zara.com", "zara.com"],
    helpUrl: "https://www.zara.com/es/es/help-center/HowToReturn",
    scope:
      "Compras Zara España. Consulta las condiciones y el acceso para compra registrada o invitada.",
  },
  {
    id: "mango_es",
    name: "Mango",
    aliases: ["mango", "mango españa"],
    country: "ES",
    hosts: ["shop.mango.com"],
    helpUrl: "https://shop.mango.com/es/es/help/returns/online-returns",
    scope:
      "Compras online en España peninsular y Baleares. No aplica automáticamente a Mango Outlet.",
  },
  {
    id: "hm_es",
    name: "H&M",
    aliases: ["h&m", "h m", "hm", "hennes & mauritz"],
    country: "ES",
    hosts: ["www2.hm.com", "www.hm.com", "hm.com"],
    helpUrl: "https://www2.hm.com/es_es/customer-service/returns.html",
    scope:
      "Compras H&M España. Confirma el canal y las condiciones de marcas externas.",
  },
  {
    id: "ikea_es",
    name: "IKEA",
    aliases: ["ikea", "ikea españa"],
    country: "ES",
    hosts: ["www.ikea.com", "ikea.com"],
    helpUrl:
      "https://www.ikea.com/es/es/customer-service/returns-claims/return-policy/",
    scope:
      "Política de IKEA España. Consulta la versión aplicable a tu compra y territorio.",
  },
  {
    id: "decathlon_es",
    name: "Decathlon",
    aliases: ["decathlon", "decathlon españa"],
    country: "ES",
    hosts: ["www.decathlon.es", "decathlon.es"],
    helpUrl: "https://www.decathlon.es/es/lp/c/devoluciones-y-reembolsos",
    scope:
      "Compras en Decathlon España. Los vendedores de marketplace pueden tener otro procedimiento.",
  },
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
export function identifyMerchant(
  store: string,
  country = "ES",
): Merchant | undefined {
  const value = normalize(store);
  return merchants.find(
    (m) =>
      m.country === country &&
      m.aliases.some((alias) => normalize(alias) === value),
  );
}
export function identifyMerchantInText(text: string): Merchant | undefined {
  const norm = normalize(text);
  return merchants.find(
    (m) =>
      m.hosts.some((host) => text.toLowerCase().includes(host)) ||
      m.aliases.some((a) => ` ${norm} `.includes(` ${normalize(a)} `)),
  );
}
export async function resolveReturnLink(
  p: Pick<Purchase, "store" | "country" | "seller" | "merchantId">,
): Promise<LinkResult> {
  const m = identifyMerchant(p.store, p.country);
  if (m) {
    const sellerMismatch =
      p.seller &&
      normalize(p.seller) !== normalize(p.store) &&
      !m.aliases.some((a) => normalize(a) === normalize(p.seller));
    let checkedAt = REGISTRY_CHECKED_AT;
    let live = false;
    try {
      const response = await safePublicGet(m.helpUrl, m.hosts);
      live =
        response.status >= 200 &&
        response.status < 300 &&
        /text\/(?:html|plain)/i.test(response.contentType);
      if (live) checkedAt = new Date().toISOString();
    } catch {
      /* Keep the explicit editorial provenance when live site blocks automated access. */
    }
    return {
      status: sellerMismatch ? "needs_review" : "resolved",
      merchantId: m.id,
      url: m.helpUrl,
      host: new URL(m.helpUrl).hostname,
      kind: "policy",
      label: "Abrir ayuda oficial de devoluciones",
      explanation: `${m.scope} ${sellerMismatch ? "El vendedor registrado es distinto: confirma que este procedimiento le corresponde. " : ""}${live ? "Página accesible ahora; revisa las condiciones de tu pedido." : "Fuente oficial revisada el 20/09/2026; no se pudo confirmar su disponibilidad ahora."} Esta página no inicia una devolución.`,
      checkedAt,
      sourceUrl: m.helpUrl,
      verified: true,
    };
  }
  if (!process.env.BRAVE_SEARCH_API_KEY)
    return {
      status: "not_found",
      merchantId: null,
      url: null,
      host: null,
      kind: null,
      label: "Tienda pendiente de identificar",
      explanation:
        "No hay una fuente oficial registrada para esta tienda y región. Añade la tienda exacta o consulta la ayuda desde tu pedido. La búsqueda web requiere configuración.",
      checkedAt: null,
      sourceUrl: null,
      verified: false,
    };
  // Search contains only a sanitized store label + region, never order IDs or personal information.
  const label = p.store.replace(/[^\p{L}\p{N} &.'-]/gu, " ").slice(0, 70);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `${label} ${p.country} devoluciones sitio oficial`);
  url.searchParams.set("count", "3");
  try {
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error("Search unavailable");
    const data = (await res.json()) as {
      web?: { results?: { url: string }[] };
    };
    const candidate = data.web?.results?.find((r) => {
      try {
        const u = new URL(r.url);
        return u.protocol === "https:" && !u.username && !u.password && !u.port;
      } catch {
        return false;
      }
    });
    if (!candidate)
      return {
        status: "not_found",
        merchantId: null,
        url: null,
        host: null,
        kind: null,
        label: "No se encontró una fuente",
        explanation: "Abre el pedido original y comprueba su sección de ayuda.",
        checkedAt: new Date().toISOString(),
        sourceUrl: null,
        verified: false,
      };
    return {
      status: "needs_review",
      merchantId: null,
      url: candidate.url,
      host: new URL(candidate.url).hostname,
      kind: "support",
      label: "Revisar resultado de búsqueda",
      explanation:
        "Resultado de búsqueda sin verificar. Comprueba el dominio desde tu pedido original antes de introducir datos. La app no ha abierto ni validado este destino.",
      checkedAt: new Date().toISOString(),
      sourceUrl: null,
      verified: false,
    };
  } catch {
    return {
      status: "unavailable",
      merchantId: null,
      url: null,
      host: null,
      kind: null,
      label: "Búsqueda temporalmente no disponible",
      explanation:
        "Puedes volver a intentarlo o abrir la ayuda de la tienda desde tu pedido.",
      checkedAt: null,
      sourceUrl: null,
      verified: false,
    };
  }
}
