import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Postline — Gestão de redes sociais",
    short_name: "Postline",
    description:
      "Planeje, publique e analise suas redes sociais em um só lugar. Calendário, editor, analytics, caixa de entrada e IA.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0c0c0e",
    theme_color: "#B02A57",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Calendário", url: "/calendar", description: "Ver o calendário de publicações" },
      { name: "Caixa de Entrada", url: "/inbox", description: "Responder mensagens e comentários" },
      { name: "IA & Automação", url: "/studio", description: "Gerar roteiros e criativos" },
    ],
  };
}
