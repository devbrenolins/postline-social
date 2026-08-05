import type { Metadata } from "next";
import Link from "next/link";
import { Callout, List, PageTitle, Section } from "../_prose";
import { CONTACT_EMAIL, LAST_UPDATED } from "../_config";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Postline coleta, usa, compartilha e exclui os dados de quem usa a plataforma.",
};

export default function PrivacidadePage() {
  return (
    <>
      <PageTitle title="Política de Privacidade" updatedAt={LAST_UPDATED} />

      <Section title="Quem somos">
        <p>
          O Postline é uma plataforma de gestão de redes sociais que permite planejar, publicar e analisar
          conteúdo, além de responder mensagens e comentários do Instagram em um só lugar. Esta política
          explica quais dados tratamos e por quê.
        </p>
        <p>
          Responsável pelo tratamento: <strong>Postline</strong>. Contato:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section title="Dados que coletamos">
        <p>Dados que você fornece ao criar e usar a conta:</p>
        <List
          items={[
            "Nome e e-mail.",
            "Senha, guardada de forma criptografada pelo nosso provedor de autenticação — nunca em texto puro.",
            "Conteúdo que você cria: publicações, legendas, imagens e vídeos enviados, pastas, marcas/clientes cadastrados e anotações internas.",
          ]}
        />
        <p>Dados recebidos do Instagram, apenas depois de você autorizar a conexão:</p>
        <List
          items={[
            "Identificador, nome de usuário, foto e número de seguidores da conta profissional conectada.",
            "Token de acesso, usado para agir em seu nome dentro das permissões concedidas.",
            "Publicações da conta e suas métricas (alcance, curtidas, comentários, salvamentos, compartilhamentos).",
            "Comentários e mensagens diretas recebidas, para exibir na caixa de entrada e acionar as respostas automáticas que você configurar.",
          ]}
        />
        <p>
          Coletamos também dados técnicos básicos de funcionamento, como registros de erro e de acesso,
          usados para manter o serviço no ar e investigar falhas.
        </p>
      </Section>

      <Section title="Como usamos os dados">
        <List
          items={[
            "Operar a plataforma: autenticar você, exibir seu conteúdo e publicar nas redes conectadas.",
            "Mostrar métricas e relatórios das contas que você conectou.",
            "Enviar respostas automáticas no direct quando você cria uma regra e alguém aciona uma palavra-gatilho.",
            "Gerar roteiros, imagens e análises de tendência quando você solicita um recurso de inteligência artificial.",
            "Manter segurança, prevenir abuso e cumprir obrigações legais.",
          ]}
        />
        <p>
          Não vendemos seus dados. Não usamos o conteúdo das suas mensagens diretas para publicidade nem
          para treinar modelos próprios.
        </p>
      </Section>

      <Section title="Com quem compartilhamos">
        <p>
          Usamos prestadores de serviço que tratam dados apenas para nos permitir operar, sob contrato e
          nas nossas instruções:
        </p>
        <List
          items={[
            <><strong>Meta Platforms</strong> — integração com o Instagram (publicação, métricas, comentários e directs).</>,
            <><strong>Supabase</strong> — autenticação de contas e armazenamento dos arquivos de mídia.</>,
            <><strong>Neon</strong> — banco de dados da aplicação.</>,
            <><strong>Vercel</strong> — hospedagem e execução da aplicação.</>,
            <><strong>Google (Gemini)</strong> — geração de texto e pesquisa de tendências. Recebe apenas o briefing que você digita.</>,
            <><strong>Cloudflare e OpenAI</strong> — geração de imagens. Recebem apenas a descrição e as referências que você envia.</>,
          ]}
        />
        <p>
          Os recursos de inteligência artificial só são acionados por uma ação sua. Nada da sua caixa de
          entrada é enviado para esses provedores.
        </p>
      </Section>

      <Section title="Por quanto tempo guardamos">
        <p>
          Mantemos os dados enquanto sua conta existir. Itens excluídos dentro da plataforma vão para uma
          lixeira e podem ser recuperados por você; a exclusão definitiva remove o registro do nosso banco.
          Ao encerrar a conta, apagamos os dados conforme descrito na página de{" "}
          <Link href="/exclusao-de-dados" className="text-accent hover:underline">exclusão de dados</Link>.
        </p>
      </Section>

      <Section title="Seus direitos">
        <p>
          Você pode acessar, corrigir, exportar ou excluir seus dados, além de revogar a conexão com o
          Instagram a qualquer momento em Configurações — o que interrompe imediatamente a coleta e o envio
          de mensagens. Para exercer qualquer um desses direitos, escreva para{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>.
        </p>
        <Callout>
          Para apagar tudo o que guardamos sobre você, siga as instruções em{" "}
          <Link href="/exclusao-de-dados" className="font-medium text-accent hover:underline">
            Exclusão de dados
          </Link>.
        </Callout>
      </Section>

      <Section title="Segurança">
        <p>
          O tráfego é criptografado em trânsito, os tokens de acesso ficam restritos ao servidor e o acesso
          aos dados é isolado por workspace. Nenhum sistema é imune a incidentes; se ocorrer um que afete
          seus dados, avisaremos você e as autoridades competentes conforme a lei aplicável.
        </p>
      </Section>

      <Section title="Alterações nesta política">
        <p>
          Se houver mudança relevante, atualizamos a data no topo desta página e, quando o impacto for
          significativo, avisamos dentro da plataforma.
        </p>
      </Section>
    </>
  );
}
