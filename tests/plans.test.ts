import test from "node:test";
import assert from "node:assert/strict";
import { PLANS, UNLIMITED, planOf, withinLimit } from "../src/lib/plans";

test("plano desconhecido cai no teste", () => {
  assert.equal(planOf("free").id, "trial");
  assert.equal(planOf(null).id, "trial");
});

test("limites: dentro, no teto e ilimitado", () => {
  assert.equal(withinLimit(9, PLANS.pro.limits.clients), true);
  assert.equal(withinLimit(10, PLANS.pro.limits.clients), false);
  assert.equal(withinLimit(10_000, UNLIMITED), true);
});
