import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "../src/lib/secret";

test("sem chave, o valor passa em texto puro e lê de volta", () => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  assert.equal(decryptSecret(encryptSecret("abc")), "abc");
});

test("com chave, cifra, não vaza o texto e decifra", () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const enc = encryptSecret("token-secreto");
  assert.ok(enc.startsWith("enc:v1:"));
  assert.ok(!enc.includes("token-secreto"));
  assert.equal(decryptSecret(enc), "token-secreto");
});

test("token legado em texto puro continua legível com chave ativa", () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.equal(decryptSecret("IGAAlegado123"), "IGAAlegado123");
});

test("adulterar o conteúdo cifrado falha", () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const enc = encryptSecret("x");
  const parts = enc.split(":");
  parts[4] = Buffer.from("zzzz").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(":")));
});
