import type { Metadata } from "next";
import Link from "next/link";
import { List, PageTitle, Section } from "../_prose";
import { CONTACT_EMAIL, LAST_UPDATED } from "../_config";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso da plataforma Postline.",
};

export default function TermosPage() {
  return (
    <>
      <PageTitle title="Termos de Uso" updatedAt={LAST_UPDATED} />

      <Section title="Aceitação">
        <p>
          Ao criar uma conta ou usar o Postline você concorda com estes termos e com a{" "}
          <Link href="/privacidade" className="text-accent hover:underline">Política de Privacidade</Link>.
          Se não concordar, não use a plataforma.
        </p>
      </Section>

      <Section title="O que o Postline faz">
        <p>
          O Postline permite agendar e publicar conteúdo, acompanhar métricas, organizar uma biblioteca de
          mídia, responder comentários e mensagens do Instagram e configurar respostas automáticas no
          direct. Alguns recursos usam inteligência artificial para gerar rascunhos de texto e imagem.
        </p>
      </Section>

      <Section title="Sua conta">
        <List
          items={[
            "Você é responsável por manter suas credenciais em segurança e por tudo que acontece na sua conta.",
            "Os dados cadastrais devem ser verdadeiros e mantidos atualizados.",
            "Você precisa ter idade legal para contratar no seu país.",
          ]}
        />
      </Section>

      <Section title="Contas de redes sociais conectadas">
        <p>
          Ao conectar uma conta do Instagram você autoriza o Postline a agir em seu nome dentro das
          permissões concedidas. Você garante que é titular da conta ou tem autorização de quem é. A conexão
          pode ser revogada a qualquer momento em Configurações ou pelo próprio Instagram.
        </p>
        <p>
          O uso das contas conectadas também está sujeito às regras da Meta. Você é responsável por respeitar
          essas regras — em especial no uso de mensagens automáticas, que não podem ser usadas para spam,
          engano ou envio não solicitado.
        </p>
      </Section>

      <Section title="Seu conteúdo">
        <p>
          O conteúdo que você envia continua sendo seu. Você nos concede apenas a licença necessária para
          armazenar, processar e publicar esse conteúdo nas redes que você conectou, enquanto usar o serviço.
        </p>
        <p>
          Você declara ter os direitos sobre o que envia e assume a responsabilidade por ele, inclusive por
          material gerado com auxílio de inteligência artificial e publicado a partir da plataforma.
        </p>
      </Section>

      <Section title="Uso aceitável">
        <p>Não é permitido usar o Postline para:</p>
        <List
          items={[
            "Enviar spam, mensagens em massa não solicitadas ou conteúdo enganoso.",
            "Publicar material ilegal, que viole direitos de terceiros ou as políticas das redes conectadas.",
            "Tentar burlar limites técnicos, acessar dados de outros usuários ou interferir no funcionamento do serviço.",
            "Revender ou redistribuir a plataforma sem autorização por escrito.",
          ]}
        />
      </Section>

      <Section title="Recursos de inteligência artificial">
        <p>
          Os textos e imagens gerados por IA são rascunhos e podem conter erros ou imprecisões. Revise antes
          de publicar. Os recursos têm limites diários de uso, indicados na própria tela, e dependem de
          serviços de terceiros — podendo ficar indisponíveis temporariamente.
        </p>
      </Section>

      <Section title="Disponibilidade e alterações">
        <p>
          Buscamos manter o serviço disponível, mas ele é fornecido &ldquo;como está&rdquo;, sem garantia de
          operação ininterrupta. Podemos alterar, suspender ou encerrar recursos, avisando com antecedência
          razoável quando a mudança for relevante.
        </p>
      </Section>

      <Section title="Encerramento">
        <p>
          Você pode encerrar sua conta quando quiser, conforme a página de{" "}
          <Link href="/exclusao-de-dados" className="text-accent hover:underline">exclusão de dados</Link>.
          Podemos suspender contas que violem estes termos, com aviso sempre que possível.
        </p>
      </Section>

      <Section title="Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei aplicável, o Postline não responde por danos indiretos,
          lucros cessantes ou perda de dados decorrentes do uso da plataforma ou da indisponibilidade de
          serviços de terceiros integrados.
        </p>
      </Section>

      <Section title="Lei aplicável e contato">
        <p>
          Estes termos são regidos pelas leis do Brasil. Dúvidas podem ser enviadas para{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </>
  );
}
