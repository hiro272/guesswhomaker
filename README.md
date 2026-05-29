# 🎲 Guess Who Maker — Dizing Creative
## Guia completo de deploy (~40 minutos, $0/mês)

---

## Arquivos do projeto

```
guesswhomaker/
├── index.html          → Página do cliente (upload de fotos)
├── admin.html          → Seu painel de admin
├── api/
│   └── submit-order.js → Função serverless (salva, gera PDF, WhatsApp)
├── vercel.json         → Configuração do Vercel
└── supabase-setup.sql  → SQL para criar tabelas
```

---

## PASSO 1 — Criar conta no Supabase (banco de dados + fotos)

1. Acesse **supabase.com** e crie uma conta gratuita
2. Clique em **New project**
3. Nome: `guesswhomaker` | Senha: crie uma forte | Região: escolha a mais próxima
4. Aguarde ~2 minutos para o projeto criar
5. Vá em **SQL Editor** (menu esquerdo) → cole o conteúdo de `supabase-setup.sql` → clique **Run**
6. Vá em **Storage** → clique **New bucket**:
   - Crie o bucket `photos` → marque **Public** → Save
   - Crie o bucket `pdfs` → marque **Public** → Save
7. Vá em **Settings > API** e copie:
   - **Project URL** (ex: `https://abcd1234.supabase.co`)
   - **anon public** key
   - **service_role** key (clique em "Reveal")

---

## PASSO 2 — Configurar CallMeBot (notificações WhatsApp)

1. No seu WhatsApp, adicione o número: **+34 644 52 74 97**
2. Mande a mensagem exata: `I allow callmebot to send me messages`
3. Você receberá uma resposta com sua **API key** (ex: `1234567`)
4. Guarde o número e a key — você vai precisar no Passo 3

---

## PASSO 3 — Publicar no Vercel

1. Acesse **github.com** e crie uma conta gratuita (se não tiver)
2. Crie um novo repositório chamado `guesswhomaker`
3. Faça upload de todos os arquivos desta pasta para o repositório
4. Acesse **vercel.com**, crie conta gratuita e clique **New Project**
5. Importe o repositório `guesswhomaker` do GitHub
6. Antes de clicar em Deploy, configure as **Environment Variables**:

| Variable name             | Value                        |
|---------------------------|------------------------------|
| `SUPABASE_URL`            | URL do seu projeto Supabase  |
| `SUPABASE_SERVICE_KEY`    | service_role key do Supabase |
| `CALLMEBOT_PHONE`         | Seu número com DDI (+1...)   |
| `CALLMEBOT_APIKEY`        | API key recebida no passo 2  |

7. Clique **Deploy** — em ~1 minuto seu app estará em:
   `https://guesswhomaker.vercel.app`

---

## PASSO 4 — Instalar dependências

No painel do Vercel, vá em **Settings > Functions** e adicione no package.json:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.38.0",
    "jspdf": "^2.5.1"
  }
}
```

Ou crie um arquivo `package.json` na raiz com esse conteúdo.

---

## Como usar no dia a dia

### Gerar link para um cliente:
1. Acesse `https://guesswhomaker.vercel.app/admin`
2. Clique em "New order link"
3. Preencha o nome do cliente e clique em "Generate link"
4. Clique em "Send via WhatsApp" para enviar direto

### O que o cliente vê:
- Página bonita da Dizing Creative
- Upload das 24 fotos e nomes
- Revisão final antes de confirmar

### Quando o cliente confirmar:
- Você recebe WhatsApp com:
  - Nome do cliente
  - Link para baixar PDF das cartas
  - Link para baixar PDF do tabuleiro

---

## URLs importantes

| URL | O que é |
|-----|---------|
| `guesswhomaker.vercel.app` | Página do cliente |
| `guesswhomaker.vercel.app/admin` | Seu painel admin |
| `guesswhomaker.vercel.app/?order=XXXX` | Link único por pedido |

---

## Suporte

Desenvolvido por **Dizing Creative**
Dúvidas? Entre em contato pelo WhatsApp.
