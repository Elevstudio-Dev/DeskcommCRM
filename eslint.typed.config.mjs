/**
 * A CAMADA COM TIPOS — separada, fora do caminho do commit, e ESTREITA.
 *
 * ## Por que um arquivo à parte
 *
 * As regras daqui precisam do PROGRAMA inteiro do TypeScript, não só do arquivo
 * aberto: para saber que `algo()` devolve uma Promise, o ESLint resolve o tipo
 * de retorno através de todos os imports.
 *
 * MEDIDO neste repositório (~1.500 arquivos de fonte): **2m17s e pico de 5,1 GB**.
 * Isso decide duas coisas, e as duas estão escritas para ninguém as refazer:
 *
 *   1. NUNCA entra no `lint`, no `gov:verify` ou em hook de git. O `lint` normal
 *      roda em segundos; cobrar 2 minutos por commit é o imposto que faz alguém
 *      desligar o gate inteiro.
 *   2. NUNCA entra num runner de CI comum. 5,1 GB estoura a maioria deles, e o
 *      sintoma é OOM — não uma mensagem que ajude.
 *
 * ## Por que a lista é CURTA (e o que foi cortado, com o número)
 *
 * A primeira versão deste arquivo ligou o pacote completo que a literatura
 * recomenda. Resultado: **1250 avisos**. Fui olhar, e o que encontrei:
 *
 *   - `no-unsafe-*` (734): a fronteira com o PostgREST é `any` por construção, e
 *     este repo já a trata com estreitamento explícito (`as never`, os schemas
 *     Zod nas rotas). Sinalizar cada travessia não aponta defeito nenhum;
 *     aponta a fronteira, que a gente já sabe onde está.
 *   - `restrict-template-expressions` (4): TODAS eram o padrão de checagem
 *     exaustiva — o TS estreita para `never` no ramo final e a regra reclama do
 *     `never`. Em `lib/ai/provider-validators.ts` o comentário do autor explica
 *     que é intencional. Zero defeito em quatro achados.
 *   - `only-throw-error` (2): as duas eram `throw valorCapturado` — relançar o
 *     que veio do `catch`, que é legítimo.
 *   - `require-await` (9): quase todas são assinatura de contrato (adapter de
 *     canal que DEVE devolver Promise, server action que DEVE ser async).
 *
 * Aviso só serve enquanto for CONTÁVEL. Acima de algumas dezenas ele vira papel
 * de parede e para de mudar comportamento — e o `pnpm lint` deste repo já
 * carrega 313 avisos herdados que ninguém lê. Somar 900 seria piorar a única
 * coisa que a camada tinha para oferecer: sinal.
 *
 * ## O que sobrou, e por que ESTE recorte
 *
 * Promise solta no SERVIDOR é quase sempre defeito: a resposta HTTP sai, o
 * processo segue, e o trabalho que ninguém esperou pode nunca terminar. Promise
 * solta no CLIENTE é, neste código, quase sempre idiomática —
 * `qc.invalidateQueries(...)` sem `void` e `onClick={async …}` são o padrão do
 * react-query e do React, e foram 182 dos 1250.
 *
 * Então o escopo é o servidor: rotas, ações e a camada `lib/`. O cliente
 * (`components/`, `hooks/` e os `_components` das paginas) fica de fora — não por ser
 * menos importante, mas porque ali a regra não distingue defeito de idioma.
 */
import defaultConfig from "./eslint.config.mjs";

export default [
  ...defaultConfig,
  {
    files: ["app/api/**/*.ts", "app/actions/**/*.ts", "lib/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      // 7.675 linhas geradas pelo Supabase — não se conserta, se regenera.
      "lib/database.types.ts",
    ],
    languageOptions: {
      parserOptions: {
        // `projectService` e não `project`: descobre o tsconfig de cada arquivo
        // sozinho e não estoura quando um fica fora do `include` — o modo de
        // falha clássico do `project`, que aparece como "file not found in
        // project" em vez de um erro útil.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * A REGRA QUE MOTIVOU O ARQUIVO.
       *
       * Este código usa fire-and-forget DE PROPÓSITO em vários lugares — a linha
       * do tempo não pode derrubar a operação que ela descreve (ver o cabeçalho
       * de `lib/inbox/atividade-de-comando.ts`). O problema é que, visto de
       * fora, um fire-and-forget deliberado e um `await` esquecido têm
       * exatamente a mesma cara.
       *
       * A regra separa os dois: o deliberado ganha `void` na frente e sai da
       * lista; o que sobra é o esquecido. `ignoreVoid` é o padrão e fica —
       * é ele que faz a distinção funcionar.
       */
      "@typescript-eslint/no-floating-promises": "warn",

      /** `await` em coisa que não é Promise: ou o tipo mente, ou o `await` sobra. */
      "@typescript-eslint/await-thenable": "warn",

      /**
       * Promise onde se esperava um valor. No servidor isto é grave:
       * `if (buscarAlgo())` é SEMPRE verdadeiro, e o `if` vira decoração.
       */
      "@typescript-eslint/no-misused-promises": "warn",

      /**
       * `return await` dentro de `try`: sem o `await`, a Promise rejeita FORA do
       * bloco e o `catch` não pega. É a diferença entre tratar o erro e deixá-lo
       * subir — num handler de rota, entre uma resposta 500 honesta e uma
       * exceção não capturada.
       */
      "@typescript-eslint/return-await": ["warn", "in-try-catch"],
    },
  },
];
