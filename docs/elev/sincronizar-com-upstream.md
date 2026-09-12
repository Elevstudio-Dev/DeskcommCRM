# Sincronizar com o upstream — o levantamento mensal

> O script `pnpm elev:estado` mede os números. Este documento é para o que ele
> não faz: **decidir se vale puxar**. A decisão é de julgamento, e por isso
> mora aqui e não num comando.

**Cadência:** uma vez por mês. Não é regra rígida — se sair uma correção de
segurança, puxe no dia. A cadência existe para o merge não virar arqueologia:
quanto mais tempo passa, mais caro fica.

---

## 1. Levantar o que mudou

```bash
git fetch origin main
pnpm elev:estado
```

**Tags do upstream não entram no clone.** O remote `origin` (upstream) está com
`remote.origin.tagOpt = --no-tags` (configurado em 2026-09-12; conferir com
`git config --get remote.origin.tagOpt` num clone novo). Sem isso, `git fetch
origin` traz as tags deles de carona, e os nomes colidem com os nossos: em
2026-09-12 o clone tinha a `v1.16.0` **deles** e recusou a nossa
(`! [rejected] v1.16.0 -> v1.16.0 (would clobber existing tag)`), e o
`elev:estado` dizia v1.14.0 com a 1.16.0 já publicada. As tags que valem são as
do `fork`: `git fetch fork --tags`. Se uma tag deles já estiver no clone,
`git tag -d <tag>` e buscar de novo — e **não** apagar o marcador local
`antes-do-merge-upstream` (é o primeiro pai do merge `653281fc`).

O que veio, em linguagem de gente:

```bash
git log --oneline HEAD..origin/main
```

O que veio que **toca arquivo que nós mudamos** — é aqui que o merge dói:

```bash
git diff --name-only HEAD...origin/main > /tmp/deles.txt
git diff --name-only $(git merge-base HEAD origin/main)..HEAD > /tmp/nossos.txt
comm -12 <(sort /tmp/deles.txt) <(sort /tmp/nossos.txt)
```

Arquivo que aparece nessa última lista é conflito provável. Se estiver vazio,
o merge tende a ser mecânico.

---

## 2. Decidir, item a item

### Puxa sempre, sem discussão

- **Correção de segurança.** Qualquer uma.
- **Correção de perda ou vazamento de dado.** Inclui isolamento entre clientes.
- **Correção em código que não tocamos.** Custo perto de zero, risco perto de
  zero, e nos mantém perto do upstream — que é o que faz o próximo merge ser
  barato.

### Analisa antes

- **Feature nova.** Duas perguntas: serve ao Elev? E quanto custa manter?
  Feature que não usamos ainda é código que quebra em merge futuro.
- **Mudança em arquivo que modificamos.** Leia o diff deles antes de aceitar —
  pode desfazer uma decisão nossa em silêncio.
- **Mudança de schema.** Migration deles + nossa na mesma versão pede atenção
  redobrada: rode `pnpm test:db` antes de considerar aceito.

### Não puxa por padrão

- **Mudança de marca ou identidade deles.** É o oposto do que queremos.
- **Feature que compete com o que vamos construir diferente.** Puxar cria a
  obrigação de manter duas respostas para a mesma pergunta.
- **Mudança nos arquivos do kit que já divergimos** (`_common.sh`,
  `docker-compose.prod.yml`, `.env.hostgator.example`): o namespace das imagens
  é nosso. Leia, mas não aceite cego.

---

## 3. A regra de segurança, que não tem exceção

**A suíte completa verde antes de aceitar qualquer merge.**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:shell
```

E, se o merge tocou schema:

```bash
pnpm test:db
```

Isto não é formalidade. Nesta base, os guards já pegaram três erros reais numa
única sessão de trabalho: uma variável que não parecia UUID para a régua do
audit, cinco strings sem tradução em espanhol, e uma tag apontando para commit
fora da main. Nenhum deles teria aparecido na tela até um cliente esbarrar.

---

## 4. Registrar a decisão

Depois de decidir, escreva o que ficou de fora e por quê:

```bash
git commit -m "chore(sync): traz upstream até <sha>

Puxado: <o que veio>
Deixado de fora: <o que não veio, e a razão>
Verificação: typecheck, lint, unit e shell verdes; test:db <rodou/não se aplica>"
```

A linha do que ficou de fora é a mais importante. Sem ela, daqui a três meses
ninguém sabe se um recurso não veio porque foi rejeitado ou porque foi
esquecido — e a diferença muda o que fazer a respeito.

---

## 5. Quando NÃO sincronizar

Vale dizer também quando pular o mês:

- **Nada relevante veio.** Se `git log HEAD..origin/main` só traz mudança de
  documentação e ajuste interno deles, pular é a decisão certa.
- **Estamos no meio de uma entrega.** Merge no meio de trabalho em curso mistura
  duas fontes de problema. Termine, depois sincronize.
- **A suíte já está vermelha.** Sincronizar sobre base quebrada torna
  impossível saber quem quebrou o quê.

---

## 6. Os levantamentos feitos

Cada rodada deixa um registro em :
o que veio, o que vale, o que conflita, e a decisão — inclusive a de NÃO puxar.
É o que permite, três meses depois, saber se algo ficou de fora por escolha ou
por esquecimento.

- [2026-09-11](levantamentos/2026-09-11-upstream.md) — 404 commits deles em
  uma semana; dependências puxadas isoladas; o resto fica para outubro, antes
  da VPS, por causa das migrations em colisão.
