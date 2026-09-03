/**
 * Quem assume a conversa assume o negócio — quando não há dúvida de qual.
 *
 * ═══ O PROBLEMA, MEDIDO ═══
 *
 * Assumir a conversa e ser dono do negócio são campos diferentes
 * (`conversations.assigned_to_user_id` e `crm_leads.owner_user_id`), e a rota de
 * claim nunca tocou no segundo. Medido numa instalação real: a conversa em
 * `claimed` com atendente, e o card no funil dizendo "Sem responsável" — o
 * operador assumiu, viu que assumiu, e o funil continuou órfão.
 *
 * Um negócio sem dono não é detalhe cosmético: o filtro "Sem responsável" do
 * quadro existe para achar o que ninguém pegou, e um card que TEM atendente
 * aparecendo ali gasta a atenção de quem confia nesse filtro.
 *
 * ═══ POR QUE SÓ QUANDO HÁ EXATAMENTE UM ═══
 *
 * Com dois negócios abertos para o mesmo contato — caso real: o orçamento do
 * site e a manutenção mensal —, assumir a conversa não diz qual deles a pessoa
 * pegou. Escolher o mais recente seria adivinhar, e adivinhação em atribuição
 * vira comissão errada. Zero ou dois ou mais: não faz nada, e o operador
 * atribui no card, onde a escolha é explícita.
 *
 * ═══ POR QUE NÃO SOBRESCREVE ═══
 *
 * Negócio que já tem dono — humano ou agente de IA — não muda de mãos porque
 * alguém abriu a conversa. Roubar a atribuição de um colega em silêncio é pior
 * que deixar sem dono: o segundo caso é visível no filtro, o primeiro não é
 * visível em lugar nenhum.
 */
export interface NegocioCandidato {
  id: string;
  owner_user_id: string | null;
  owner_agent_id: string | null;
}

/** O id do negócio que herda o dono, ou `null` quando não há um óbvio. */
export function negocioQueHerdaODono(
  abertos: readonly NegocioCandidato[],
): string | null {
  if (abertos.length !== 1) return null;
  const unico = abertos[0]!;
  if (unico.owner_user_id !== null) return null;
  if (unico.owner_agent_id !== null) return null;
  return unico.id;
}
