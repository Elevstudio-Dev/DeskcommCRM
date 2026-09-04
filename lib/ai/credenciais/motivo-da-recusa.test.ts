import { describe, expect, it } from "vitest";

import { motivoDaRecusa, TEXTOS_DE_RECUSA } from "./motivo-da-recusa";

import { DICIONARIO } from "@/lib/i18n/dicionario";

describe("o motivo da recusa de uma credencial", () => {
  it("não explica nada quando não há erro", () => {
    // Credencial válida, ou ainda não validada. Devolver um objeto vazio faria
    // a tela reservar espaço para uma explicação que não existe.
    expect(motivoDaRecusa("openrouter", null)).toBeNull();
    expect(motivoDaRecusa("openrouter", "")).toBeNull();
    expect(motivoDaRecusa("openrouter", "   ")).toBeNull();
  });

  it("chave recusada aponta ONDE gerar outra, no painel daquele provedor", () => {
    const m = motivoDaRecusa("openrouter", "auth_failed_401");
    expect(m?.titulo).toBe("A chave foi recusada pelo provedor");
    expect(m?.ondePegarAChave).toBe("https://openrouter.ai/keys");
  });

  it("o 400 do Google conta como chave recusada, não como erro genérico", () => {
    // Medido em 2026-09-03: chave falsa contra
    // `generativelanguage.googleapis.com/v1beta/models` devolve 400
    // (API_KEY_INVALID), não 401. Sem este ramo o caso mais comum do provedor
    // GRATUITO — o que a gente recomenda para quem está começando — cairia na
    // mensagem que menos ajuda.
    const m = motivoDaRecusa("google", "provider_status_400");
    expect(m?.titulo).toBe("A chave foi recusada pelo provedor");
    expect(m?.ondePegarAChave).toBe("https://aistudio.google.com/apikey");
  });

  it("limite de uso não manda trocar a chave — trocar não resolveria", () => {
    const m = motivoDaRecusa("anthropic", "provider_status_429");
    expect(m?.titulo).toBe("O provedor limitou o uso desta chave");
    expect(m?.ondePegarAChave).toBeNull();
  });

  it("erro do lado do provedor diz que não é a chave de quem está lendo", () => {
    for (const codigo of ["provider_status_500", "provider_status_502", "provider_status_503"]) {
      const m = motivoDaRecusa("openai", codigo);
      expect(m?.titulo, codigo).toBe("O provedor está fora do ar");
      expect(m?.comoResolver, codigo).toContain("Não é a sua chave");
    }
  });

  it("falha de rede vira 'o servidor não alcançou o provedor', não 'chave ruim'", () => {
    // Os três chegam do validador pela mesma porta (`err.name` no catch) e
    // significam a mesma coisa para quem opera: a pergunta não chegou lá.
    for (const codigo of ["network_error", "AbortError", "TimeoutError"]) {
      expect(motivoDaRecusa("google", codigo)?.titulo, codigo).toBe(
        "Não consegui falar com o provedor",
      );
    }
  });

  it("provedor sem validador admite que não conferiu, em vez de acusar a chave", () => {
    const m = motivoDaRecusa("xpto", "unknown_provider:xpto");
    expect(m?.titulo).toBe("Este provedor ainda não tem validação automática");
    expect(m?.comoResolver).toContain("guardada");
  });

  it("código desconhecido não inventa diagnóstico", () => {
    const m = motivoDaRecusa("openrouter", "coisa_que_ninguem_previu");
    expect(m?.titulo).toBe("O provedor recusou a consulta");
  });

  it("provedor que não está na lista não fica sem próximo passo", () => {
    const m = motivoDaRecusa("provedor-inexistente", "auth_failed_401");
    expect(m?.ondePegarAChave).toBeNull();
    expect(m?.comoResolver).toBe("Confira a chave no painel do provedor e cole de novo.");
  });

  it("TODO texto que este módulo devolve existe em espanhol", () => {
    // POR QUE ESTE CASO EXISTE. O guarda de AST
    // (`tests/unit/i18n-espanhol-cobre-a-tela`) varre as telas procurando
    // `t("literal")`. Aqui as chaves chegam por VARIÁVEL — a tela chama
    // `t(motivo.titulo)` —, e ele não tem como saber o que `titulo` vale.
    //
    // Ou seja: sem este caso, um texto novo daqui entraria em produção sem
    // espanhol e NADA ficaria vermelho. A tela degradaria para português no
    // meio de uma interface em espanhol, que é justamente o que aquele guarda
    // existe para impedir.
    const semEspanhol = TEXTOS_DE_RECUSA.filter((texto) => !DICIONARIO[texto]?.es);
    expect(
      semEspanhol,
      `sem tradução em lib/i18n/dicionario.ts:\n  - ${semEspanhol.join("\n  - ")}`,
    ).toEqual([]);
  });
});
