import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Postline — Gestão de redes sociais", template: "%s · Postline" },
  description:
    "Planeje, publique e analise suas redes sociais em um só lugar. Calendário inteligente, editor com pré-visualização, analytics e muito mais.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh font-sans text-[15px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
