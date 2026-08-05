import type { Metadata } from "next";
import { Callout, List, PageTitle, Section } from "../_prose";
import { CONTACT_EMAIL, LAST_UPDATED } from "../_config";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description: "Como pedir a exclusão dos seus dados do Postline.",
};

export default function ExclusaoDeDadosPage() {
  return (
    <>
      <PageTitle title="Exclusão de dados" updatedAt={LAST_UPDATED} />

      <Section title="Como pedir a exclusão">
        <p>
          Você pode remover seus dados do Postline de duas formas. Em qualquer uma delas, a exclusão é
          definitiva.
        </p>
      </Section>

      <Section title="1. Pela plataforma">
        <List
          items={[
            "Entre na sua conta e vá em Configurações.",
            "Em “Contas conectadas”, desconecte o Instagram — isso revoga o token e interrompe na hora a coleta de comentários e mensagens.",
            "Ainda em Configurações, use “Excluir conta” para apagar o workspace e todo o conteúdo associado.",
          ]}
        />
      </Section>

      <Section title="2. Pelo Instagram">
        <p>
          Se você removeu o Postline direto nas configurações do Instagram, a Meta nos notifica
          automaticamente e nós apagamos os dados vinculados àquela conta — token de acesso, publicações
          sincronizadas, métricas, comentários e mensagens recebidas.
        </p>
      </Section>

      <Section title="3. Por e-mail">
        <Callout>
          Escreva para{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent hover:underline">{CONTACT_EMAIL}</a>{" "}
          com o assunto <strong>&ldquo;Exclusão de dados&rdquo;</strong>, informando o e-mail da conta e, se
          houver, o @ do perfil conectado. Respondemos em até 30 dias.
        </Callout>
      </Section>

      <Section title="O que é apagado">
        <List
          items={[
            "Cadastro: nome, e-mail e credenciais de acesso.",
            "Conteúdo: publicações, legendas, arquivos da biblioteca, marcas/clientes e anotações.",
            "Integrações: tokens de acesso e dados das contas conectadas.",
            "Dados recebidos do Instagram: publicações sincronizadas, métricas, comentários e mensagens diretas.",
            "Regras de automação e histórico de gerações por inteligência artificial.",
          ]}
        />
        <p>
          O pedido é processado em até 30 dias. Podemos reter por mais tempo apenas o mínimo exigido por lei
          — por exemplo, registros fiscais ou de segurança — sempre de forma isolada e sem uso comercial.
        </p>
      </Section>

      <Section title="Importante">
        <p>
          A exclusão apaga os dados dos nossos sistemas. Publicações que já foram ao ar no Instagram
          continuam no Instagram: para removê-las, use o próprio aplicativo da rede.
        </p>
      </Section>
    </>
  );
}
