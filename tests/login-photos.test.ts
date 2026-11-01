import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { LOGIN_PHOTO_GROUPS } from "../src/lib/login-photos";

test("vitrine do login: 10+ grupos de 6 fotos, todas existem em /public", () => {
  assert.ok(LOGIN_PHOTO_GROUPS.length >= 10);
  for (const group of LOGIN_PHOTO_GROUPS) {
    assert.equal(group.length, 6);
    for (const src of group) assert.ok(existsSync(`public${src}`), `faltando public${src}`);
  }
});

test("nenhuma foto se repete entre grupos", () => {
  const all = LOGIN_PHOTO_GROUPS.flat();
  assert.equal(new Set(all).size, all.length);
});
