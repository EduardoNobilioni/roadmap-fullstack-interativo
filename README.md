# Trilha de Estudos

Aplicação estática para quem está na faculdade de tecnologia e não sabe por onde estudar. Você responde três perguntas e recebe uma trilha com progresso, estimativa de tempo e ideias de projeto. Tudo fica no navegador, sem cadastro e sem servidor.

A trilha Full-Stack de 7 etapas e 46 tópicos continua aqui, junto com Front-end, Back-end, Dados, Mobile e DevOps.

Publicação: https://eduardonobilioni.github.io/roadmap-fullstack-interativo/

## O que dá para fazer

- Escolher área, nível (iniciante, intermediário ou avançado) e horas por semana
- Ver tópicos abaixo do seu nível como opcionais, com a opção de contá-los de novo no progresso
- Acompanhar o progresso geral e o de cada etapa
- Estimar a duração de cada etapa no seu ritmo semanal
- Buscar e filtrar por pendentes, concluídos, opcionais e ocultos
- Anotar em cada tópico e escrever observações em cada etapa
- Ver ideias de projeto do seu nível, ou de todos os níveis
- Marcar projetos como feitos e acrescentar os seus
- Criar tópicos, ocultar, reordenar e trocar de trilha sem perder o progresso das outras
- Alternar tema claro e escuro
- Exportar e importar um backup JSON, inclusive o formato antigo do roadmap Full-Stack
- Enviar o plano por link. O link leva a configuração, não as anotações nem o progresso
- Autoavaliação curta por etapa, com explicação e um atalho para revisar o tópico
- Roteiro e definição de pronto nas ideias de projeto
- Plano de estudo semanal, com grade da faculdade importada (ICS, CSV ou horário manual), intervalo antes e depois da aula e carga menor em semana de prova
- Baixar o plano em `.ics` (só as sessões de estudo), PDF, PNG ou checklist Markdown

## Como usar no dia a dia

Na primeira visita o app pergunta a área, o nível e as horas. O botão **Refazer/Trocar trilha** abre as mesmas perguntas de novo. O progresso, as anotações, as observações e as ideias criadas por você continuam na trilha.

**Compartilhar** copia um link com a configuração. Quem abre o link vê o plano. Se a pessoa já tinha uma trilha, o app pede confirmação antes de substituir opcionais, ordem e ideias criadas.

## Rodar localmente

Os dados ficam em arquivos separados. Abra com um servidor estático, não dê dois cliques no `index.html`.

```bash
python3 -m http.server 8080
```

Depois acesse http://localhost:8080

Para conferir os dados e as regras de progresso:

```bash
npm test
npm run validate
```

Não há dependências para instalar. O `npm` aqui só chama o Node.

## Estrutura

- `index.html` — página
- `js/app.js` — interface
- `js/model.js` — progresso, personalização, importação e observações
- `js/share.js` — plano compactado no link
- `data/tracks/index.json` — lista de trilhas
- `data/tracks/*.json` — conteúdo de cada trilha
- `examples/backup-legado.json` — exemplo do JSON antigo, só com `completed` e `notes`

## Backup

O arquivo exportado tem `version: 2` e um objeto `tracks`. Cada trilha guarda:

- `completed` e `notes` — tópicos
- `phaseNotes` — observações da etapa
- `completedProjects` — projetos marcados como feitos
- `customTopics` e `customProjects` — o que você criou
- `studyPlan` — sessões de estudo, grade importada, semanas de prova e horários manuais
- `quizAnswers` — respostas da autoavaliação
- `overrides`, `phaseOrder` e `topicOrder` — personalização

Um JSON antigo, no formato do roadmap Full-Stack, continua válido. Ele restaura `completed` e `notes` na trilha Full-Stack e não apaga observações que já estavam salvas.

O progresso de cada trilha fica em `localStorage`, na chave `trilha_estudos_ptbr_v2`. Quem já usava a versão anterior é migrado a partir de `roadmap_fullstack_ptbr_v1`.

## Contribuir

O formato de uma trilha nova, incluindo ideias de projeto por nível, está em [CONTRIBUTING.md](CONTRIBUTING.md).
