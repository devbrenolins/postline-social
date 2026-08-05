/**
 * Dados de contato das páginas legais.
 *
 * A Meta valida se a política de privacidade tem um canal de contato real, e o
 * mesmo endereço precisa bater com o do painel do app. Dá para sobrescrever por
 * `NEXT_PUBLIC_CONTACT_EMAIL` sem alterar o código.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contato@infusesoftware.com";

export const LAST_UPDATED = "5 de agosto de 2026";
