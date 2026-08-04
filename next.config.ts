import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp usa binários nativos (.node) que não podem ser empacotados na função
  // serverless — precisa ser tratado como pacote externo para carregar em runtime.
  serverExternalPackages: ["sharp"],

  // A fonte que compõe o texto do criativo é lida por caminho em runtime (via
  // fontconfig), então o rastreador do Next não a enxerga sozinho. Sem isto o
  // texto sai em branco na Vercel, cujo runtime não traz fontes próprias.
  outputFileTracingIncludes: {
    "/api/studio": ["./fonts/**"],
  },
};

export default nextConfig;
