/**
 * Confere a leitura do `signed_request` da Meta contra um payload assinado
 * localmente. Uso: `pnpm tsx scripts/check-signed-request.ts`
 */
import { createHmac } from "crypto";
import { parseSignedRequest } from "../src/lib/meta";

// O segredo é lido dentro da função, então basta definir antes de chamar.
process.env.INSTAGRAM_APP_SECRET = "segredo-de-teste";

function sign(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest().toString("base64url");
  return `${sig}.${encoded}`;
}

const cases: [string, string | null][] = [
  ["assinatura valida", sign({ user_id: "17841400000000000", algorithm: "HMAC-SHA256" }, "segredo-de-teste")],
  ["segredo errado", sign({ user_id: "17841400000000000" }, "outro-segredo")],
  ["lixo", "abc.def"],
  ["sem ponto", "semponto"],
];

for (const [label, input] of cases) {
  console.log(label.padEnd(20), "->", JSON.stringify(parseSignedRequest(input!)));
}
