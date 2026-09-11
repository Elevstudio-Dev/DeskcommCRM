/**
 * O MENU DE PRIMEIRO CONTATO — o lado que toca o banco e o canal.
 *
 * A regra é `lib/setores/menu.ts` (pura). Aqui: ler o que a decisão precisa,
 * decidir, e executar — mandar o texto, gravar a memória do menu em
 * `conversations.metadata.menu_setores`, pôr a conversa no setor pela única
 * porta (`fn_conversation_set_sector`) e acordar o rodízio do setor.
 *
 * ─── Sem nome de provedor ───────────────────────────────────────────────────
 *
 * O texto sai por `sendMessageHandler`, o mesmo caminho do composer e das
 * automações: quem resolve o transporte é o adapter do canal da conversa. Este
 * arquivo não sabe se é WhatsApp por QR, oficial ou Instagram — e não pode
 * saber (doutrina de canal, `lint:channels`).
 *
 * ─── Nada aqui derruba a ingestão ───────────────────────────────────────────
 *
 * A mensagem do cliente JÁ está gravada quando isto roda. Qualquer erro vira
 * log e a resposta é "não segure o agente" — o pior desfecho de uma falha
 * aqui é a conversa seguir sem menu, que é o comportamento de antes.
 */
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { logger } from "@/lib/logger";
import { lerConfiguracaoDeSetores } from "@/lib/schemas/setores";
import type { createAdminClient } from "@/lib/supabase/admin";

import { decidirMenu, lerEstadoDoMenu, type EstadoDoMenu, type SetorDoMenu } from "./menu";

type Admin = ReturnType<typeof createAdminClient>;

export interface EntradaParaOMenu {
  organizationId: string;
  conversationId: string;
  texto: string | null;
  requestId?: string;
}

export interface ResultadoDoMenu {
  /**
   * `true` = esta mensagem foi consumida pelo menu (é a pergunta, a resposta,
   * ou o lembrete): o agente de IA NÃO deve responder a ela. A escolha de setor
   * vem antes de qualquer atendimento — e "2" não é uma pergunta para a IA.
   */
  segurarAgente: boolean;
  decisao: string;
}

const ATOR = { type: "webhook_source" as const, id: "menu_setores" };

export async function aplicarMenuDeSetores(admin: Admin, entrada: EntradaParaOMenu): Promise<ResultadoDoMenu> {
  const base = { organization_id: entrada.organizationId, conversation_id: entrada.conversationId };
  try {
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", entrada.organizationId)
      .maybeSingle();
    const config = lerConfiguracaoDeSetores(org?.settings ?? null);
    // Atalho barato: a maioria das organizações não tem menu. Sem ele, nem a
    // conversa nem os setores precisam ser lidos.
    if (!config.menu_ativo) return { segurarAgente: false, decisao: "menu_desligado" };

    const [{ data: conv }, { data: setores }] = await Promise.all([
      admin
        .from("conversations")
        .select("sector_id, assigned_to_user_id, is_group, status, last_outbound_at, metadata")
        .eq("organization_id", entrada.organizationId)
        .eq("id", entrada.conversationId)
        .maybeSingle(),
      admin
        .from("sectors")
        .select("id, name, position")
        .eq("organization_id", entrada.organizationId)
        .is("archived_at", null),
    ]);
    if (!conv) return { segurarAgente: false, decisao: "conversa_nao_encontrada" };

    const metadata = (conv.metadata as Record<string, unknown> | null) ?? {};
    const decisao = decidirMenu({
      config,
      setores: (setores ?? []) as SetorDoMenu[],
      conversa: {
        sector_id: conv.sector_id as string | null,
        assigned_to_user_id: conv.assigned_to_user_id as string | null,
        is_group: Boolean(conv.is_group),
        status: String(conv.status),
        last_outbound_at: conv.last_outbound_at as string | null,
        menu: lerEstadoDoMenu(metadata),
      },
      texto: entrada.texto,
      agora: new Date(),
    });

    const agora = new Date().toISOString();
    const gravarMenu = async (menu: EstadoDoMenu) => {
      const { error } = await admin
        .from("conversations")
        .update({ metadata: { ...metadata, menu_setores: menu } })
        .eq("organization_id", entrada.organizationId)
        .eq("id", entrada.conversationId);
      if (error) throw new Error(`metadata.menu_setores: ${error.message}`);
    };
    const enviar = async (body: string) => {
      await sendMessageHandler(
        admin,
        { organization_id: entrada.organizationId, actor: ATOR, requestId: entrada.requestId ?? `menu:${entrada.conversationId}` },
        { conversation_id: entrada.conversationId, type: "text", body },
      );
    };
    const porNoSetor = async (sectorId: string) => {
      const { error } = await admin.rpc("fn_conversation_set_sector" as never, {
        p_organization_id: entrada.organizationId,
        p_conversation_id: entrada.conversationId,
        p_sector_id: sectorId,
        p_reason: "sector_menu",
      } as never);
      if (error) throw new Error(`fn_conversation_set_sector: ${error.message}`);
      // O rodízio do SETOR. O gatilho de INSERT já emitiu um `routing_requested`
      // quando a conversa nasceu, e o worker o segurou (menu aguardando) —
      // este é o que o worker vai atender.
      const { error: emitErr } = await admin.rpc("emit_event" as never, {
        p_event_type: "conversation.routing_requested",
        p_entity_kind: "conversation",
        p_entity_id: entrada.conversationId,
        p_payload: base,
        p_metadata: { source: "menu_setores", request_id: entrada.requestId },
        p_organization_id: entrada.organizationId,
      } as never);
      if (emitErr) {
        logger.warn("menu de setores: routing_requested não emitido (a conversa fica na fila do setor)", {
          ...base,
          detail: emitErr.message.slice(0, 160),
        });
      }
    };

    switch (decisao.tipo) {
      case "nada":
        return { segurarAgente: false, decisao: decisao.motivo };

      case "enviar_menu": {
        // A memória ANTES do envio: se o envio falhar depois de gravada, a
        // próxima mensagem do cliente ainda é lida como resposta ao menu — e
        // sem lembrete o pior caso é cair no setor padrão. Gravar depois
        // deixaria um menu enviado que ninguém lembra de ter enviado.
        await gravarMenu({ estado: "aguardando", enviado_em: agora, opcoes: decisao.opcoes, lembretes: 0 });
        await enviar(decisao.texto);
        logger.info("menu de setores: enviado", { ...base, opcoes: decisao.opcoes.length });
        return { segurarAgente: true, decisao: "enviar_menu" };
      }

      case "escolhido": {
        await porNoSetor(decisao.sector_id);
        await gravarMenu({ estado: "resolvido", resultado: "escolhido", sector_id: decisao.sector_id, em: agora });
        await enviar(decisao.texto);
        logger.info("menu de setores: cliente escolheu", { ...base, sector_id: decisao.sector_id });
        return { segurarAgente: true, decisao: "escolhido" };
      }

      case "lembrar": {
        const menu = lerEstadoDoMenu(metadata);
        if (menu?.estado === "aguardando") await gravarMenu({ ...menu, lembretes: menu.lembretes + 1 });
        await enviar(decisao.texto);
        return { segurarAgente: true, decisao: "lembrar" };
      }

      case "padrao": {
        if (decisao.sector_id) await porNoSetor(decisao.sector_id);
        await gravarMenu({
          estado: "resolvido",
          resultado: decisao.sector_id ? "padrao" : "sem_setor",
          sector_id: decisao.sector_id,
          em: agora,
        });
        logger.info("menu de setores: sem resposta válida, caiu no padrão", {
          ...base,
          sector_id: decisao.sector_id,
        });
        // A mensagem do cliente não era resposta ao menu — era o que ele queria
        // dizer. Daqui em diante a conversa é normal, e a IA pode responder.
        return { segurarAgente: false, decisao: "padrao" };
      }
    }
  } catch (err) {
    logger.warn("menu de setores: falhou (a conversa segue sem menu)", {
      ...base,
      detail: err instanceof Error ? err.message.slice(0, 200) : "desconhecido",
    });
    return { segurarAgente: false, decisao: "erro" };
  }
}
