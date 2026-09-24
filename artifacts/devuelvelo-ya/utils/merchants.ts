// Official Spain return pages. Do not infer policy deadlines from store names.
export const merchants = [
  {
    name: "Amazon",
    aliases: ["amazon", "amazon.es"],
    url: "https://www.amazon.es/devoluciones",
  },
  {
    name: "Zara",
    aliases: ["zara", "zara españa"],
    url: "https://www.zara.com/es/es/help-center/HowToReturn",
  },
  {
    name: "Nike",
    aliases: ["nike", "nike.com"],
    url: "https://www.nike.com/es/help/a/como-hacer-devoluciones",
  },
  {
    name: "Zalando",
    aliases: ["zalando", "zalando.es"],
    url: "https://www.zalando.es/preguntas-frecuentes/Devolucion-y-reembolso/Devolucion-",
  },
  {
    name: "H&M",
    aliases: ["h&m", "h & m", "hm", "hennes & mauritz"],
    url: "https://www2.hm.com/es_es/service-clients/returns.html",
  },
  {
    name: "Mango",
    aliases: ["mango", "shop.mango.com"],
    url: "https://shop.mango.com/es/es/help/returns",
  },
] as const;

const normalize = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
export function findMerchant(store: string) {
  return merchants.find((merchant) =>
    merchant.aliases.some((alias) => normalize(alias) === normalize(store)),
  );
}
export function resolveReturnUrl(store: string, manualUrl = "") {
  const official = findMerchant(store)?.url;
  if (official) return official;
  try {
    const url = new URL(manualUrl.trim());
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}
