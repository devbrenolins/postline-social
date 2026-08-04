import type { NextConfig } from "next";

// ATENÇÃO ao mexer na versão do sharp: o `package.json` fixa **0.34.5** de
// propósito. O 0.35.x quebra na Vercel com "ERR_DLOPEN_FAILED:
// libvips-cpp.so.8.18.3" — build e deploy passam, só o runtime falha
// (lovell/sharp#4567, mesma combinação de Next 16 + Vercel). O 0.34.5 também é
// a versão que o próprio Next.js instala, então a árvore fica com uma cópia só.
// Os caminhos abaixo assumem `node_modules` achatado (`node-linker=hoisted` no
// `.npmrc`). Não apontar para dentro de `node_modules/.pnpm/`: aquilo é
// diretório symlinkado e a Vercel recusa o pacote da função com "invalid
// deployment package ... files in symlinked directories".
const SHARP_NATIVE = ["./node_modules/@img/sharp-libvips-linux-x64/lib/**"];

// O sharp traz um libvips por arquitetura (~15 MB cada) e o rastreador leva
// todos, o que já levou o bundle a 292 MB — acima do limite de 250 MB da
// Vercel. Ela roda linux-x64 com glibc, então o resto é peso morto.
const FOREIGN_ARCHES = [
  "darwin-arm64", "darwin-x64", "win32-arm64", "win32-ia32", "win32-x64",
  "linux-arm", "linux-arm64", "linux-ppc64", "linux-riscv64", "linux-s390x",
  "linuxmusl-arm64", "linuxmusl-x64",
];
const SHARP_FOREIGN = FOREIGN_ARCHES.flatMap((arch) => [
  `./node_modules/@img/sharp-${arch}/**`,
  `./node_modules/@img/sharp-libvips-${arch}/**`,
]);

const nextConfig: NextConfig = {
  // sharp usa binários nativos (.node) que não podem ser empacotados na função
  // serverless — precisa ser tratado como pacote externo para carregar em runtime.
  serverExternalPackages: ["sharp"],

  // Arquivos que o rastreador do Next NÃO descobre sozinho, porque não são
  // alcançados por `require`:
  //
  // 1. `libvips-cpp.so` — o binário .node do sharp carrega essa biblioteca pelo
  //    linker do sistema (dlopen), não por import, então o trace leva o
  //    `index.js` do pacote e deixa o `.so` para trás. Os dois caminhos cobrem
  //    o layout isolado do pnpm e o achatado (npm/hoisted).
  // 2. `fonts/` — a Inter é lida por caminho via fontconfig ao compor o texto do
  //    criativo. O runtime da Vercel não traz fontes, então sem isto o texto
  //    sairia em branco.
  outputFileTracingIncludes: {
    "/api/studio": [...SHARP_NATIVE, "./fonts/**"],
    "/api/media/upload": SHARP_NATIVE,
  },

  outputFileTracingExcludes: {
    "**": SHARP_FOREIGN,
  },
};

export default nextConfig;
