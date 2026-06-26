# 🧠 Revisão Espaçada

Um app leve e gentil de **revisão espaçada** (spaced repetition) para lembrar de tudo estudando pouquinho, no momento certo, todo dia. 🌱

Cada matéria avança por etapas de intervalo crescente conforme você revisa. Acertou? A próxima revisão fica mais distante. Esqueceu? Ela volta a aparecer logo.

## ✨ Funcionalidades

- **Login com Google** (Firebase Auth) e dados sincronizados na nuvem (Firestore)
- **Revisão espaçada por etapas**: Novo → Aprendendo → Consolidando → Reforçando → Avançado → Dominando (1, 7, 14, 30, 60 e 120 dias)
- **Aba Hoje**: o que revisar hoje, com botões *lembrei* / *não lembrei*
- **Sequência (streak)** diária para manter a constância
- **Conquistas** desbloqueáveis por categoria e tier (matérias, sequência, revisões, domínio), com barra de progresso nas que faltam e **celebração animada** (medalha + confete) ao desbloquear
- **Adiar revisão** ("+1d") e **renomear** matéria com edição inline
- **Heatmap de atividade** ("Sua constância") dos últimos 6 meses, com tooltip de *lembrei / esqueci* por dia
- **Calendário** dos próximos 14 dias e **gráfico** de revisões por dia
- **Busca e ordenação** de matérias
- **Anotações** por matéria (resumo, links, dicas)
- **Importar / exportar** backup em JSON
- **Tema claro/escuro** com preferência salva
- **PWA**: instalável na tela inicial e funciona **offline**

## 🛠️ Tecnologias

- HTML, CSS e JavaScript puro (sem build, sem framework) — tudo em um único `index.html`
- [Firebase](https://firebase.google.com/) — Authentication (Google) + Cloud Firestore (com cache offline persistente)
- [Chart.js](https://www.chartjs.org/) — gráfico de revisões
- [Tabler Icons](https://tabler.io/icons) e [Google Fonts](https://fonts.google.com/) (Quicksand + Plus Jakarta Sans)
- **Service Worker** + **Web App Manifest** para o PWA

## 📁 Estrutura

```
.
├── index.html              # o app inteiro (HTML + CSS + JS)
├── manifest.webmanifest    # metadados do PWA
├── sw.js                   # service worker (cache offline)
├── icon-192.png            # ícones do app
├── icon-512.png
├── icon-maskable-512.png
└── apple-touch-icon.png
```

> ⚠️ Todos os arquivos precisam ficar **na mesma pasta** do `index.html` para o PWA encontrar o manifest, o service worker e os ícones.

## 🚀 Como rodar

O app é estático, mas o **PWA e o login do Firebase exigem HTTPS** (ou `localhost`) — abrir o arquivo direto via `file://` não habilita o service worker.

### Online (GitHub Pages)
1. Suba os arquivos para um repositório no GitHub
2. Em **Settings → Pages**, publique a branch
3. Acesse a URL gerada (`https://<usuario>.github.io/<repo>/`)

### Local
Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
npx serve .
# ou
python -m http.server 8000
```

E acesse `http://localhost:8000`.

## 🔥 Configuração do Firebase

A configuração fica em `index.html` (`firebaseConfig`). A `apiKey` do Firebase é **pública por natureza** em apps web — a segurança real vem das **Firestore Security Rules**. Cada usuário só pode acessar o próprio documento:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

> Garanta que as regras **não** estejam em modo de teste (`allow read, write: if true`), senão qualquer pessoa poderia ler/apagar os dados de todos.

## 🔒 Privacidade

Os dados (matérias, anotações, histórico) ficam na conta do usuário no Firestore. Há exportação/importação em JSON para backup local a qualquer momento.
