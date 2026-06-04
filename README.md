# 📚 Revisão Espaçada

Aplicativo web para gerenciar estudos com a técnica de **revisão espaçada** — um método científico que programa revisões em intervalos crescentes para maximizar a retenção do conteúdo.

## ✨ Funcionalidades

- **Painel diário** — veja exatamente o que precisa revisar hoje
- **Revisão espaçada** — intervalos automáticos de 1 → 3 → 7 → 14 → 30 → 60 → 120 dias
- **Lembrei / Não lembrei** — avança ou recua o estágio da matéria com base no seu desempenho
- **Streak** — contador de dias consecutivos de estudo
- **Calendário** — visualize as revisões dos próximos 14 dias
- **Gráfico** — histórico de revisões das últimas 4 semanas
- **Anotações** — adicione resumos, links ou dicas em cada matéria
- **Exportar / Importar** — backup dos seus dados em `.json`
- **Sincronização em nuvem** — login com Google via Firebase, dados disponíveis em qualquer dispositivo
- **Modo escuro** — segue automaticamente a preferência do sistema

## 🚀 Como usar

### Acessar online
Acesse o site pelo link do GitHub Pages e entre com sua conta Google.

### Rodar localmente
Basta abrir o arquivo `index.html` no navegador.
> ⚠️ O login com Google requer que o arquivo seja servido via HTTP. Para rodar localmente com autenticação, use uma extensão como **Live Server** no VS Code.

## 📖 Como funciona a revisão espaçada

Ao adicionar uma matéria, você escolhe:

| Modo | Descrição |
|------|-----------|
| **Matéria nova** | Estudou hoje pela primeira vez — próxima revisão amanhã |
| **Revisando hoje** | Já estuda essa matéria — aparece na lista do dia para marcar |

A cada revisão bem-sucedida, o intervalo aumenta automaticamente:

```
Estágio 1 → revisão em 1 dia
Estágio 2 → revisão em 3 dias
Estágio 3 → revisão em 7 dias
Estágio 4 → revisão em 14 dias
Estágio 5 → revisão em 30 dias
Estágio 6 → revisão em 60 dias
Estágio 7 → revisão em 120 dias
```

Se você **não lembrou**, o estágio recua e a matéria volta amanhã.

## 🛠️ Tecnologias

- **HTML, CSS, JavaScript** — sem frameworks, arquivo único
- **Firebase Authentication** — login com Google
- **Firebase Firestore** — banco de dados em nuvem
- **Chart.js** — gráfico de progresso
- **Tabler Icons** — ícones

## ⚙️ Configuração do Firebase

Para rodar com sua própria conta Firebase:

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com)
2. Ative **Authentication** com o provedor Google
3. Crie um banco **Firestore** em modo de teste
4. Registre um app Web e copie o `firebaseConfig`
5. Substitua o bloco `firebaseConfig` no `index.html`
6. Adicione seu domínio em **Authentication → Settings → Authorized domains**

## 📦 Estrutura do projeto

```
/
├── index.html   # Aplicativo completo (HTML + CSS + JS)
└── README.md    # Este arquivo
```

## 📄 Licença

Uso pessoal livre.
