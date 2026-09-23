import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicAddress,
  trustedUrl,
} from "../artifacts/api-server/src/dvy/safe-fetch.ts";

test("official link requests reject destinations outside the exact host allowlist", () => {
  const hosts = ["www.merchant.example", "returns.merchant.example"];
  assert.equal(
    trustedUrl("https://www.merchant.example/help/returns", hosts).hostname,
    "www.merchant.example",
  );
  for (const url of [
    "http://www.merchant.example/help",
    "https://www.merchant.example.attacker.test/",
    "https://attacker.test/?next=www.merchant.example",
    "https://user:password@www.merchant.example/",
    "https://www.merchant.example:8443/",
    "file:///etc/passwd",
    "https://127.0.0.1/",
    "https://[::1]/",
  ])
    assert.throws(
      () => trustedUrl(url, hosts),
      `Unexpected trusted URL: ${url}`,
    );
});

test("safe link fetch excludes private, local, metadata, and documentation IPv4 addresses", () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ]) {
    assert.equal(
      isPublicAddress(address),
      false,
      `Unexpected public IPv4: ${address}`,
    );
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("1.1.1.1"), true);
});

test("IPv6 spelling variants cannot bypass private or transition address exclusions", () => {
  for (const address of [
    "::",
    "::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "2001:db8::1",
    "2001:0db8::1",
    "2001:0000::1",
    "2001::1",
    "2002:7f00:0001::1",
  ]) {
    assert.equal(
      isPublicAddress(address),
      false,
      `Unexpected public IPv6: ${address}`,
    );
  }
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2001:4860:4860::8888"), true);
});
