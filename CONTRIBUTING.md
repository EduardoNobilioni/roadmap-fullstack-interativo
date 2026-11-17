# Contribuir com uma trilha

O conteúdo mora em `data/tracks/`. Não precisa de build. Um arquivo JSON novo e uma linha no índice já entram no app.

## Acrescentar uma trilha

1. Copie uma trilha curta, por exemplo `data/tracks/frontend.json`, para `data/tracks/seu-id.json`.
2. Troque o `id` (letras minúsculas, números e hífen). O mesmo valor vai no arquivo e no índice.
3. Inclua o arquivo em `data/tracks/index.json`, na ordem em que ele deve aparecer no onboarding.
4. Rode `npm run validate`.

Não mude o `id` de um tópico, projeto ou etapa depois que a trilha estiver publicada. O progresso das pessoas usa esses ids.

## Formato

```json
{
  "id": "exemplo",
  "name": "Nome visível",
  "tagline": "Uma frase para o cartão de escolha",
  "description": "Um parágrafo sobre para quem é a trilha.",
  "phases": [
    {
      "id": "ex-fase-1",
      "number": 1,
      "badgeTitle": "Nome curto da conquista",
      "title": "Título da etapa, sem o prefixo Etapa N",
      "topics": [],
      "projects": []
    }
  ]
}
```

### Tópico

| Campo | O que é |
| --- | --- |
| `id` | Único na trilha. Não reutilize o id de um projeto. |
| `title` | Nome do tópico |
| `description` | O que a pessoa vai aprender, em uma ou duas frases |
| `level` | `iniciante`, `intermediario` ou `avancado`, sem acento |
| `hours` | Horas estimadas, número maior que zero |
| `tags` | Lista curta de tecnologias ou conceitos |
| `prerequisites` | Ids de outros tópicos desta trilha. Lista vazia se não houver |
| `resources` | Pelo menos um material gratuito |

O app trata como opcional o tópico cujo nível está abaixo do nível escolhido pela pessoa. `avancado` deixa `iniciante` e `intermediario` opcionais.

### Recurso

```json
{
  "title": "Guia JavaScript (MDN)",
  "url": "https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide",
  "lang": "pt",
  "kind": "documentacao"
}
```

- `lang`: `pt` ou `en`
- `kind`: `leitura`, `curso`, `documentacao`, `pratica` ou `video`
- `url`: `http` ou `https`, de preferência uma página que você abriu

Prefira material em português quando a fonte for boa e estável (MDN em pt-BR, documentação traduzida, Khan Academy, GitHub Docs em português). Se a melhor referência gratuita estiver em inglês, use `lang: "en"` em vez de um tutorial fraco.

### Ideia de projeto

Cada etapa precisa de ao menos uma ideia por nível. A pessoa vê as do nível dela e pode abrir as outras. Ela também pode criar ideias próprias e marcar qualquer projeto como feito. Isso fica no navegador, não no JSON.

```json
{
  "id": "ex-projeto-iniciante",
  "title": "Página de uma disciplina",
  "description": "O que entregar, em concreto. Evite 'faça um app completo' sem recorte.",
  "level": "iniciante",
  "hours": 8
}
```

O `id` do projeto também não pode repetir um tópico. `hours` entra na ideia, não na barra de progresso dos tópicos.

Roteiro e definição de pronto são opcionais:

```json
"steps": ["Escrever o recorte", "Implementar o exemplo", "Conferir a lista de pronto"],
"definitionOfDone": ["Outra pessoa abre o resultado sozinha", "O exemplo pedido está visível"]
```

### Autoavaliação

Cada etapa precisa de `quiz` com pelo menos duas perguntas. Um tópico também pode ter `quiz`. Não é nota nem certificado.

```json
"quiz": [
  {
    "id": "fase-1-q1",
    "prompt": "O que o DNS faz numa requisição?",
    "reviewTopicId": "f1-internet",
    "choices": [
      { "id": "a", "text": "Traduz o nome para um endereço", "correct": true, "explanation": "Sem isso o navegador não acha o servidor." },
      { "id": "b", "text": "Estiliza a página", "correct": false, "explanation": "Estilo é CSS." }
    ]
  }
]
```

`reviewTopicId` precisa ser um tópico da mesma trilha. Exatamente uma alternativa é `correct`. A explicação aparece na hora, e o erro aponta de volta para o tópico.

O plano de estudo e a grade importada não ficam no JSON da trilha. Eles ficam no navegador de cada estudante e no backup.

## O que não vai no JSON

Anotações, observações da etapa, progresso, tópicos criados pela pessoa e a ordem personalizada ficam no `localStorage` e no backup JSON. O arquivo da trilha é só o currículo.

## Conferir

```bash
npm run validate
npm test
```

`validate` exige etapas, tópicos com recurso, pré-requisitos existentes e uma ideia de projeto para cada nível. `test` cobre o progresso, o backup antigo e o link de compartilhamento.
