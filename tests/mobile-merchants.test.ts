import assert from "node:assert/strict";
import test from "node:test";
import {
  findMerchant,
  resolveReturnUrl,
} from "../artifacts/devuelvelo-ya/utils/merchants.ts";
import { parseDate } from "../artifacts/devuelvelo-ya/utils/return-dates.ts";

test("recognizes store names and Spanish aliases without partial matches", () => {
  assert.equal(findMerchant("  ZARA ESPAÑA  ")?.name, "Zara");
  assert.equal(findMerchant("amazon.es")?.name, "Amazon");
  assert.equal(findMerchant("Amazon Marketplace otra tienda"), undefined);
  assert.equal(findMerchant("amazon.es.ejemplo.com"), undefined);
});
test("known stores always use their official destination", () => {
  assert.equal(
    resolveReturnUrl("Nike", "https://wrong-store.example"),
    "https://www.nike.com/es/help/a/como-hacer-devoluciones",
  );
  assert.equal(
    resolveReturnUrl("Zara"),
    "https://www.zara.com/es/es/help-center/HowToReturn",
  );
});
test("unknown stores retain valid manual destinations without inventing a link", () => {
  assert.equal(resolveReturnUrl("Mi tienda"), "");
  assert.equal(
    resolveReturnUrl("Mi tienda", "https://example.com/returns"),
    "https://example.com/returns",
  );
});
test("manual destinations reject executable URLs and embedded credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "https://",
    "https://user:password@example.com",
  ]) {
    assert.equal(resolveReturnUrl("Mi tienda", url), "");
  }
});
test("dates keep calendar days and reject impossible dates", () => {
  assert.equal(parseDate("2028-02-29"), "2028-02-29");
  assert.equal(parseDate("2026-02-29"), null);
  assert.equal(parseDate("31/04/2026"), null);
  assert.equal(parseDate("2026-10-24"), "2026-10-24");
});
