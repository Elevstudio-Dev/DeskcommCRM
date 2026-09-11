import { z } from "zod";

import { CORES_DE_MARCADOR, COR_DE_MARCADOR_PADRAO } from "@/lib/schemas/settings";

/**
 * Setores — o vocabulário da API e da configuração.
 *
 * Um setor é um grupo de pessoas que atende junto (Assistência, Financeiro,
 * Recepção). A conversa aponta para um setor (`conversations.sector_id`) e quem
 * está no setor vê a fila dele. Tabelas e RLS: migration 0213.
 */

export const setorCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(CORES_DE_MARCADOR).default(COR_DE_MARCADOR_PADRAO),
});
export type SetorCreateInput = z.infer<typeof setorCreateSchema>;

export const setorPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: z.enum(CORES_DE_MARCADOR).optional(),
    position: z.number().int().min(0).max(1000).optional(),
    /** `true` arquiva, `false` desarquiva. */
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada a alterar." });
export type SetorPatchInput = z.infer<typeof setorPatchSchema>;

/** PUT dos membros: a lista INTEIRA — quem não está nela sai. */
export const setorMembrosSchema = z.object({
  user_ids: z.array(z.string().uuid()).max(500),
});

export const transferirParaSetorSchema = z.object({
  /** `null` tira a conversa de qualquer setor. */
  sector_id: z.string().uuid().nullable(),
});

/**
 * `organizations.settings.setores` — como o menu de primeiro contato se
 * comporta. Tudo tem padrão: uma organização que nunca abriu a tela tem menu
 * DESLIGADO, e ligar é uma decisão explícita de quem configura.
 */
export const SAUDACAO_PADRAO_DO_MENU = "Olá! Para agilizar seu atendimento, me diga com qual setor você quer falar:";
export const LEMBRETE_PADRAO_DO_MENU = "Não entendi. Responda só com o número do setor:";
/** `{setor}` é trocado pelo nome do setor escolhido. */
export const CONFIRMACAO_PADRAO_DO_MENU = "Certo! Você está falando com o setor {setor}. Já vamos te atender.";

export const configuracaoDeSetoresSchema = z.object({
  menu_ativo: z.boolean().default(false),
  saudacao: z.string().trim().min(1).max(500).default(SAUDACAO_PADRAO_DO_MENU),
  lembrete: z.string().trim().min(1).max(300).default(LEMBRETE_PADRAO_DO_MENU),
  confirmacao: z.string().trim().min(1).max(300).default(CONFIRMACAO_PADRAO_DO_MENU),
  /** Onde a conversa cai quando o cliente não escolhe. `null` = fica sem setor. */
  setor_padrao_id: z.string().uuid().nullable().default(null),
});
export type ConfiguracaoDeSetores = z.infer<typeof configuracaoDeSetoresSchema>;

export const configuracaoDeSetoresPatchSchema = configuracaoDeSetoresSchema.partial();

/**
 * Lê a configuração do jsonb, tolerante: chave ausente ou lixo cai no padrão
 * em vez de derrubar a ingestão — quem lê isto está no caminho da mensagem
 * que acabou de chegar.
 */
export function lerConfiguracaoDeSetores(settings: unknown): ConfiguracaoDeSetores {
  const bruto =
    settings && typeof settings === "object" && "setores" in settings
      ? (settings as { setores?: unknown }).setores
      : undefined;
  const r = configuracaoDeSetoresSchema.safeParse(bruto ?? {});
  return r.success ? r.data : configuracaoDeSetoresSchema.parse({});
}
