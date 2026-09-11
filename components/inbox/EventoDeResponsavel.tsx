"use client";

import { format } from "date-fns";

import { useUser } from "@/hooks/auth/AuthProvider";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { AssignmentEvent } from "@/hooks/inbox/useConversationAssignmentEvents";
import { ArrowRight, Robot, Signpost, UserCircle } from "@/lib/ui/icons";

interface Props {
  evento: AssignmentEvent;
}

/**
 * "Fulano assumiu esta conversa" — a linha do sistema no meio do thread.
 *
 * ## Por que existe
 *
 * Duas pessoas com a mesma conversa aberta é o caso normal num time, e até aqui
 * nada na TELA DA CONVERSA dizia que alguém tinha assumido: o registro existia em
 * `conversation_assignment_events` (auditoria, sem leitor) e na linha do tempo do
 * CRM — que só nasce quando há negócio aberto, ou seja, quase nunca no começo de
 * um atendimento. Quem chegava depois respondia por cima do colega.
 *
 * ## Por que NÃO parece uma nota interna
 *
 * O dono pediu "tipo a nota interna". O formato é o mesmo — bloco centrado no meio
 * do thread —, mas o PESO é deliberadamente menor: a nota é texto que uma pessoa
 * escreveu e que outra precisa LER; isto é um fato do sistema, que se reconhece de
 * relance e não se lê duas vezes. Com o mesmo âmbar da nota, uma conversa com
 * quatro trocas de responsável viraria uma parede amarela e a nota de verdade —
 * a que alguém escreveu — perderia o destaque que ela tem hoje.
 *
 * É o mesmo raciocínio do WhatsApp para "Fulano entrou no grupo": centrado,
 * pequeno, cinza.
 */
export function EventoDeResponsavel({ evento }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const eu = useUser();
  const hora = format(new Date(evento.created_at), "HH:mm", { locale: localeDaData });

  const conteudo = descrever(evento, t, eu.id);
  // `routing` sem nome não diz nada a ninguém ("alguém foi designado por alguém").
  // Sumir com a linha é melhor que uma linha vazia de informação.
  if (!conteudo) return null;

  return (
    <div className="flex w-full justify-center px-4 py-1">
      <div
        className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-black/[0.06] px-3 py-1 text-[11px] text-muted-foreground dark:bg-white/[0.08]"
        data-testid="evento-de-responsavel"
      >
        {conteudo.icone}
        <span className="truncate">{conteudo.texto}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums opacity-80">{hora}</span>
      </div>
    </div>
  );
}

/**
 * O texto de cada motivo.
 *
 * `reason` vem da constraint da tabela (`claim | transfer | release | routing |
 * handoff | sector_menu | sector_transfer`) — os sete estão cobertos, e o
 * `default` devolve `null` em vez de um texto genérico: motivo novo que ninguém
 * traduziu deve SUMIR, não aparecer como "conversa atualizada", que é ruído com
 * aparência de informação.
 */
function descrever(
  e: AssignmentEvent,
  t: (texto: string) => string,
  meuId: string,
): { texto: string; icone: React.ReactNode } | null {
  /**
   * "VOCÊ" ANTES DO NOME, e não como último recurso.
   *
   * Medido na instalação do dono: o usuário dele não tem `full_name` no
   * cadastro, então `nomesDosAtendentes` devolve `null` e a linha saía como
   * "Alguém do time assumiu esta conversa" — para uma ação que ele mesmo tinha
   * acabado de fazer. A tela sabia quem era e dizia que não sabia.
   *
   * Preencher o nome no perfil resolve o caso dele; isto resolve a CLASSE, e é
   * o que qualquer aplicativo de conversa faz: para quem agiu, a primeira
   * pessoa lê melhor que o próprio nome, mesmo quando o nome existe.
   */
  const nomeDe = (userId: string | null, nome: string | null): string | null => {
    if (userId && userId === meuId) return t("Você");
    return nome;
  };
  const quemEntrou = nomeDe(e.to_user_id, e.to_user_name);
  const quemSaiu = nomeDe(e.from_user_id, e.from_user_name);

  switch (e.reason) {
    case "claim":
      // Sem nome (instalação sem service role) o fato ainda vale: a pessoa
      // precisa saber que a conversa TEM dono, mesmo sem saber quem.
      return {
        texto: quemEntrou
          ? `${quemEntrou} ${t("assumiu esta conversa")}`
          : t("Alguém do time assumiu esta conversa"),
        icone: <UserCircle size={12} weight="fill" aria-hidden />,
      };
    case "transfer":
      return {
        texto:
          quemSaiu && quemEntrou
            ? `${quemSaiu} ${t("transferiu para")} ${quemEntrou}`
            : quemEntrou
              ? `${t("Transferida para")} ${quemEntrou}`
              : t("Conversa transferida"),
        icone: <ArrowRight size={12} weight="bold" aria-hidden />,
      };
    case "release":
      return {
        texto: quemSaiu
          ? `${quemSaiu} ${t("liberou esta conversa")}`
          : t("A conversa voltou para a fila"),
        icone: <UserCircle size={12} weight="regular" aria-hidden />,
      };
    case "routing":
      // Distribuição automática: quem importa é para QUEM foi. Sem o nome não
      // sobra informação nenhuma — daí o `null`.
      return quemEntrou
        ? {
            texto: `${t("Distribuída para")} ${quemEntrou}`,
            icone: <ArrowRight size={12} weight="bold" aria-hidden />,
          }
        : null;
    case "handoff":
      return {
        texto: quemEntrou
          ? `${t("O automático passou para")} ${quemEntrou}`
          : t("O automático passou para uma pessoa"),
        icone: <Robot size={12} weight="duotone" aria-hidden />,
      };
    case "sector_menu":
      // O CLIENTE escolheu no menu de primeiro contato. Sem o nome do setor
      // (apagado? cache antigo?) a linha não diz nada — `null`.
      return e.to_sector_name
        ? {
            texto: `${t("O cliente escolheu o setor")} ${e.to_sector_name}`,
            icone: <Signpost size={12} weight="fill" aria-hidden />,
          }
        : null;
    case "sector_transfer": {
      const quem = nomeDe(e.changed_by, e.changed_by_name);
      if (!e.to_sector_name) {
        return {
          texto: quem ? `${quem} ${t("tirou a conversa do setor")}` : t("A conversa saiu do setor"),
          icone: <Signpost size={12} weight="regular" aria-hidden />,
        };
      }
      return {
        texto: quem
          ? `${quem} ${t("transferiu para o setor")} ${e.to_sector_name}`
          : `${t("Transferida para o setor")} ${e.to_sector_name}`,
        icone: <Signpost size={12} weight="fill" aria-hidden />,
      };
    }
    default:
      return null;
  }
}
