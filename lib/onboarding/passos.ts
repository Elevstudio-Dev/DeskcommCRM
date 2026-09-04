/**
 * OS PASSOS DO WIZARD — uma definição só.
 *
 * Eram três listas que discordavam entre si: a ORDEM vivia numa cascata de
 * `if`s no roteador, os RÓTULOS numa lista fixa no indicador de progresso, e o
 * RESUMO final numa terceira lista. O resultado, em 100% das instalações pelo
 * kit (onde a integração de loja vem desligada):
 *
 *  - o indicador mostrava um passo "Loja" que não existia naquela instalação;
 *  - ele aparecia CONCLUÍDO enquanto a pessoa estava no passo seguinte, porque
 *    "feito" era só "índice menor que o atual";
 *  - e a tela final listava "Loja Nuvemshop (pulado)" — o wizard acusando o
 *    usuário de ter deixado de fazer uma tela que nunca lhe foi oferecida.
 *
 * Aqui, quem decide se um passo EXISTE é o próprio passo, e a mesma resposta
 * alimenta o roteador, o indicador e o resumo. Um passo que não se aplica não
 * aparece em lugar nenhum — nem como pendência, nem como culpa.
 */
import type { OnboardingState } from "@/lib/schemas/onboarding";

export interface PassoDoOnboarding {
  /** Segmento da rota em `app/onboarding/<segmento>`. */
  segmento: string;
  /**
   * O nome da PEÇA que a pessoa está montando, não o nome do sistema.
   *
   * FUNÇÃO DO CONTEXTO, e não texto fixo, porque o wizard conta duas histórias
   * diferentes. No caminho com IA a pessoa está contratando um funcionário, e
   * as peças são dele: "o telefone DELE", "onde ELE organiza". No caminho só
   * CRM esse dono não existe — e um rótulo que fala de "ele" sem que ninguém
   * tenha sido contratado deixa a pessoa procurando quem é "ele".
   */
  rotulo: (ctx: ContextoDoPasso) => string;
  /**
   * O passo existe nesta instalação? Integração desligada não vira passo
   * fantasma.
   */
  existe: (ctx: ContextoDoPasso) => boolean;
  /** Já foi resolvido? (inclusive quando a pessoa escolheu pular) */
  cumprido: (state: OnboardingState) => boolean;
  /** Foi resolvido de verdade, ou a pessoa pulou? Alimenta o resumo final. */
  pulado: (state: OnboardingState) => boolean;
}

export interface ContextoDoPasso {
  /** A integração de loja está ligada nesta instalação? */
  lojaLigada: boolean;
  /**
   * A pessoa escolheu começar COM o atendente de IA?
   *
   * `false` faz `setup-ai` e `testar` deixarem de EXISTIR — não de serem
   * pulados. É a mesma distinção que a loja desligada já usa, e ela é o motivo
   * de este mecanismo existir: passo pulado vira linha de pendência no resumo,
   * passo inexistente não vira linha nenhuma. Acusar alguém de não ter feito
   * uma tela que nunca lhe foi oferecida é o defeito que o cabeçalho deste
   * arquivo conta.
   */
  comIa: boolean;
}

/** Um passo marcado no estado — com ou sem `skipped`. */
function marcado(valor: unknown): boolean {
  return Boolean(valor);
}

function foiPulado(valor: { skipped?: boolean } | undefined): boolean {
  return Boolean(valor?.skipped);
}

export const PASSOS: readonly PassoDoOnboarding[] = [
  {
    segmento: "caminho",
    rotulo: () => "Por onde começar",
    existe: () => true,
    /**
     * QUEM JÁ PASSOU DAQUI NÃO VOLTA. Uma instalação que começou o wizard antes
     * deste passo existir não tem `caminho` no estado — e sem esta segunda
     * condição ela seria mandada de volta para a bifurcação depois de já ter
     * preenchido o negócio, como se estivesse recomeçando.
     */
    cumprido: (s) => marcado(s.caminho) || marcado(s.welcome),
    pulado: () => false,
  },
  {
    segmento: "welcome",
    rotulo: () => "Seu negócio",
    existe: () => true,
    cumprido: (s) => marcado(s.welcome),
    pulado: () => false,
  },
  {
    segmento: "connect-whatsapp",
    // O telefone é a primeira peça concreta do funcionário, e é o passo que
    // pede o celular na mão — o instalador já avisa para deixá-lo aberto.
    rotulo: (ctx) => (ctx.comIa ? "O telefone dele" : "Seu WhatsApp"),
    existe: () => true,
    cumprido: (s) => marcado(s.whatsapp),
    pulado: (s) => foiPulado(s.whatsapp),
  },
  {
    segmento: "connect-nuvemshop",
    rotulo: () => "Sua loja",
    existe: (ctx) => ctx.lojaLigada,
    cumprido: (s) => marcado(s.nuvemshop),
    pulado: (s) => foiPulado(s.nuvemshop),
  },
  {
    segmento: "setup-ai",
    rotulo: () => "Treinar",
    existe: (ctx) => ctx.comIa,
    cumprido: (s) => marcado(s.ai),
    pulado: (s) => foiPulado(s.ai),
  },
  {
    segmento: "funil",
    // O quadro vem DEPOIS de treinar de propósito: a sugestão sai da chave que a
    // pessoa acabou de confirmar funcionando, e é o mesmo cérebro que vai
    // atender. Pedir o quadro antes obrigaria a montá-lo no escuro.
    //
    // Sem IA o passo continua existindo, e não por teimosia: `pacotes-de-funil`
    // entrega quadros prontos por ramo, que já são o plano B de quando a chave
    // falha. O que muda é a origem da proposta, não a existência do passo.
    rotulo: (ctx) => (ctx.comIa ? "Onde ele organiza" : "Seu funil"),
    existe: () => true,
    cumprido: (s) => marcado(s.funil),
    pulado: (s) => foiPulado(s.funil),
  },
  {
    segmento: "testar",
    // O wizard terminava entregando a pessoa num inbox vazio. Ver o
    // funcionário responder ANTES de acabar é o que transforma "configurei um
    // sistema" em "contratei alguém" — e é onde o erro aparece antes do
    // primeiro cliente real, não depois.
    //
    // Sem funcionário contratado não há o que ver atender.
    rotulo: () => "Ver ele atender",
    existe: (ctx) => ctx.comIa,
    cumprido: (s) => marcado(s.teste),
    pulado: (s) => foiPulado(s.teste),
  },
  {
    segmento: "invite-team",
    rotulo: (ctx) => (ctx.comIa ? "Quem trabalha com ele" : "Sua equipe"),
    existe: () => true,
    cumprido: (s) => marcado(s.team),
    pulado: (s) => foiPulado(s.team),
  },
] as const;

/**
 * O contexto, montado a partir do estado e do ambiente.
 *
 * Existe para a regra "ausente é com IA" morar em UM lugar. Repetida nas três
 * telas que montam contexto, ela seria três chances de alguém escrever
 * `=== "com_ia"` — que se comporta igual hoje e passa a divergir no dia em que
 * um caminho novo entrar no enum.
 */
export function contextoDoOnboarding(
  state: OnboardingState,
  ambiente: { lojaLigada: boolean },
): ContextoDoPasso {
  return { lojaLigada: ambiente.lojaLigada, comIa: state.caminho !== "so_crm" };
}

/** Os passos que existem NESTA instalação, na ordem. */
export function passosVisiveis(ctx: ContextoDoPasso): PassoDoOnboarding[] {
  return PASSOS.filter((p) => p.existe(ctx));
}

/**
 * O primeiro passo ainda não resolvido — ou `null` quando não falta nenhum.
 * É a única definição de ordem do wizard.
 */
export function proximoPasso(
  state: OnboardingState,
  ctx: ContextoDoPasso,
): PassoDoOnboarding | null {
  return passosVisiveis(ctx).find((p) => !p.cumprido(state)) ?? null;
}

export interface ItemDoResumo {
  segmento: string;
  rotulo: string;
  feito: boolean;
  pulado: boolean;
}

/**
 * O resumo final. Só lista o que a pessoa realmente encontrou pela frente —
 * um passo que não existe nesta instalação não vira linha, muito menos linha
 * marcada como pulada.
 */
export function resumoDoOnboarding(
  state: OnboardingState,
  ctx: ContextoDoPasso,
): ItemDoResumo[] {
  return passosVisiveis(ctx).map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo(ctx),
    feito: p.cumprido(state) && !p.pulado(state),
    pulado: p.pulado(state),
  }));
}
