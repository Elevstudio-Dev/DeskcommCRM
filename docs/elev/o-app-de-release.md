# O GitHub App de release — o que falta para distribuir

> Estado medido em 2026-09-11: `gh secret list --repo Elevstudio-Dev/ElevCRM`
> volta **vazio**. Sem `RELEASE_APP_ID` e `RELEASE_APP_PRIVATE_KEY`, o
> `release.yml` não abre PR de release, não cria tag, e o `publish-image.yml`
> nunca publica as três imagens que a VPS puxa. **Nada é distribuível até
> isto existir**, e é ação de quem é dono da conta — envolve gerar uma chave
> privada, que o assistente não deve tocar.

## Por que um App, e não o token do próprio workflow

Evento disparado com o `GITHUB_TOKEN` **não cria novo workflow run** (regra do
GitHub). Se a tag `vX.Y.Z` nascesse dele, o `publish-image.yml` jamais rodaria:
a tag existiria, ninguém veria erro, e nenhuma VPS receberia a atualização. O
App é o que faz a tag "contar" como evento de gente.

## O que criar (uma vez, ~10 minutos)

1. **Criar o App** em GitHub → *Settings* → *Developer settings* → *GitHub Apps*
   → *New GitHub App*, na conta **Elevstudio-Dev** (a dona do repositório).
   - **Nome:** `elevcrm-release` — exatamente. O bot aparece como
     `elevcrm-release[bot]`, e a guarda `tests/unit/tag-so-nasce-da-main.test.ts`
     exige esse nome nas tags.
   - **Homepage URL:** `https://github.com/Elevstudio-Dev/ElevCRM`.
   - **Webhook:** desmarque *Active* (não usamos).
   - **Repository permissions:** *Contents* → **Read and write** (branch, tag e
     release); *Pull requests* → **Read and write** (o PR de release);
     *Metadata* → Read (vem marcado).
   - **Where can this app be installed:** *Only on this account*.
2. **Gerar a chave privada:** na página do App, *Private keys* → *Generate a
   private key*. Baixa um `.pem`. **Guarde-o fora do repositório** e não o cole
   em chat nenhum.
3. **Instalar o App no repositório:** *Install App* → Elevstudio-Dev → *Only
   select repositories* → `ElevCRM`.
4. **Gravar os dois secrets** em `ElevCRM` → *Settings* → *Secrets and
   variables* → *Actions* → *New repository secret*:
   - `RELEASE_APP_ID` = o **App ID** (número, na página *General* do App).
   - `RELEASE_APP_PRIVATE_KEY` = o **conteúdo inteiro** do `.pem`, incluindo as
     linhas `-----BEGIN RSA PRIVATE KEY-----` e `-----END ...-----`.

Conferir, sem expor nada:

```bash
gh secret list --repo Elevstudio-Dev/ElevCRM
```

Deve listar os dois nomes (nunca os valores).

## O ensaio, antes de qualquer VPS

Com os secrets no lugar, o ciclo inteiro pode ser ensaiado sem cliente nenhum:

1. *Actions* → *release* → *Run workflow*. Ele lê `.changes/`, calcula o número
   (hoje: **1.16.0**, quatro fragmentos) e abre um PR de release em português.
2. Fazer merge do PR. Ele cria a tag `v1.16.0`, o `publish-image.yml` publica
   `ghcr.io/elevstudio-dev/elevcrm`, `elevcrm-worker` e `elevcrm-scheduler`, e
   o próprio release confere as três no registro — **falha alto** se não
   aparecerem.

Só depois disso vale instalar a VPS: instalar antes é descobrir na casa do
cliente que a imagem não existe.

## O que NÃO fazer

- Não usar um *personal access token* no lugar do App. Funciona, mas prende a
  distribuição inteira à conta pessoal de uma pessoa — e ao dia em que ela sair.
- Não commitar o `.pem`. O `.gitignore` não protege contra `git add` de um
  arquivo com outro nome.
