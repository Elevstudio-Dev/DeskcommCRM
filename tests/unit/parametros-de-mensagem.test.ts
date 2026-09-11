/**
 * MENSAGEM PRONTA COM PARÂMETROS — a regra, provada sem tela.
 *
 * O que estes casos prendem:
 *
 *  - toda `{{chave}}` é parâmetro: as automáticas chegam preenchidas, as
 *    outras viram pergunta — e NENHUMA vai literal para o cliente por
 *    descuido, que era o defeito da versão que só conhecia duas chaves;
 *  - a ordem dos campos é a ordem do texto, sem repetição;
 *  - a janelinha só abre quando sobra algo para decidir.
 */
import { describe, expect, it } from "vitest";

import {
  CHAVES_AUTOMATICAS,
  extrairParametros,
  precisaDeJanela,
  preencher,
  rotuloDe,
  valoresAutomaticos,
} from "@/lib/inbox/parametros-de-mensagem";
import { interpolateTemplate } from "@/lib/inbox/template-vars";

const CORPO =
  "Olá {{nome}}, aqui é {{atendente}} da loja. Seu pedido {{numero_pedido}} " +
  "no valor de {{valor}} saiu. Qualquer dúvida, {{primeiro_nome}}, é só chamar — {{atendente}}.";

describe("extrairParametros", () => {
  it("lista na ordem do texto, sem repetir", () => {
    expect(extrairParametros(CORPO).map((p) => p.chave)).toEqual([
      "nome",
      "atendente",
      "numero_pedido",
      "valor",
      "primeiro_nome",
    ]);
  });

  it("separa automático de livre", () => {
    const origens = Object.fromEntries(extrairParametros(CORPO).map((p) => [p.chave, p.origem]));
    expect(origens).toEqual({
      nome: "contato",
      atendente: "atendente",
      numero_pedido: "livre",
      valor: "livre",
      primeiro_nome: "contato",
    });
  });

  it("aceita acento e número na chave — a mensagem é escrita em português", () => {
    const [p] = extrairParametros("Pedido {{número_do_pedido_2}}");
    expect(p?.chave).toBe("número_do_pedido_2");
    expect(p?.rotulo).toBe("Número do pedido 2");
    expect(p?.origem).toBe("livre");
  });

  it("tolera espaço DENTRO das chaves e caixa alta", () => {
    expect(extrairParametros("Oi {{ Primeiro_Nome }}").map((p) => p.chave)).toEqual(["primeiro_nome"]);
  });

  it("espaço no MEIO da chave não é parâmetro — fica literal e o formulário avisa", () => {
    expect(extrairParametros("Oi {{numero pedido}}")).toEqual([]);
  });

  it("sem parâmetro, lista vazia", () => {
    expect(extrairParametros("Fechado, obrigado!")).toEqual([]);
  });
});

describe("rotuloDe", () => {
  it("humaniza a chave livre sem inventar acento", () => {
    expect(rotuloDe("numero_pedido")).toBe("Numero pedido");
    expect(rotuloDe("data_de_entrega")).toBe("Data de entrega");
  });

  it("as automáticas têm rótulo próprio, e os apelidos apontam para o mesmo", () => {
    expect(rotuloDe("nome")).toBe("Nome do cliente");
    expect(rotuloDe("nome_cliente")).toBe("Nome do cliente");
    expect(rotuloDe("atendente")).toBe("Nome do atendente");
  });

  it("as chaves oferecidas no formulário são todas automáticas", () => {
    for (const { chave } of CHAVES_AUTOMATICAS) {
      expect(extrairParametros(`{{${chave}}}`)[0]?.origem).not.toBe("livre");
    }
  });
});

describe("valoresAutomaticos", () => {
  it("preenche nome, primeiro nome, apelidos e atendente", () => {
    expect(
      valoresAutomaticos({ contato: { nome: "Ana Paula Souza" }, atendente: { nome: "Carlos" } }),
    ).toEqual({
      nome: "Ana Paula Souza",
      nome_cliente: "Ana Paula Souza",
      cliente: "Ana Paula Souza",
      primeiro_nome: "Ana",
      atendente: "Carlos",
    });
  });

  it("contato sem nome NÃO entra no mapa — é o que faz a janelinha perguntar", () => {
    expect(valoresAutomaticos({ contato: { nome: "  " }, atendente: { nome: "Carlos" } })).toEqual({
      atendente: "Carlos",
    });
    expect(valoresAutomaticos({})).toEqual({});
  });
});

describe("preencher", () => {
  it("substitui o que tem valor e mantém literal o que não tem", () => {
    const texto = preencher(CORPO, {
      nome: "Ana Paula",
      primeiro_nome: "Ana",
      atendente: "Carlos",
      numero_pedido: "1234",
    });
    expect(texto).toBe(
      "Olá Ana Paula, aqui é Carlos da loja. Seu pedido 1234 no valor de {{valor}} saiu. " +
        "Qualquer dúvida, Ana, é só chamar — Carlos.",
    );
  });

  it("valor em branco conta como ausente — não apaga a chave em silêncio", () => {
    // Um campo deixado vazio na janelinha deixaria "Seu pedido  saiu." se a
    // chave sumisse. Ficar `{{numero_pedido}}` é visível; sumir não é.
    expect(preencher("Pedido {{numero_pedido}}", { numero_pedido: "   " })).toBe("Pedido {{numero_pedido}}");
  });

  it("a mesma chave repetida recebe o mesmo valor em todo lugar", () => {
    expect(preencher("{{a}} e {{a}}", { a: "x" })).toBe("x e x");
  });
});

describe("precisaDeJanela", () => {
  it("é falso quando não há parâmetro", () => {
    expect(precisaDeJanela(extrairParametros("Oi!"), {})).toBe(false);
  });

  it("é falso quando só há automáticos e todos têm valor — entra direto, como sempre", () => {
    const params = extrairParametros("Oi {{primeiro_nome}}, aqui é {{atendente}}.");
    const valores = valoresAutomaticos({ contato: { nome: "Ana Souza" }, atendente: { nome: "Carlos" } });
    expect(precisaDeJanela(params, valores)).toBe(false);
  });

  it("é verdadeiro com um parâmetro livre", () => {
    const params = extrairParametros("Pedido {{numero_pedido}}");
    expect(precisaDeJanela(params, {})).toBe(true);
  });

  it("é verdadeiro quando um automático não tem de onde vir (contato sem nome)", () => {
    // Antes, "Olá {{nome}}" ia literal para o cliente sem nome no cadastro.
    const params = extrairParametros("Olá {{nome}}!");
    expect(precisaDeJanela(params, valoresAutomaticos({ contato: { nome: null } }))).toBe(true);
  });
});

describe("a casca antiga continua honesta", () => {
  it("interpolateTemplate faz o que sempre fez, pela regra nova", () => {
    expect(interpolateTemplate("Oi {{primeiro_nome}}, cupom {{codigo}}", { name: "Ana Souza" })).toBe(
      "Oi Ana, cupom {{codigo}}",
    );
  });
});
