/**
 * O nome do provider de canal não pode chegar ao cliente — e isso não estava vigiado.
 *
 * Medido por sabotagem: zerando `PROVIDERES_DE_CANAL` no detector, os 143 testes de
 * vazamento continuavam VERDES. A cobertura existia no código e não existia em teste
 * nenhum, então qualquer refactor podia removê-la sem sintoma no CI.
 *
 * ⚠️ A primeira versão deste comentário dizia que a guarda era "improibível de escrever",
 * porque `lint-channels` reprovaria o nome do provider dentro de um teste. **Falso, e medido:**
 * o literal num arquivo sob `tests/` passa (exit 0); o mesmo literal em `lib/` reprova
 * (exit 1) — `ROOTS` é `["app","lib","components","workers"]` e nunca incluiu `tests/`.
 * A causa real da ausência é a chata: ninguém escreveu o teste. Fica registrado porque a
 * explicação elegante sobreviveu cercada de medição de verdade (sabotagem, controle
 * positivo, exit codes) — que é exatamente quando ninguém a checa.
 *
 * O teste DERIVA os nomes de `CHANNEL_CAPABILITIES` mesmo assim, por um motivo que se
 * sustenta sozinho: provider novo entra na cobertura sem ninguém lembrar de vir aqui.
 *
 * Derivar da mesma fonte não torna isto tautológico: o que se guarda é a propriedade
 * "todo provider conhecido é barrado". Se alguém esvaziar ou desligar a lista lá dentro,
 * este teste continua sabendo quais deveriam ser — e reprova.
 */
import { describe, expect, it } from "vitest";

import { detectarVazamentoInterno } from "@/lib/agent-engine/guardrails/vazamento-interno";
import {
  CHANNEL_CAPABILITIES,
  PROVIDERS_DE_MARCA_PUBLICA,
} from "@/lib/channels/capabilities";

/**
 * ─── A ISENÇÃO, e por que ela não é um buraco (2026-09-05) ──────────────────
 *
 * A regra era "todo provider é barrado". Ela valia enquanto todo nome de
 * provider era jargão que nenhum cliente diz. Entrou um cujo nome o cliente diz
 * o tempo todo, e a regra antiga passou a CENSURAR a palavra "Instagram" nas
 * respostas do agente — "vi vocês no Instagram" é a frase mais comum de quem
 * escreve para uma loja. Ver `PROVIDERS_DE_MARCA_PUBLICA`.
 *
 * Isenção é sempre um risco: bastaria alguém despejar todos os providers na
 * lista para desligar esta proteção inteira, com o arquivo VERDE — que é
 * exatamente o verde silencioso que o cabeçalho acima descreve. Por isso a
 * isenção é medida dos dois lados: o que sobra tem de continuar sendo barrado
 * (`INTERNOS`, abaixo), e o que sobra NÃO PODE ficar vazio.
 */
const PROVIDERS = Object.keys(CHANNEL_CAPABILITIES);
const INTERNOS = PROVIDERS.filter((p) => !PROVIDERS_DE_MARCA_PUBLICA.has(p as never));
const PUBLICOS = PROVIDERS.filter((p) => PROVIDERS_DE_MARCA_PUBLICA.has(p as never));

describe("nome de provider de canal é vazamento", () => {
  /**
   * Guarda de vacuidade. Sem ela, um `CHANNEL_CAPABILITIES` vazio faria o `it.each`
   * abaixo rodar zero caso e o arquivo passar sem ter medido nada — o mesmo verde
   * silencioso que a sabotagem expôs, só que um andar acima.
   */
  it("a fonte derivada não está vazia (senão o resto deste arquivo é vácuo)", () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * A GUARDA DA ISENÇÃO — e ela é o caso mais importante deste arquivo.
   *
   * Esvaziar `INTERNOS` (movendo tudo para a lista de marca pública) faria os
   * `it.each` de baixo rodarem zero caso e o arquivo passar verde com a
   * proteção desligada. É a mesma falha-em-verde que a sabotagem do cabeçalho
   * expôs, um andar acima — e ela agora tem um mecanismo, não uma promessa.
   */
  it("a isenção de marca pública é EXCEÇÃO: sobra provider interno para barrar", () => {
    expect(
      INTERNOS.length,
      "todo provider virou 'marca pública' — a proteção contra vazar o nome do " +
        "encanamento está desligada, e este arquivo passaria verde sem medir nada",
    ).toBeGreaterThanOrEqual(2);
    expect(
      PUBLICOS.length,
      "a isenção cresceu além do punhado de marcas que o cliente final realmente diz — " +
        "o critério é 'o CLIENTE diria isto numa conversa?', não 'eu conheço a marca'",
    ).toBeLessThanOrEqual(2);
  });

  it.each(INTERNOS)("barra o nome do provider: %s", (p) => {
    const r = detectarVazamentoInterno(`Não consegui enviar pelo ${p}, tente de novo.`);
    expect(r.achou, `o nome do provider chegou ao cliente`).toBe(true);
    expect(r.categorias).toContain("arquitetura");
  });

  /**
   * O outro lado da isenção. Sem ele, alguém poderia "consertar" o detector
   * voltando a barrar tudo e este arquivo continuaria verde — a censura da
   * marca pública voltaria calada, e o sintoma apareceria como uma resposta
   * estranha do agente meses depois.
   */
  it.each(PUBLICOS)("NÃO barra a marca que o cliente diz: %s", (p) => {
    const r = detectarVazamentoInterno(`Pode me chamar no ${p} também, se preferir.`);
    expect(
      r.achou,
      `"${p}" é marca pública e foi barrada — a resposta do agente sairia com a palavra tapada`,
    ).toBe(false);
  });

  /**
   * O risco deste gate é barrar demais: no follow-up determinístico o veto é drop
   * silencioso. A palavra do cliente que mais se aproxima aqui é "canal" — ele fala
   * "outro canal", "canal de atendimento", e isso NÃO pode morrer.
   */
  it("não barra a palavra do cliente que orbita o termo", () => {
    for (const frase of [
      "Prefere que eu te chame em outro canal?",
      "Esse é o nosso canal de atendimento.",
      "Te respondo pelo mesmo canal, combinado?",
    ]) {
      const r = detectarVazamentoInterno(frase);
      expect(r.achou, `barrado por ${r.categorias.join(",")}: ${r.termos.join(", ")}`).toBe(false);
    }
  });
});
