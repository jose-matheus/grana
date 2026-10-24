# Grana

Controle de faturas de cartão, gastos fixos e investimentos. É um web app instalável (PWA) feito para o iPhone. Os dados ficam só no aparelho, com backup em `.json` e planilha em `.csv`.

## O que faz

- **Cartões:** cada cartão tem nome, dia de fechamento, dia de vencimento e limite. Compras feitas a partir do dia de fechamento caem na fatura seguinte.
- **Lançamentos:** gastos à vista ou parcelados (até 24x), no cartão ou por Pix/débito, sempre com uma categoria. Numa compra parcelada dá para dizer em qual parcela ela está na fatura aberta.
- **Receitas:** salário e outras entradas, avulsas ou mensais.
- **Fixos:** financiamento do carro, aluguel, assinaturas e salário, com controle de parcelas (ex.: 20 de 48).
- **Resumo do mês:** receitas, gastos e quanto sobra, além de quanto foi para cada categoria, separando o que veio da fatura do que veio de fixos. Exemplo: Carro = financiamento + combustível no cartão.
- **Faturas:** a aba abre na fatura aberta de cada cartão. Uma compra feita depois do fechamento aparece na fatura do mês seguinte.
- **Investimentos:** aportes, resgates e atualização de saldo, com o rendimento calculado.

## Rodar no computador

```bash
python -m http.server 5180
```

Depois abra http://localhost:5180.

## Instalar no iPhone

1. Publique a pasta num endereço HTTPS (ex.: GitHub Pages).
2. Abra o endereço no **Safari**, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. Abra o app pelo ícone. Os dados ficam guardados no app instalado, separados do Safari.

## Publicar uma nova versão

Troque `CACHE` em `sw.js` (ex.: `grana-v2`) para o iPhone baixar os arquivos novos. A atualização aparece na segunda vez que você abrir o app.
