import { describe, expect, it } from "vitest";

import { negocioQueHerdaODono, type NegocioCandidato } from "@/lib/leads/dono-ao-assumir";

const orfao = (id: string): NegocioCandidato => ({
  id,
  owner_user_id: null,
  owner_agent_id: null,
});

describe("negocioQueHerdaODono", () => {
  it("um negócio aberto e sem dono: é ele", () => {
    expect(negocioQueHerdaODono([orfao("a")])).toBe("a");
  });

  it("nenhum negócio aberto: não há o que atribuir", () => {
    expect(negocioQueHerdaODono([])).toBeNull();
  });

  it("dois abertos: não adivinha", () => {
    // O caso real é orçamento do site + manutenção mensal. Escolher um deles
    // pelo mais recente daria comissão ao negócio errado, em silêncio.
    expect(negocioQueHerdaODono([orfao("a"), orfao("b")])).toBeNull();
  });

  it("já tem dono humano: não rouba do colega", () => {
    expect(
      negocioQueHerdaODono([{ id: "a", owner_user_id: "outra-pessoa", owner_agent_id: null }]),
    ).toBeNull();
  });

  it("está com um agente de IA: também não toma", () => {
    // `owner_kind` distingue humano de agente (0070). Assumir a conversa tira o
    // agente do ATENDIMENTO — a RPC de claim já silencia o bot —, e isso é
    // diferente de tirar dele a POSSE do negócio no funil.
    expect(
      negocioQueHerdaODono([{ id: "a", owner_user_id: null, owner_agent_id: "agente-1" }]),
    ).toBeNull();
  });
});
