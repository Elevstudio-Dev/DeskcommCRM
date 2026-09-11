/**
 * Interpola `{{nome}}` e `{{primeiro_nome}}` com o contato da conversa (Onda 5).
 *
 * ⚠️ CASCA de compatibilidade. A regra mudou de casa em 2026-09-11:
 * `lib/inbox/parametros-de-mensagem.ts` conhece também `{{atendente}}` e trata
 * qualquer outra chave como PARÂMETRO LIVRE, a preencher numa janelinha antes
 * de usar. Esta função continua fazendo o que sempre fez — o que não conhece,
 * mantém literal — e existe para o teste antigo e para quem ainda a importa.
 * Código novo usa `preencher` + `valoresAutomaticos` diretamente.
 */
import { preencher, valoresAutomaticos } from "@/lib/inbox/parametros-de-mensagem";

export interface TemplateContact {
  name?: string | null;
}

export function interpolateTemplate(body: string, contact: TemplateContact): string {
  return preencher(body, valoresAutomaticos({ contato: { nome: contact.name } }));
}
