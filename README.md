
/*
Gabriel Henrique de Paula Vilas Boas Correa - RM: 551395
Pedro Nezi Godoy - RM: 550370
Gustavo Kenji Tsuruoka - RM: 550818
*/

# Festo Digital Twin Vision - Frontend

Este projeto é uma interface web para visualização de dados de sensores em tempo real, como parte de um sistema de Digital Twin desenvolvido para monitoramento de processos industriais (Festo Challenge).

## 📌 Tecnologias Utilizadas

- **Vite** (Build tool para React)
- **React.js** (Framework frontend)
- **TypeScript** (Tipagem estática)
- **Tailwind CSS** (Framework de estilos)
- **Axios** (Para requisições HTTP)
- **Victory Native / Recharts** (Para gráficos de visualização de dados)

## 📂 Estrutura Básica do Projeto

- `src/` → Código-fonte principal do frontend
- `components/` → Componentes React reutilizáveis
- `pages/` → Páginas da aplicação
- `public/` → Arquivos estáticos
- `vite.config.ts` → Configuração do Vite
- `tailwind.config.ts` → Configuração do Tailwind
- `package.json` → Dependências e scripts NPM

## 🚀 Como Executar Localmente

### Pré-requisitos:

- **Node.js** (Versão recomendada: 18.x ou superior)
- **NPM** ou **Yarn**

### Passos:

1. Instale as dependências:

```bash
npm install
```

2. Rode o servidor de desenvolvimento:

```bash
npm run dev
```

3. Acesse no navegador:

```
http://localhost:5173
```

## 🌐 Integração com Backend

- O frontend consome endpoints de um backend Java (Spring Boot), responsável por persistir e fornecer os dados de sensores.
- Para o correto funcionamento, altere a URL base da API nas configurações do projeto (exemplo: dentro de um arquivo de configuração ou direto nos serviços Axios).

## 🧪 Testes

- Testes podem ser feitos manualmente navegando pelas telas do frontend.
- Para testar com dados reais, o backend precisa estar em execução.

## 📸 Funcionalidades Principais

- **Listagem de sensores:** Exibe todos os sensores com status atual.
- **Visualização de detalhes:** Permite ver histórico de leituras de cada sensor.
- **Configuração de conexão:** Possibilidade de alterar a URL da API backend.
- **Visualização gráfica:** Gráficos simples mostrando evolução de valores dos sensores.
