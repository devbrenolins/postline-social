import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp usa binários nativos (.node) que não podem ser empacotados na função
  // serverless — precisa ser tratado como pacote externo para carregar em runtime.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
