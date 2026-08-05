/**
 * Dados de contato das páginas legais.
 *
 * A Meta valida se a política de privacidade tem um canal de contato real, e o
 * mesmo endereço precisa bater com o do painel do app. Defina
 * `NEXT_PUBLIC_CONTACT_EMAIL` nas variáveis de ambiente — o valor abaixo é um
 * marcador proposital, para não publicar um e-mail inventado por engano.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "DEFINA_NEXT_PUBLIC_CONTACT_EMAIL";

export const LAST_UPDATED = "5 de agosto de 2026";
