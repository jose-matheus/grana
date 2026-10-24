'use strict';

const STORAGE_KEY = 'grana:v1';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const PALETA = ['#9BE15D', '#4EA8FF', '#FF5A5F', '#F7B32B', '#A78BFA', '#34D399', '#F472B6', '#22D3EE', '#FB923C', '#94A3B8'];
const TIPOS_INVEST = ['Renda fixa', 'Tesouro Direto', 'Ações', 'FIIs', 'ETFs', 'Cripto', 'Previdência', 'Poupança', 'Outro'];
const MOVES = {
  aporte: { label: 'Aporte', sign: '+', title: 'Novo aporte' },
  resgate: { label: 'Resgate', sign: '−', title: 'Resgate' },
  saldo: { label: 'Saldo atualizado', sign: '=', title: 'Atualizar saldo' },
};

/* ---------- utilitários ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sum = list => list.reduce((acc, e) => acc + e.amount, 0);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = cents => brl.format((cents || 0) / 100);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const color = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#94A3B8');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const monthOf = iso => iso.slice(0, 7);
const thisMonth = () => monthOf(todayISO());

function addMonths(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function monthDiff(from, to) {
  const [ya, ma] = from.split('-').map(Number);
  const [yb, mb] = to.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
function monthShort(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(y).slice(2)}`;
}
function dateIn(key, day) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`;
}
const fmtDay = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtFull = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Aceita "1.234,56", "1234,56" e "1234.56"; devolve centavos.
function parseMoney(s) {
  s = String(s ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(s) * 100);
}
const centsToInput = c => (c / 100).toFixed(2).replace('.', ',');

/* ---------- estado ---------- */

function defaultState() {
  return {
    version: 1,
    cards: [],
    categories: [
      { id: 'carro', name: 'Carro', color: '#4EA8FF', pinned: true },
      { id: 'ifood', name: 'iFood', color: '#FF5A5F', pinned: true },
      { id: 'mercado', name: 'Mercado', color: '#F7B32B' },
      { id: 'casa', name: 'Casa', color: '#A78BFA' },
      { id: 'lazer', name: 'Lazer', color: '#34D399' },
      { id: 'saude', name: 'Saúde', color: '#F472B6' },
      { id: 'assinaturas', name: 'Assinaturas', color: '#22D3EE', recurring: true },
      { id: 'outros', name: 'Outros', color: '#94A3B8' },
      { id: 'salario', name: 'Salário', color: '#9BE15D', kind: 'income' },
      { id: 'extra', name: 'Renda extra', color: '#34D399', kind: 'income' },
    ],
    expenses: [],
    fixed: [],
    investments: [],
    moves: [],
    goal: { monthly: null },
    meta: { lastBackup: null },
  };
}

// Completa dados salvos por versões anteriores do app.
function migrate(s) {
  s = { ...defaultState(), ...s };
  if (!s.categories.some(c => c.kind === 'income')) {
    s.categories.push(...defaultState().categories.filter(c => c.kind === 'income'));
  }
  const subs = s.categories.find(c => c.id === 'assinaturas');
  if (subs && subs.recurring === undefined) subs.recurring = true;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* começa do zero */ }
  return defaultState();
}

let state = load();
// invMonth é o mês da aba Faturas, que abre na fatura aberta do cartão.
const ui = { tab: 'resumo', month: thisMonth(), invMonth: thisMonth(), cardId: null };

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Não foi possível salvar');
  }
}
function commit() {
  save();
  render();
}

const cardById = id => state.cards.find(c => c.id === id);
const catById = id => state.categories.find(c => c.id === id) || { id, name: 'Sem categoria', color: '#94A3B8' };
const catsOf = kind => state.categories.filter(c => (c.kind || 'expense') === kind);
const isIncome = x => x.type === 'income';
// Compra à vista no cartão numa categoria recorrente (ex.: Assinaturas) se
// repete em toda fatura até endMonth, a última fatura cobrada.
const isRecurring = e => !isIncome(e) && !!e.cardId && (e.installments || 1) === 1 && !!catById(e.categoryId).recurring;

/* ---------- regras de fatura ---------- */

// A fatura é identificada pelo mês do vencimento. Compras a partir do dia
// de fechamento entram na fatura seguinte.
function invoiceMonthFor(card, iso) {
  const day = Number(iso.slice(8, 10));
  const close = day >= card.closingDay ? addMonths(monthOf(iso), 1) : monthOf(iso);
  return card.dueDay > card.closingDay ? close : addMonths(close, 1);
}
function invoiceDates(card, key) {
  const close = card.dueDay > card.closingDay ? key : addMonths(key, -1);
  return { close: dateIn(close, card.closingDay), due: dateIn(key, card.dueDay) };
}
const openInvoice = card => invoiceMonthFor(card, todayISO());
// A parcela 1 cai na fatura da data da compra, a não ser que o usuário
// tenha informado em qual parcela a compra está (firstInvoice).
const firstInvoiceOf = (e, card) => e.firstInvoice || invoiceMonthFor(card, e.date);

function invoiceStatus(card, key) {
  const open = openInvoice(card);
  if (key === open) return { label: 'Aberta', cls: 'open' };
  return key < open ? { label: 'Fechada', cls: '' } : { label: 'Futura', cls: '' };
}
function splitInstallments(total, n) {
  const base = Math.floor(total / n);
  const parts = Array(n).fill(base);
  parts[0] += total - base * n;
  return parts;
}

// Fatura (mês do vencimento) que fecha no mês informado.
const invoiceClosingIn = (card, key) => (card.dueDay > card.closingDay ? key : addMonths(key, 1));

// Tudo o que pesa no mês: parcelas de cartão, Pix/débito pela data, os gastos
// fixos (financiamentos, assinaturas) e as receitas. No Resumo, a fatura conta
// no mês em que fecha, que é quando as compras aconteceram; com byDue (aba
// Faturas), key já é o mês do vencimento.
function entriesFor(key, byDue = false) {
  const out = [];
  for (const e of state.expenses) {
    const base = { categoryId: e.categoryId, desc: e.desc, date: e.date, ref: e.id };
    if (isIncome(e)) {
      if (monthOf(e.date) === key) out.push({ ...base, kind: 'income', amount: e.amount, label: '' });
    } else if (e.cardId) {
      const card = cardById(e.cardId);
      if (!card) continue;
      const n = e.installments || 1;
      const inv = byDue ? key : invoiceClosingIn(card, key);
      const i = monthDiff(firstInvoiceOf(e, card), inv);
      if (isRecurring(e)) {
        if (i >= 0 && (!e.endMonth || inv <= e.endMonth)) out.push({ ...base, kind: 'card', cardId: card.id, amount: e.amount, label: 'mensal', recurring: true });
      } else if (i >= 0 && i < n) {
        out.push({ ...base, kind: 'card', cardId: card.id, amount: splitInstallments(e.amount, n)[i], label: n > 1 ? `${i + 1}/${n}` : '', installment: n > 1 });
      }
    } else if (monthOf(e.date) === key) {
      out.push({ ...base, kind: 'other', amount: e.amount, label: '' });
    }
  }
  for (const f of state.fixed) {
    const i = monthDiff(f.startMonth, key);
    if (i >= 0 && (!f.total || i < f.total)) {
      out.push({ kind: isIncome(f) ? 'income' : 'fixed', fixed: true, categoryId: f.categoryId, desc: f.name, date: dateIn(key, f.dueDay || 1), amount: f.amount, label: f.total ? `${i + 1}/${f.total}` : '', ref: f.id });
    }
  }
  return out;
}

// Limite comprometido: parcelas da fatura aberta em diante.
function limitUsed(card) {
  const open = openInvoice(card);
  let used = 0;
  for (const e of state.expenses) {
    if (e.cardId !== card.id || isIncome(e)) continue;
    const n = e.installments || 1;
    const first = firstInvoiceOf(e, card);
    if (isRecurring(e)) {
      if (!e.endMonth || e.endMonth >= open) used += e.amount;
      continue;
    }
    splitInstallments(e.amount, n).forEach((v, i) => {
      if (addMonths(first, i) >= open) used += v;
    });
  }
  return used;
}

function groupByCategory(entries) {
  const map = new Map();
  for (const e of entries) {
    let g = map.get(e.categoryId);
    if (!g) {
      g = { cat: catById(e.categoryId), total: 0, card: 0, fixed: 0, other: 0, fixedNames: [] };
      map.set(e.categoryId, g);
    }
    g.total += e.amount;
    g[e.kind] += e.amount;
    if (e.kind === 'fixed') g.fixedNames.push(e.desc);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
function composition(g) {
  const parts = [];
  if (g.fixed) parts.push(`${g.fixedNames.length === 1 ? esc(g.fixedNames[0]) : 'Fixos'} ${money(g.fixed)}`);
  if (g.card) parts.push(`Cartão ${money(g.card)}`);
  if (g.other) parts.push(`Pix/débito ${money(g.other)}`);
  return parts.join(' · ');
}

/* ---------- investimentos ---------- */

function invStats(id) {
  const moves = state.moves
    .map((m, i) => ({ ...m, i }))
    .filter(m => m.investmentId === id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i);
  let balance = 0;
  let invested = 0;
  for (const m of moves) {
    if (m.kind === 'aporte') { balance += m.amount; invested += m.amount; }
    else if (m.kind === 'resgate') { balance -= m.amount; invested -= m.amount; }
    else balance = m.amount;
  }
  return { balance, invested, gain: balance - invested, moves };
}
function gainText(gain, invested) {
  const pct = invested > 0 ? ` (${(gain / invested * 100).toFixed(1).replace('.', ',')}%)` : '';
  return `<span class="${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}${pct}</span>`;
}

/* ---------- pedaços de interface ---------- */

const ic = (name, c) => `<i class="ic" style="--c:${color(c)}">${esc((name || '?').trim().charAt(0).toUpperCase())}</i>`;

function stackBar(groups, total) {
  if (!total) return '';
  return `<div class="stack">${groups.map(g => `<i style="--c:${color(g.cat.color)};width:${(g.total / total * 100).toFixed(2)}%"></i>`).join('')}</div>`;
}

function entryRow(e) {
  const cat = catById(e.categoryId);
  const action = e.fixed ? 'edit-fixed' : 'edit-expense';
  const meta = [fmtDay(e.date), esc(cat.name), e.label].filter(Boolean).join(' · ');
  const val = e.kind === 'income' ? `<span class="pos">+ ${money(e.amount)}</span>` : money(e.amount);
  return `<button class="row" data-action="${action}" data-id="${esc(e.ref)}">
    ${ic(cat.name, cat.color)}
    <span class="row-main"><b>${esc(e.desc)}</b><small>${meta}</small></span>
    <span class="row-val">${val}</span>
  </button>`;
}

function empty(title, text, action, label) {
  return `<div class="empty"><h3>${title}</h3><p>${text}</p><button class="btn primary" data-action="${action}">${label}</button></div>`;
}

function radioChip(name, value, label, c, checked) {
  return `<label class="chip" style="--c:${color(c)}"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}>${esc(label)}</label>`;
}
function typeToggle(type, labels = ['Gasto', 'Receita']) {
  return `<div class="seg">
    <label><input type="radio" name="type" value="expense" ${type !== 'income' ? 'checked' : ''}>${labels[0]}</label>
    <label><input type="radio" name="type" value="income" ${type === 'income' ? 'checked' : ''}>${labels[1]}</label>
  </div>`;
}
// Categorias de gasto e de receita ficam em grupos separados; só o do tipo escolhido aparece.
function categoryPicker(item, defaultExpense) {
  const current = item?.categoryId;
  const group = (kind, name, fallback) => {
    const cats = catsOf(kind);
    const sel = cats.some(c => c.id === current) ? current : fallback || cats[0]?.id;
    return `<fieldset class="field" data-only="${kind}"><legend>Categoria</legend><div class="chips wrap">
      ${cats.map(c => radioChip(name, c.id, c.name, c.color, c.id === sel)).join('')}
    </div></fieldset>`;
  };
  return group('expense', 'categoryId', defaultExpense) + group('income', 'incomeCategoryId');
}
function pickedCategory(fd) {
  return fd.get('type') === 'income' ? fd.get('incomeCategoryId') : fd.get('categoryId');
}
function toggleType(form) {
  const type = new FormData(form).get('type') || 'expense';
  form.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== type; });
  return type;
}

function swatches(selected) {
  return `<div class="chips wrap">${PALETA.map(c => `<label class="chip swatch" style="--c:${c}" aria-label="${c}"><input type="radio" name="color" value="${c}" ${c === selected ? 'checked' : ''}></label>`).join('')}</div>`;
}

/* ---------- metas ---------- */

// Mês em que fecha a fatura que vence em key (inverso de invoiceClosingIn).
const closingMonthOf = (card, key) => (card.dueDay > card.closingDay ? key : addMonths(key, -1));

// Parcelamentos de cartão ainda em aberto a partir de base (mês de fechamento,
// como no Resumo) e quanto eles pesam em cada mês se nada novo for parcelado.
function installmentPlan(base = thisMonth()) {
  const items = [];
  for (const e of state.expenses) {
    const n = e.installments || 1;
    const card = cardById(e.cardId);
    if (isIncome(e) || !card || n < 2) continue;
    const first = firstInvoiceOf(e, card);
    const parts = splitInstallments(e.amount, n);
    let remaining = 0;
    let current = 0;
    parts.forEach((v, i) => {
      if (closingMonthOf(card, addMonths(first, i)) < base) return;
      remaining += v;
      current ||= i + 1;
    });
    if (remaining) items.push({ e, n, current, each: parts[n - 1], remaining, end: closingMonthOf(card, addMonths(first, n - 1)) });
  }
  items.sort((a, b) => a.end.localeCompare(b.end) || b.each - a.each);
  const lastEnd = items.reduce((m, it) => (it.end > m ? it.end : m), base);
  const months = Array.from({ length: monthDiff(base, lastEnd) + 2 }, (_, i) => addMonths(base, i));
  const burden = months.map(k => sum(entriesFor(k).filter(e => e.installment)));
  return { items, months, burden, now: burden[0], free: months[months.length - 1], remaining: items.reduce((a, it) => a + it.remaining, 0) };
}

// "Sem novos parcelamentos, em X você paga Y a menos por mês."
function planMessage(p, full) {
  const goal = state.goal?.monthly;
  const gain = i => p.now - p.burden[i];
  let i = goal ? p.burden.findIndex((_, k) => k > 0 && gain(k) >= goal) : -1;
  if (i < 0) i = p.burden.findIndex((_, k) => k > 0 && gain(k) > 0);
  const parts = [];
  if (i > 0) {
    parts.push(`Sem novos parcelamentos, em <b>${monthShort(p.months[i])}</b> suas parcelas caem de ${money(p.now)} para ${money(p.burden[i])}: <b class="pos">+${money(gain(i))} por mês</b>.`);
    if (goal && gain(i) >= goal) parts.push(`Isso já cobre sua meta de ${money(goal)}.`);
  }
  if (full || i !== p.months.length - 1) parts.push(`Em <b>${monthShort(p.free)}</b> todas terminam: +${money(p.now)} por mês.`);
  if (full) {
    const acc = p.burden.reduce((a, _, k) => a + (k > 0 ? gain(k) : 0), 0);
    parts.push(`Até lá, são <b>${money(acc)}</b> que deixam de sair do seu bolso em relação a hoje.`);
  }
  return parts.join(' ');
}

function barsHtml(months, values, withValues) {
  const max = Math.max(...values, 1);
  return `<div class="bars ${withValues ? 'tall' : ''}">${months.map((k, i) => `<div title="${money(values[i])}">
    ${withValues ? `<em>${values[i] ? Math.round(values[i] / 100) : ''}</em>` : ''}
    <i class="${values[i] ? '' : 'zero'}" style="height:${(values[i] / max * 100).toFixed(1)}%"></i>
    <span>${MESES_CURTOS[Number(k.slice(5)) - 1]}</span>
  </div>`).join('')}</div>`;
}

function planSection() {
  const p = installmentPlan();
  if (!p.items.length) return '';
  const months = p.months.slice(0, 6);
  return `<section class="section">
    <div class="section-head"><h2>Parcelamentos</h2><button class="link" data-action="open-plan">Ver plano</button></div>
    <button class="panel plan" data-action="open-plan">
      <span class="plan-head"><b>${p.items.length} parcelamentos ativos</b><span class="muted">${money(p.remaining)} a pagar</span></span>
      ${barsHtml(months, p.burden.slice(0, 6))}
      <span class="plan-text">${planMessage(p, false)}</span>
    </button>
  </section>`;
}

function planSheet() {
  const p = installmentPlan();
  openSheet('Plano sem parcelamentos', `
    <div class="split">
      <div><span>Ativos</span><b>${p.items.length}</b></div>
      <div><span>A pagar</span><b>${money(p.remaining)}</b></div>
      <div><span>Neste mês</span><b>${money(p.now)}</b></div>
    </div>
    <p class="hint" style="margin-top:12px">${planMessage(p, true)}</p>
    <section class="section">
      <div class="section-head"><h2>Parcelas por mês (R$)</h2></div>
      <div class="panel">${barsHtml(p.months, p.burden, true)}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Quando cada um termina</h2></div>
      <div class="panel rows">${p.items.map(it => {
        const cat = catById(it.e.categoryId);
        return `<button class="row" data-action="edit-expense" data-id="${esc(it.e.id)}">
          ${ic(cat.name, cat.color)}
          <span class="row-main"><b>${esc(it.e.desc)}</b><small>${it.current}/${it.n} · termina em ${monthShort(it.end)}</small></span>
          <span class="row-val">${money(it.each)}<small>resta ${money(it.remaining)}</small></span>
        </button>`;
      }).join('')}</div>
    </section>
    <p class="note">Os meses seguem o fechamento da fatura, como no Resumo.</p>`);
}

function goalCard(left) {
  const goal = state.goal?.monthly;
  if (!goal) {
    return `<button class="panel row" style="margin-top:12px" data-action="edit-goal">
      <span class="row-main"><b>Defina uma meta de economia</b><small>Quanto você quer guardar por mês</small></span><span class="chev">›</span>
    </button>`;
  }
  const saved = state.moves
    .filter(m => monthOf(m.date) === ui.month)
    .reduce((a, m) => a + (m.kind === 'aporte' ? m.amount : m.kind === 'resgate' ? -m.amount : 0), 0);
  const done = saved >= goal;
  const missing = goal - Math.max(0, saved);
  let status = done ? '<span class="pos">Meta do mês batida!</span>' : `Faltam <b>${money(missing)}</b>.`;
  if (!done && left !== null && left < missing) status += ` A sobra prevista (${money(Math.max(0, left))}) não cobre o que falta.`;
  return `<section class="panel pad" style="margin-top:12px">
    <div class="invoice-top"><span class="eyebrow">Meta de guardar no mês</span><button class="link" data-action="edit-goal">Editar</button></div>
    <div class="goal-line"><strong>${money(Math.max(0, saved))}</strong><span class="muted">de ${money(goal)}</span></div>
    <div class="meter ${done ? '' : 'goal'}"><i style="width:${Math.min(100, Math.max(0, saved) / goal * 100).toFixed(1)}%"></i></div>
    <small class="muted goal-status">${status}</small>
    ${done ? '' : '<button class="btn ghost block" data-action="goal-aporte">Registrar aporte</button>'}
  </section>`;
}

function limitsSection(groups) {
  const limited = catsOf('expense').filter(c => c.limit);
  if (!limited.length) return '';
  return `<section class="section">
    <div class="section-head"><h2>Limites do mês</h2></div>
    <div class="panel rows">${limited.map(c => {
      const used = groups.find(g => g.cat.id === c.id)?.total || 0;
      const pct = used / c.limit;
      const cls = pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : '';
      return `<button class="row" data-action="edit-category" data-id="${esc(c.id)}">
        ${ic(c.name, c.color)}
        <span class="row-main"><b>${esc(c.name)}</b>
          <span class="meter ${cls}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></span>
          <small class="${pct > 1 ? 'neg' : ''}">${pct > 1 ? `Passou ${money(used - c.limit)}` : `Restam ${money(c.limit - used)}`}</small>
        </span>
        <span class="row-val">${money(used)}<small>de ${money(c.limit)}</small></span>
      </button>`;
    }).join('')}</div>
  </section>`;
}

function goalForm() {
  const goal = state.goal?.monthly;
  openSheet('Meta de economia', `<form class="form" data-form="goal">
    <label class="amount"><span>Quanto quer guardar por mês</span><input name="amount" inputmode="decimal" placeholder="R$ 450,00" autocomplete="off" value="${goal ? centsToInput(goal) : ''}" required></label>
    <p class="hint">Registre cada aporte em Investimentos. O Resumo mostra quanto falta no mês e quando o fim das parcelas libera espaço para a meta.</p>
    <div class="actions">${goal ? '<button type="button" class="btn ghost danger" data-action="remove-goal">Remover</button>' : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
  if (!goal) $('form[data-form="goal"]').amount.focus();
}

/* ---------- telas ---------- */

function viewResumo() {
  if (!state.cards.length && !state.expenses.length && !state.fixed.length) {
    return `<div class="panel empty">
      <h3>Bem-vindo ao Grana</h3>
      <p>Três passos para ver para onde vai seu dinheiro.</p>
      <ul class="steps">
        <li><button class="panel" data-action="new-card"><span class="n">1</span><span><b>Cadastre seus cartões</b><br><small class="muted">Nome, dia de fechamento e vencimento</small></span></button></li>
        <li><button class="panel" data-action="new-fixed"><span class="n">2</span><span><b>Adicione gastos fixos</b><br><small class="muted">Parcela do carro, aluguel, assinaturas</small></span></button></li>
        <li><button class="panel" data-action="new-expense"><span class="n">3</span><span><b>Lance cada gasto</b><br><small class="muted">Use o botão + a qualquer momento</small></span></button></li>
      </ul>
    </div>`;
  }

  const all = entriesFor(ui.month);
  const incomes = all.filter(e => e.kind === 'income').sort((a, b) => b.date.localeCompare(a.date));
  const entries = all.filter(e => e.kind !== 'income');
  const total = sum(entries);
  const received = sum(incomes);
  const byKind = k => sum(entries.filter(e => e.kind === k));
  const groups = groupByCategory(entries);
  const pinned = catsOf('expense').filter(c => c.pinned);
  const left = received - total;

  const kinds = `<div class="split">
      <div><span>Faturas</span><b>${money(byKind('card'))}</b></div>
      <div><span>Fixos</span><b>${money(byKind('fixed'))}</b></div>
      <div><span>Pix/débito</span><b>${money(byKind('other'))}</b></div>
    </div>`;
  let html = received
    ? `<section class="panel hero">
      <span class="eyebrow">Sobra do mês</span>
      <strong class="big ${left < 0 ? 'neg' : ''}">${left < 0 ? '−' : ''}${money(Math.abs(left))}</strong>
      <div class="split two">
        <div><span>Receitas</span><b class="pos">${money(received)}</b></div>
        <div><span>Gastos</span><b>${money(total)}</b></div>
      </div>
      ${kinds}
    </section>`
    : `<section class="panel hero">
      <span class="eyebrow">Total de gastos do mês</span>
      <strong class="big">${money(total)}</strong>
      ${kinds}
    </section>`;

  const last = state.meta?.lastBackup;
  const days = last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null;
  if (state.expenses.length >= 5 && (days === null || days >= 30)) {
    html += `<div class="banner"><span>${days === null ? 'Você ainda não fez backup.' : `Último backup há ${days} dias.`}</span><button data-action="export-json">Fazer backup</button></div>`;
  }

  if (pinned.length) {
    html += `<div class="tiles">${pinned.map(c => {
      const g = groups.find(x => x.cat.id === c.id);
      return `<div class="tile" style="--c:${color(c.color)}">
        <span class="tile-name"><i class="dot"></i>${esc(c.name)}</span>
        <strong>${money(g?.total)}</strong>
        <small>${g ? composition(g) : 'Nenhum gasto no mês'}</small>
      </div>`;
    }).join('')}</div>`;
  }

  html += goalCard(received ? left : null);
  html += limitsSection(groups);
  html += planSection();

  if (groups.length) {
    html += `<section class="section">
      <div class="section-head"><h2>Por categoria</h2></div>
      <div class="panel">
        <div class="pad" style="padding-bottom:4px">${stackBar(groups, total)}</div>
        <div class="rows">${groups.map(g => `<div class="row">
          ${ic(g.cat.name, g.cat.color)}
          <span class="row-main"><b>${esc(g.cat.name)}</b><small>${composition(g)}</small></span>
          <span class="row-val">${money(g.total)}<small>${Math.round(g.total / total * 100)}%</small></span>
        </div>`).join('')}</div>
      </div>
    </section>`;
  }

  if (state.cards.length) {
    html += `<section class="section">
      <div class="section-head"><h2>Faturas que fecham no mês</h2></div>
      <div class="panel rows">${state.cards.map(card => {
        const t = sum(entries.filter(e => e.kind === 'card' && e.cardId === card.id));
        const inv = invoiceClosingIn(card, ui.month);
        const st = invoiceStatus(card, inv);
        const { close, due } = invoiceDates(card, inv);
        return `<button class="row" data-action="open-invoice" data-id="${esc(card.id)}" data-month="${inv}">
          ${ic(card.name, card.color)}
          <span class="row-main"><b>${esc(card.name)}</b><small>Fecha ${fmtDay(close)} · vence ${fmtDay(due)}</small></span>
          <span class="row-val">${money(t)}<small><span class="badge ${st.cls}">${st.label}</span></small></span>
        </button>`;
      }).join('')}</div>
    </section>`;
  }

  const fixed = entries.filter(e => e.kind === 'fixed');
  if (fixed.length) {
    html += `<section class="section">
      <div class="section-head"><h2>Gastos fixos</h2></div>
      <div class="panel rows">${fixed.map(entryRow).join('')}</div>
    </section>`;
  }

  const others = entries.filter(e => e.kind === 'other').sort((a, b) => b.date.localeCompare(a.date));
  if (others.length) {
    html += `<section class="section">
      <div class="section-head"><h2>Pix e débito</h2></div>
      <div class="panel rows">${others.map(entryRow).join('')}</div>
    </section>`;
  }

  if (incomes.length) {
    html += `<section class="section">
      <div class="section-head"><h2>Receitas</h2></div>
      <div class="panel rows">${incomes.map(entryRow).join('')}</div>
    </section>`;
  }

  if (state.investments.length) {
    const stats = state.investments.map(i => invStats(i.id));
    const bal = stats.reduce((a, s) => a + s.balance, 0);
    const inv = stats.reduce((a, s) => a + s.invested, 0);
    html += `<section class="section">
      <div class="section-head"><h2>Investimentos</h2></div>
      <button class="panel row" data-action="tab" data-tab="invest">
        <span class="row-main"><b>${money(bal)}</b><small>Rendimento ${gainText(bal - inv, inv)}</small></span>
        <span class="chev">›</span>
      </button>
    </section>`;
  }
  return html;
}

function viewFaturas() {
  if (!state.cards.length) return empty('Nenhum cartão ainda', 'Cadastre um cartão para acompanhar as faturas.', 'new-card', 'Adicionar cartão');

  const card = cardById(ui.cardId) || state.cards[0];
  if (card.id !== ui.cardId) {
    ui.cardId = card.id;
    ui.invMonth = openInvoice(card);
  }
  const key = ui.invMonth;
  const items = entriesFor(key, true).filter(e => e.kind === 'card' && e.cardId === card.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(items);
  const { close, due } = invoiceDates(card, key);
  const st = invoiceStatus(card, key);
  const open = openInvoice(card);
  const jump = key === open ? '' : `<button class="link" data-action="go-open-invoice">Ir para a fatura aberta (${monthShort(open)})</button>`;
  const groups = groupByCategory(items);
  const c = color(card.color);

  let limit = '';
  if (card.limit) {
    const used = limitUsed(card);
    limit = `<div style="margin-top:14px">
      <div class="invoice-dates" style="display:flex;justify-content:space-between"><span>Limite usado</span><span>${money(used)} de ${money(card.limit)}</span></div>
      <div class="meter"><i style="width:${Math.min(100, used / card.limit * 100).toFixed(1)}%"></i></div>
    </div>`;
  }

  return `<div class="chips scroll">${state.cards.map(x => `<button class="chip ${x.id === card.id ? 'on' : ''}" style="--c:${color(x.color)}" data-action="select-card" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>

  <section class="panel invoice" style="--c:${c}">
    <div class="invoice-top"><span class="eyebrow">Fatura de ${MESES[Number(key.slice(5)) - 1].toLowerCase()}</span><span class="badge ${st.cls}">${st.label}</span></div>
    <strong class="big">${money(total)}</strong>
    <div class="invoice-dates">Fecha ${fmtDay(close)} · Vence ${fmtDay(due)}</div>
    ${groups.length ? `<div style="margin-top:14px">${stackBar(groups, total)}<div class="legend">${groups.map(g => `<span><i class="dot" style="--c:${color(g.cat.color)}"></i>${esc(g.cat.name)} <b>${money(g.total)}</b></span>`).join('')}</div></div>` : ''}
    ${limit}
  </section>
  ${jump ? `<div style="text-align:center;margin-top:12px">${jump}</div>` : ''}

  <section class="section">
    <div class="section-head"><h2>Lançamentos</h2><button class="link" data-action="new-expense">Lançar</button></div>
    ${items.length ? `<div class="panel rows">${items.map(entryRow).join('')}</div>` : '<div class="panel empty"><p style="margin:0">Nenhum gasto nesta fatura.</p></div>'}
  </section>`;
}

function viewInvest() {
  if (!state.investments.length) {
    return empty('Nenhum investimento', 'Cadastre onde você investe e registre aportes e o saldo atual.', 'new-invest', 'Adicionar investimento');
  }
  const list = state.investments.map(inv => ({ inv, ...invStats(inv.id) })).sort((a, b) => b.balance - a.balance);
  const bal = list.reduce((a, s) => a + s.balance, 0);
  const invested = list.reduce((a, s) => a + s.invested, 0);

  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth(), i - 5));
  const aportes = months.map(k => state.moves.filter(m => m.kind === 'aporte' && monthOf(m.date) === k).reduce((a, m) => a + m.amount, 0));
  const max = Math.max(...aportes, 1);

  return `<section class="panel hero">
    <span class="eyebrow">Patrimônio investido</span>
    <strong class="big">${money(bal)}</strong>
    <div class="split" style="grid-template-columns:1fr 1fr">
      <div><span>Aportado</span><b>${money(invested)}</b></div>
      <div><span>Rendimento</span><b>${gainText(bal - invested, invested)}</b></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Aportes nos últimos 6 meses</h2></div>
    <div class="panel bars">${months.map((k, i) => `<div title="${money(aportes[i])}"><i class="${aportes[i] ? '' : 'zero'}" style="height:${(aportes[i] / max * 100).toFixed(1)}%"></i><span>${MESES_CURTOS[Number(k.slice(5)) - 1]}</span></div>`).join('')}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Carteira</h2><button class="link" data-action="new-invest">Adicionar</button></div>
    <div class="panel rows">${list.map(s => `<button class="row" data-action="open-invest" data-id="${esc(s.inv.id)}">
      ${ic(s.inv.name, PALETA[TIPOS_INVEST.indexOf(s.inv.type) % PALETA.length] || PALETA[0])}
      <span class="row-main"><b>${esc(s.inv.name)}</b><small>${esc(s.inv.type)}</small></span>
      <span class="row-val">${money(s.balance)}<small>${gainText(s.gain, s.invested)}</small></span>
    </button>`).join('')}</div>
  </section>`;
}

// O seletor de arquivos abre pelo toque direto no <label>: o Safari do iPhone
// ignora input.click() disparado por código no app instalado. Sem "accept",
// o iOS libera só fotos e vídeos; text/* cobre CSV salvo sem extensão.
const FILE_TYPES = {
  csv: '.csv,.txt,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel,text/plain,text/*',
  backup: '.json,.txt,application/json,text/plain,text/*',
};
const fileInput = kind => `<input type="file" class="file-input" data-file="${kind}" accept="${FILE_TYPES[kind]}">`;

function viewAjustes() {
  const last = state.meta?.lastBackup;
  const cm = thisMonth();
  const goal = state.goal?.monthly;
  return `<section class="section" style="margin-top:8px">
    <div class="section-head"><h2>Metas</h2></div>
    <div class="panel rows">
      <button class="row" data-action="edit-goal"><span class="row-main"><b>Guardar por mês</b><small>${goal ? money(goal) : 'Nenhuma meta definida'}</small></span><span class="chev">›</span></button>
      <button class="row" data-action="open-plan"><span class="row-main"><b>Plano sem parcelamentos</b><small>Quanto sobra quando as parcelas acabarem</small></span><span class="chev">›</span></button>
    </div>
    <p class="note" style="margin-top:8px;text-align:left">Os limites por mês ficam em cada categoria, mais abaixo.</p>
  </section>

  <section class="section">
    <div class="section-head"><h2>Cartões de crédito</h2><button class="link" data-action="new-card">Adicionar</button></div>
    ${state.cards.length ? `<label class="panel row file-row" style="margin-bottom:10px">
      <span class="row-main"><b>Importar fatura do Nubank</b><small>Arquivo .csv; as parcelas entram no lugar certo</small></span><span class="chev">›</span>
      ${fileInput('csv')}
    </label>` : ''}
    <div class="panel rows">${state.cards.map(c => `<button class="row" data-action="edit-card" data-id="${esc(c.id)}">
      ${ic(c.name, c.color)}
      <span class="row-main"><b>${esc(c.name)}</b><small>Fecha dia ${c.closingDay} · vence dia ${c.dueDay}</small></span>
      <span class="row-val">${c.limit ? `<small>Limite</small>${money(c.limit)}` : ''}</span>
    </button>`).join('') || '<div class="row muted">Nenhum cartão cadastrado</div>'}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Fixos: contas e receitas mensais</h2><button class="link" data-action="new-fixed">Adicionar</button></div>
    <div class="panel rows">${state.fixed.map(f => {
      const cat = catById(f.categoryId);
      const n = monthDiff(f.startMonth, cm) + 1;
      const progress = !f.total ? 'Mensal' : n > f.total ? 'Quitado' : n < 1 ? `Começa em ${monthShort(f.startMonth)}` : `Parcela ${n} de ${f.total}`;
      return `<button class="row" data-action="edit-fixed" data-id="${esc(f.id)}">
        ${ic(cat.name, cat.color)}
        <span class="row-main"><b>${esc(f.name)}</b><small>${progress} · dia ${f.dueDay}</small></span>
        <span class="row-val">${isIncome(f) ? `<span class="pos">+ ${money(f.amount)}</span>` : money(f.amount)}</span>
      </button>`;
    }).join('') || '<div class="row muted">Ex.: parcela do carro, aluguel, salário</div>'}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Categorias</h2><button class="link" data-action="new-category">Adicionar</button></div>
    <div class="panel rows">${state.categories.map(c => `<button class="row" data-action="edit-category" data-id="${esc(c.id)}">
      <i class="dot" style="--c:${color(c.color)};width:12px;height:12px"></i>
      <span class="row-main"><b>${esc(c.name)}</b>${c.limit || c.recurring ? `<small>${[c.recurring ? 'Repete todo mês' : '', c.limit ? `Limite de ${money(c.limit)}` : ''].filter(Boolean).join(' · ')}</small>` : ''}</span>
      <span class="row-val">${c.kind === 'income' ? '<span class="badge">Receita</span>' : c.pinned ? '<span class="badge open">Destaque</span>' : ''}</span>
    </button>`).join('')}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Backup</h2></div>
    <div class="panel rows">
      <button class="row" data-action="export-json"><span class="row-main"><b>Exportar backup</b><small>Arquivo .json com todos os dados · ${last ? `último em ${fmtFull(last.slice(0, 10))}` : 'nunca feito'}</small></span><span class="chev">›</span></button>
      <button class="row" data-action="export-csv"><span class="row-main"><b>Exportar planilha</b><small>Lançamentos e parcelas em .csv (abre no Excel)</small></span><span class="chev">›</span></button>
      <label class="row file-row"><span class="row-main"><b>Importar backup</b><small>Substitui os dados deste aparelho</small></span><span class="chev">›</span>${fileInput('backup')}</label>
      <button class="row" data-action="wipe"><span class="row-main"><b class="neg">Apagar todos os dados</b></span></button>
    </div>
  </section>
  <p class="note">Seus dados ficam apenas neste aparelho. Exporte um backup de vez em quando e guarde no iCloud Drive.</p>`;
}

const VIEWS = { resumo: viewResumo, faturas: viewFaturas, invest: viewInvest, ajustes: viewAjustes };
const TITLES = { resumo: 'Resumo', faturas: 'Faturas', invest: 'Investimentos', ajustes: 'Ajustes' };

function render() {
  $('#title').textContent = TITLES[ui.tab];
  $('#month').hidden = !['resumo', 'faturas'].includes(ui.tab);
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#view').innerHTML = VIEWS[ui.tab]();
  $('#month-label').textContent = monthLabel(ui.tab === 'faturas' ? ui.invMonth : ui.month);
}

/* ---------- folhas (modais) ---------- */

function openSheet(title, body) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="Fechar">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  root.classList.add('open');
  document.body.classList.add('locked');
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('locked');
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function deleteButton(action, id) {
  return `<button type="button" class="btn ghost danger" data-action="${action}" data-id="${esc(id)}">Excluir</button>`;
}

function expenseForm(id) {
  const e = state.expenses.find(x => x.id === id);
  const type = e?.type || 'expense';
  const cardId = e ? (e.cardId || '') : (ui.tab === 'faturas' && ui.cardId) || state.cards[0]?.id || '';
  const n = e?.installments || 1;
  const title = e ? (type === 'income' ? 'Editar receita' : 'Editar gasto') : 'Novo lançamento';
  // data-override guarda a fatura da 1ª parcela quando o usuário escolhe a parcela atual.
  openSheet(title, `<form class="form" data-form="expense" data-id="${esc(e?.id || '')}" data-override="${esc(e?.firstInvoice || '')}">
    ${typeToggle(type)}
    <label class="amount"><span data-only="expense">Valor total</span><span data-only="income">Valor recebido</span><input name="amount" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" value="${e ? centsToInput(e.amount) : ''}" required></label>
    <label class="field"><span>Descrição</span><input name="desc" maxlength="60" placeholder="Ex.: Posto Shell, Salário" value="${esc(e?.desc || '')}"></label>
    <fieldset class="field" data-only="expense"><legend>Pagamento</legend><div class="chips wrap">
      ${state.cards.map(c => radioChip('cardId', c.id, c.name, c.color, c.id === cardId)).join('')}
      ${radioChip('cardId', '', 'Pix/Débito', '#94A3B8', cardId === '')}
    </div></fieldset>
    ${categoryPicker(e)}
    <div class="grid2">
      <label class="field"><span>Data</span><input type="date" name="date" value="${e?.date || todayISO()}" required></label>
      <label class="field" data-installments><span>Parcelas</span><select name="installments">
        ${Array.from({ length: 24 }, (_, i) => i + 1).map(k => `<option value="${k}" ${k === n ? 'selected' : ''}>${k === 1 ? 'À vista' : `${k}x`}</option>`).join('')}
      </select></label>
    </div>
    <label class="field" data-current><span>Parcela na fatura aberta</span><select name="current"></select></label>
    <p class="hint" data-hint></p>
    ${e && isRecurring(e) ? (e.endMonth
      ? `<button type="button" class="btn ghost block" data-action="resume-sub" data-id="${esc(e.id)}">Reativar assinatura</button>`
      : `<button type="button" class="btn ghost block" data-action="end-sub" data-id="${esc(e.id)}">Encerrar assinatura</button>`) : ''}
    <div class="actions">${e ? deleteButton('delete-expense', e.id) : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
  const form = $('form[data-form="expense"]');
  form.dataset.end = e?.endMonth || '';
  updateExpenseForm(form);
  if (!e) form.amount.focus();
}

function updateExpenseForm(form, changed) {
  const fd = new FormData(form);
  const type = toggleType(form);
  const card = type === 'expense' ? cardById(fd.get('cardId')) : null;
  const recurring = !!card && !!catById(fd.get('categoryId')).recurring;
  const n = card && !recurring ? Number(fd.get('installments')) || 1 : 1;
  const date = fd.get('date');
  form.querySelector('[data-installments]').style.visibility = card && !recurring ? 'visible' : 'hidden';
  if (changed === 'date' || changed === 'cardId') form.dataset.override = '';

  const currentField = form.querySelector('[data-current]');
  const current = form.querySelector('select[name="current"]');
  currentField.hidden = !(card && n > 1 && date);

  const hint = form.querySelector('[data-hint]');
  if (!date) { hint.innerHTML = ''; return; }
  if (type === 'income') { hint.innerHTML = `Entra como receita em <b>${monthLabel(monthOf(date)).toLowerCase()}</b>.`; return; }
  if (!card) { hint.innerHTML = `Conta em <b>${monthLabel(monthOf(date)).toLowerCase()}</b>.`; return; }

  const open = openInvoice(card);
  if (changed === 'current') form.dataset.override = addMonths(open, -(Number(current.value) - 1));
  const first = form.dataset.override || invoiceMonthFor(card, date);
  if (recurring) {
    const end = form.dataset.end;
    hint.innerHTML = end
      ? `Assinatura encerrada: a última cobrança foi na fatura de <b>${monthShort(end)}</b>.`
      : `Assinatura: entra na fatura de <b>${monthShort(first)}</b> do ${esc(card.name)} e se repete todo mês até você encerrar.`;
    return;
  }
  const last = addMonths(first, n - 1);
  const i = monthDiff(first, open);

  if (n > 1) {
    if (current.options.length !== n) {
      current.innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k + 1}">${k + 1} de ${n}</option>`).join('');
    }
    current.value = String(Math.min(n, Math.max(1, i + 1)));
  }

  const amount = parseMoney(fd.get('amount'));
  const each = amount > 0 && n > 1 ? ` ${n}x de <b>${money(splitInstallments(amount, n)[n - 1])}</b>.` : '';
  let text;
  if (n === 1) text = `Entra na fatura de <b>${monthShort(first)}</b> do ${esc(card.name)}.`;
  else if (i < 0) text = `A 1ª parcela entra na fatura de <b>${monthShort(first)}</b>; a última, em <b>${monthShort(last)}</b>.`;
  else if (i >= n) text = `Todas as parcelas já passaram; a última foi na fatura de <b>${monthShort(last)}</b>.`;
  else text = `Parcela <b>${i + 1} de ${n}</b> na fatura aberta (${monthShort(open)}). A última fica para <b>${monthShort(last)}</b>.`;
  hint.innerHTML = text + each;
}

function cardForm(id) {
  const c = cardById(id);
  openSheet(c ? 'Editar cartão' : 'Novo cartão', `<form class="form" data-form="card" data-id="${esc(c?.id || '')}">
    <label class="field"><span>Nome do cartão</span><input name="name" maxlength="30" placeholder="Ex.: Nubank, Itaú Black" value="${esc(c?.name || '')}" required></label>
    <div class="grid2">
      <label class="field"><span>Dia de fechamento</span><input name="closingDay" type="number" inputmode="numeric" min="1" max="31" value="${c?.closingDay || ''}" required></label>
      <label class="field"><span>Dia de vencimento</span><input name="dueDay" type="number" inputmode="numeric" min="1" max="31" value="${c?.dueDay || ''}" required></label>
    </div>
    <label class="field"><span>Limite (opcional)</span><input name="limit" inputmode="decimal" placeholder="R$ 0,00" value="${c?.limit ? centsToInput(c.limit) : ''}"></label>
    <fieldset class="field"><legend>Cor</legend>${swatches(c?.color || PALETA[state.cards.length % PALETA.length])}</fieldset>
    <p class="hint">Compras feitas a partir do dia de fechamento entram na fatura do mês seguinte.</p>
    <div class="actions">${c ? deleteButton('delete-card', c.id) : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
  if (!c) $('form[data-form="card"] [name="name"]').focus();
}

function fixedForm(id) {
  const f = state.fixed.find(x => x.id === id);
  const current = f ? Math.max(1, monthDiff(f.startMonth, thisMonth()) + 1) : 1;
  openSheet(f ? 'Editar fixo' : 'Novo fixo', `<form class="form" data-form="fixed" data-id="${esc(f?.id || '')}">
    ${typeToggle(f?.type, ['Conta', 'Receita'])}
    <label class="amount"><span>Valor mensal</span><input name="amount" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" value="${f ? centsToInput(f.amount) : ''}" required></label>
    <label class="field"><span>Nome</span><input name="name" maxlength="40" placeholder="Ex.: Parcela do carro, Salário" value="${esc(f?.name || '')}" required></label>
    ${categoryPicker(f, 'carro')}
    <label class="field"><span>Dia do pagamento</span><input name="dueDay" type="number" inputmode="numeric" min="1" max="31" value="${f?.dueDay || 10}" required></label>
    <div class="grid2">
      <label class="field"><span>Total de parcelas</span><input name="total" type="number" inputmode="numeric" min="1" max="600" placeholder="Sem fim" value="${f?.total || ''}"></label>
      <label class="field"><span>Parcela de ${MESES_CURTOS[Number(thisMonth().slice(5)) - 1]}</span><input name="current" type="number" inputmode="numeric" min="1" max="600" value="${current}"></label>
    </div>
    <p class="hint">Deixe o total em branco para o que não tem prazo, como aluguel, assinatura ou salário.</p>
    <div class="actions">${f ? deleteButton('delete-fixed', f.id) : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
  const form = $('form[data-form="fixed"]');
  toggleType(form);
  if (!f) form.amount.focus();
}

function categoryForm(id) {
  const c = state.categories.find(x => x.id === id);
  openSheet(c ? 'Editar categoria' : 'Nova categoria', `<form class="form" data-form="category" data-id="${esc(c?.id || '')}">
    ${typeToggle(c?.kind, ['De gasto', 'De receita'])}
    <label class="field"><span>Nome</span><input name="name" maxlength="24" value="${esc(c?.name || '')}" required></label>
    <fieldset class="field"><legend>Cor</legend>${swatches(c?.color || PALETA[state.categories.length % PALETA.length])}</fieldset>
    <label class="field" data-only="expense"><span>Limite por mês (opcional)</span><input name="limit" inputmode="decimal" placeholder="Sem limite" value="${c?.limit ? centsToInput(c.limit) : ''}"></label>
    <label class="check" data-only="expense"><input type="checkbox" name="pinned" ${c?.pinned ? 'checked' : ''}> Destacar no resumo</label>
    <label class="check" data-only="expense"><input type="checkbox" name="recurring" ${c?.recurring ? 'checked' : ''}> Repete todo mês no cartão (assinaturas)</label>
    <div class="actions">${c && c.id !== 'outros' ? deleteButton('delete-category', c.id) : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
  toggleType($('form[data-form="category"]'));
}

function investForm(id) {
  const inv = state.investments.find(x => x.id === id);
  openSheet(inv ? 'Editar investimento' : 'Novo investimento', `<form class="form" data-form="invest" data-id="${esc(inv?.id || '')}">
    <label class="field"><span>Nome</span><input name="name" maxlength="40" placeholder="Ex.: CDB Inter, Tesouro Selic" value="${esc(inv?.name || '')}" required></label>
    <label class="field"><span>Tipo</span><select name="type">${TIPOS_INVEST.map(t => `<option ${t === inv?.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${inv ? '' : '<label class="field"><span>Saldo atual (opcional)</span><input name="initial" inputmode="decimal" placeholder="R$ 0,00"></label><p class="hint">O saldo inicial entra como primeiro aporte.</p>'}
    <div class="actions">${inv ? deleteButton('delete-invest', inv.id) : ''}<button class="btn primary">Salvar</button></div>
  </form>`);
}

function investDetail(id) {
  const inv = state.investments.find(x => x.id === id);
  if (!inv) return closeSheet();
  const s = invStats(id);
  openSheet(inv.name, `
    <div class="split" style="margin-bottom:14px">
      <div><span>Saldo</span><b>${money(s.balance)}</b></div>
      <div><span>Aportado</span><b>${money(s.invested)}</b></div>
      <div><span>Rendimento</span><b>${gainText(s.gain, 0)}</b></div>
    </div>
    <div class="actions">
      <button class="btn primary" data-action="new-move" data-id="${esc(id)}" data-kind="aporte">Aporte</button>
      <button class="btn ghost" data-action="new-move" data-id="${esc(id)}" data-kind="saldo">Saldo</button>
      <button class="btn ghost" data-action="new-move" data-id="${esc(id)}" data-kind="resgate">Resgate</button>
    </div>
    <section class="section">
      <div class="section-head"><h2>Movimentações</h2></div>
      <div class="panel rows">${[...s.moves].reverse().map(m => `<button class="row" data-action="delete-move" data-id="${esc(m.id)}">
        <span class="row-main"><b>${MOVES[m.kind].label}</b><small>${fmtFull(m.date)}</small></span>
        <span class="row-val ${m.kind === 'resgate' ? 'neg' : m.kind === 'aporte' ? 'pos' : ''}">${MOVES[m.kind].sign} ${money(m.amount)}</span>
      </button>`).join('') || '<div class="row muted">Nenhuma movimentação</div>'}</div>
    </section>
    <button class="btn ghost block" data-action="edit-invest" data-id="${esc(id)}">Editar investimento</button>`);
}

function moveForm(investmentId, kind) {
  openSheet(MOVES[kind].title, `<form class="form" data-form="move" data-id="${esc(investmentId)}" data-kind="${kind}">
    <label class="amount"><span>${kind === 'saldo' ? 'Saldo atual' : 'Valor'}</span><input name="amount" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" required></label>
    <label class="field"><span>Data</span><input type="date" name="date" value="${todayISO()}" required></label>
    ${kind === 'saldo' ? '<p class="hint">Informe o saldo que aparece no app do banco ou da corretora. A diferença para o valor aportado vira rendimento.</p>' : ''}
    <div class="actions"><button type="button" class="btn ghost" data-action="open-invest" data-id="${esc(investmentId)}">Voltar</button><button class="btn primary">Salvar</button></div>
  </form>`);
  $('form[data-form="move"]').amount.focus();
}

/* ---------- salvamento dos formulários ---------- */

function upsert(list, id, data) {
  const found = id && list.find(x => x.id === id);
  if (found) Object.assign(found, data);
  else list.push({ id: uid(), createdAt: Date.now(), ...data });
}
const dayValue = v => Math.min(31, Math.max(1, parseInt(v, 10) || 1));

const FORMS = {
  expense(fd, form) {
    const amount = parseMoney(fd.get('amount'));
    if (!(amount > 0)) return toast('Informe um valor válido');
    const type = fd.get('type');
    const card = type === 'expense' ? cardById(fd.get('cardId')) : null;
    const categoryId = pickedCategory(fd);
    const recurring = !!card && !!catById(categoryId).recurring;
    const installments = card && !recurring ? Number(fd.get('installments')) || 1 : 1;
    const data = {
      type,
      desc: fd.get('desc').trim() || catById(categoryId).name,
      amount,
      date: fd.get('date'),
      cardId: card?.id || null,
      categoryId,
      installments,
      firstInvoice: card && form.dataset.override ? form.dataset.override : null,
    };
    upsert(state.expenses, form.dataset.id, data);
    closeSheet();
    if (card) {
      const first = firstInvoiceOf(data, card);
      const open = openInvoice(card);
      const i = monthDiff(first, open);
      const inOpen = i >= 0 && i < installments;
      if (ui.tab === 'faturas') {
        ui.cardId = card.id;
        ui.invMonth = inOpen ? open : first;
      }
      commit();
      toast(recurring
        ? `Assinatura: todo mês a partir de ${monthShort(first)}`
        : inOpen && installments > 1
          ? `Parcela ${i + 1}/${installments} na fatura de ${monthShort(open)}`
          : `Lançado na fatura de ${monthShort(first)}`);
    } else {
      commit();
      toast(type === 'income' ? 'Receita lançada' : form.dataset.id ? 'Gasto atualizado' : 'Gasto lançado');
    }
  },
  card(fd, form) {
    const limit = parseMoney(fd.get('limit'));
    upsert(state.cards, form.dataset.id, {
      name: fd.get('name').trim(),
      closingDay: dayValue(fd.get('closingDay')),
      dueDay: dayValue(fd.get('dueDay')),
      limit: limit > 0 ? limit : null,
      color: fd.get('color') || PALETA[0],
    });
    closeSheet();
    commit();
    toast('Cartão salvo');
  },
  fixed(fd, form) {
    const amount = parseMoney(fd.get('amount'));
    if (!(amount > 0)) return toast('Informe um valor válido');
    const total = parseInt(fd.get('total'), 10) || null;
    const current = Math.max(1, parseInt(fd.get('current'), 10) || 1);
    upsert(state.fixed, form.dataset.id, {
      type: fd.get('type'),
      name: fd.get('name').trim(),
      amount,
      categoryId: pickedCategory(fd),
      dueDay: dayValue(fd.get('dueDay')),
      total,
      startMonth: addMonths(thisMonth(), -(current - 1)),
    });
    closeSheet();
    commit();
    toast('Fixo salvo');
  },
  category(fd, form) {
    const kind = fd.get('type');
    const limit = parseMoney(fd.get('limit'));
    upsert(state.categories, form.dataset.id, {
      name: fd.get('name').trim(),
      color: fd.get('color') || PALETA[0],
      pinned: kind === 'expense' && fd.get('pinned') === 'on',
      limit: kind === 'expense' && limit > 0 ? limit : null,
      recurring: kind === 'expense' && fd.get('recurring') === 'on',
      kind,
    });
    closeSheet();
    commit();
  },
  invest(fd, form) {
    const id = form.dataset.id;
    upsert(state.investments, id, { name: fd.get('name').trim(), type: fd.get('type') });
    if (!id) {
      const initial = parseMoney(fd.get('initial'));
      const created = state.investments[state.investments.length - 1];
      if (initial > 0) state.moves.push({ id: uid(), investmentId: created.id, kind: 'aporte', amount: initial, date: todayISO() });
    }
    save();
    render();
    id ? investDetail(id) : closeSheet();
  },
  goal(fd) {
    const amount = parseMoney(fd.get('amount'));
    if (!(amount > 0)) return toast('Informe um valor válido');
    state.goal = { monthly: amount };
    closeSheet();
    commit();
    toast('Meta salva');
  },
  move(fd, form) {
    const amount = parseMoney(fd.get('amount'));
    if (!(amount >= 0) || (form.dataset.kind !== 'saldo' && amount === 0)) return toast('Informe um valor válido');
    state.moves.push({ id: uid(), investmentId: form.dataset.id, kind: form.dataset.kind, amount, date: fd.get('date') });
    save();
    render();
    investDetail(form.dataset.id);
    toast('Movimentação registrada');
  },
};

/* ---------- backup ---------- */

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function deliverFile(filename, text, type) {
  const blob = new Blob([text], { type });
  if (isMobile && navigator.canShare) {
    const file = new File([blob], filename, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

async function exportJson() {
  const payload = { app: 'grana', exportedAt: new Date().toISOString(), data: state };
  if (await deliverFile(`grana-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json')) {
    state.meta = { ...state.meta, lastBackup: new Date().toISOString() };
    commit();
    toast('Backup exportado');
  }
}

function exportCsv() {
  const cell = v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [['Tipo', 'Data', 'Mês', 'Descrição', 'Categoria', 'Pagamento', 'Parcela', 'Valor']];
  for (const e of [...state.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    const income = isIncome(e);
    const card = !income && e.cardId && cardById(e.cardId);
    const n = card ? e.installments || 1 : 1;
    const first = card ? firstInvoiceOf(e, card) : monthOf(e.date);
    splitInstallments(e.amount, n).forEach((v, i) => rows.push([
      income ? 'Receita' : 'Gasto', fmtFull(e.date), monthShort(addMonths(first, i)), e.desc, catById(e.categoryId).name,
      income ? '' : card ? card.name : 'Pix/Débito', n > 1 ? `${i + 1}/${n}` : '', (v / 100).toFixed(2).replace('.', ','),
    ]));
  }
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  deliverFile(`grana-lancamentos-${todayISO()}.csv`, csv, 'text/csv').then(ok => ok && toast('Planilha exportada'));
}

async function importJson(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed.data || parsed;
    if (!['cards', 'expenses', 'categories'].every(k => Array.isArray(data[k]))) throw new Error('formato');
    if (!confirm(`Importar backup com ${data.expenses.length} lançamentos? Os dados atuais deste aparelho serão substituídos.`)) return;
    state = migrate(data);
    ui.cardId = null;
    closeSheet();
    commit();
    toast('Backup importado');
  } catch {
    toast('Arquivo de backup inválido');
  }
}

/* ---------- importação de fatura (CSV do Nubank) ---------- */

// Categoria sugerida pelo nome do lançamento; a primeira regra que bater vence.
const AUTO_CATEGORIES = [
  ['ifood', /ifood/i],
  ['assinaturas', /spotify|netflix|amazonprime|prime video|apple\.com|anthropic|claude|youtube|disney|hbo|globoplay|deezer|icloud|wellhub|gympass|brisanet|internet/i],
  ['carro', /posto|combust|shell|ipiranga|petrobras|lubrificante|auto ?pe[cç]a|estacionamento|sem parar|veloe|conectcar|detran|oficina|pneu/i],
  ['mercado', /supermercado|atacad|assa[ií]|carrefour|p[aã]o de a[cç][uú]car|hortifruti|\bmercado\b/i],
  ['casa', /enel|energia|cagece|[aá]gua|aluguel|condom/i],
  ['saude', /farm[aá]cia|drogaria|drogasil|pague menos|smart ?fit|academia|hospital|cl[ií]nica|laborat/i],
  ['lazer', /steam|cinema|ingresso|playstation|xbox|nintendo|teddyland|burg|pizza|sorvete|restaurante/i],
];
// "Loja - Parcela 3/7" ou "Pix no Crédito - Fulano - 2/12"
const INSTALLMENT_RE = /\s*-\s*(?:Parcela\s+)?(\d{1,2})\/(\d{1,2})\s*$/i;

function guessCategory(title) {
  const has = id => state.categories.some(c => c.id === id && (c.kind || 'expense') === 'expense');
  for (const [id, re] of AUTO_CATEGORIES) if (re.test(title) && has(id)) return id;
  return has('outros') ? 'outros' : catsOf('expense')[0]?.id;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// O CSV traz o valor de cada parcela; o total da compra é parcela × quantidade.
function parseNubankCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const header = parseCsvLine(lines.shift() || '').map(h => h.trim().toLowerCase());
  const [di, ti, ai] = ['date', 'title', 'amount'].map(h => header.indexOf(h));
  if (di < 0 || ti < 0 || ai < 0) throw new Error('formato');
  const items = [];
  const skipped = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    const date = (cols[di] || '').trim();
    const title = (cols[ti] || '').trim();
    const amount = parseMoney(cols[ai]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount)) continue;
    if (amount <= 0) { skipped.push({ title, amount }); continue; }
    const m = title.match(INSTALLMENT_RE);
    const valid = m && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2]);
    const desc = (valid ? title.slice(0, m.index) : title).trim() || title;
    items.push({ date, desc, amount, current: valid ? Number(m[1]) : 1, n: valid ? Number(m[2]) : 1, categoryId: guessCategory(desc) });
  }
  return { items, skipped };
}

let pendingImport = null;

async function readInvoiceCsv(file) {
  if (!state.cards.length) return toast('Cadastre o cartão antes de importar');
  let text;
  try {
    text = await file.text();
  } catch {
    return toast('Não consegui abrir o arquivo. Mova-o para "No meu iPhone"');
  }
  try {
    pendingImport = parseNubankCsv(text);
  } catch {
    return toast(`"${file.name}" não parece uma fatura do Nubank`);
  }
  if (!pendingImport.items.length) return toast('Nenhum lançamento encontrado no arquivo');
  const card = state.cards.find(c => /nubank|\bnu\b/i.test(c.name)) || state.cards[0];
  const fromName = file.name.match(/(\d{4})-(\d{2})-\d{2}/);
  importSheet(card, fromName ? `${fromName[1]}-${fromName[2]}` : openInvoice(card));
}

function importSheet(card, key) {
  const { items, skipped } = pendingImport;
  const total = items.reduce((a, it) => a + it.amount, 0);
  const parcelados = items.filter(it => it.n > 1).length;
  const ignored = skipped.reduce((a, s) => a + Math.abs(s.amount), 0);
  openSheet('Importar fatura', `<form class="form" data-form="import">
    <fieldset class="field"><legend>Cartão</legend><div class="chips wrap">
      ${state.cards.map(c => radioChip('cardId', c.id, c.name, c.color, c.id === card.id)).join('')}
    </div></fieldset>
    <label class="field"><span>Fatura (mês do vencimento)</span><input type="month" name="month" value="${key}" required></label>
    <div class="split">
      <div><span>Lançamentos</span><b>${items.length}</b></div>
      <div><span>Parcelados</span><b>${parcelados}</b></div>
      <div><span>Total</span><b>${money(total)}</b></div>
    </div>
    ${skipped.length ? `<p class="hint">${skipped.length === 1 ? '1 pagamento ou estorno ficou' : `${skipped.length} pagamentos ou estornos ficaram`} de fora (${money(ignored)}).</p>` : ''}
    <div class="panel rows">${items.map(it => {
      const cat = catById(it.categoryId);
      const meta = [fmtDay(it.date), esc(cat.name), it.n > 1 ? `${it.current}/${it.n}` : ''].filter(Boolean).join(' · ');
      return `<div class="row">${ic(cat.name, cat.color)}<span class="row-main"><b>${esc(it.desc)}</b><small>${meta}</small></span><span class="row-val">${money(it.amount)}</span></div>`;
    }).join('')}</div>
    <p class="hint">As categorias foram sugeridas pelo nome. Depois de importar, toque em qualquer lançamento para trocar.</p>
    <div class="actions"><button class="btn primary">Importar ${items.length} lançamentos</button></div>
  </form>`);
}

FORMS.import = fd => {
  const card = cardById(fd.get('cardId'));
  const key = fd.get('month');
  if (!card || !/^\d{4}-\d{2}$/.test(key) || !pendingImport) return toast('Escolha o cartão e o mês da fatura');
  const before = state.expenses.slice();
  let added = 0;
  let repeated = 0;
  for (const it of pendingImport.items) {
    const first = addMonths(key, -(it.current - 1));
    const amount = it.amount * it.n;
    // Importar a mesma fatura duas vezes não duplica os lançamentos.
    if (before.some(e => e.cardId === card.id && e.desc === it.desc && e.amount === amount && firstInvoiceOf(e, card) === first)) {
      repeated++;
      continue;
    }
    // Uma assinatura que o app já repete nesta fatura não entra de novo. Se o
    // valor mudou (ex.: cobrança em dólar), a antiga termina no mês anterior e
    // a nova segue com o valor atual.
    const sub = it.n === 1 && before.find(e => e.cardId === card.id && e.desc === it.desc && isRecurring(e)
      && firstInvoiceOf(e, card) <= key && (!e.endMonth || e.endMonth >= key));
    if (sub && sub.amount === amount) {
      repeated++;
      continue;
    }
    if (sub) sub.endMonth = addMonths(key, -1);
    state.expenses.push({
      id: uid(), createdAt: Date.now(), type: 'expense', desc: it.desc, amount, date: it.date,
      cardId: card.id, categoryId: it.categoryId, installments: it.n, firstInvoice: first, source: 'csv',
    });
    added++;
  }
  pendingImport = null;
  closeSheet();
  ui.tab = 'faturas';
  ui.cardId = card.id;
  ui.invMonth = key;
  commit();
  window.scrollTo(0, 0);
  toast(`${added} importados${repeated ? ` · ${repeated} já existiam` : ''}`);
};

/* ---------- ações ---------- */

const ACTIONS = {
  tab: d => {
    const card = cardById(ui.cardId) || state.cards[0];
    if (d.tab === 'faturas' && card) { ui.cardId = card.id; ui.invMonth = openInvoice(card); }
    ui.tab = d.tab;
    render();
    window.scrollTo(0, 0);
  },
  'prev-month': () => { shiftMonth(-1); render(); },
  'next-month': () => { shiftMonth(1); render(); },
  'close-sheet': closeSheet,
  'select-card': d => { ui.cardId = d.id; ui.invMonth = openInvoice(cardById(d.id)); render(); },
  'go-open-invoice': () => { ui.invMonth = openInvoice(cardById(ui.cardId)); render(); },
  'open-invoice': d => { ui.cardId = d.id; ui.invMonth = d.month; ui.tab = 'faturas'; render(); window.scrollTo(0, 0); },

  // A última cobrança é a fatura aberta (ou a primeira, se ainda não começou).
  'end-sub': d => {
    const e = state.expenses.find(x => x.id === d.id);
    const card = e && cardById(e.cardId);
    if (!card) return;
    const first = firstInvoiceOf(e, card);
    const open = openInvoice(card);
    e.endMonth = first > open ? first : open;
    closeSheet();
    commit();
    toast(`Encerrada; última cobrança em ${monthShort(e.endMonth)}`);
  },
  'resume-sub': d => {
    const e = state.expenses.find(x => x.id === d.id);
    if (!e) return;
    delete e.endMonth;
    closeSheet();
    commit();
    toast('Assinatura reativada');
  },
  'edit-goal': () => goalForm(),
  'remove-goal': () => { state.goal = { monthly: null }; closeSheet(); commit(); },
  'goal-aporte': () => {
    if (state.investments.length === 1) return moveForm(state.investments[0].id, 'aporte');
    if (!state.investments.length) return investForm();
    ui.tab = 'invest';
    render();
    window.scrollTo(0, 0);
    toast('Escolha o investimento do aporte');
  },
  'open-plan': () => planSheet(),
  'new-expense': () => expenseForm(),
  'edit-expense': d => expenseForm(d.id),
  'delete-expense': d => {
    if (!confirm('Excluir este gasto? Todas as parcelas serão removidas.')) return;
    state.expenses = state.expenses.filter(e => e.id !== d.id);
    closeSheet();
    commit();
  },

  'new-card': () => cardForm(),
  'edit-card': d => cardForm(d.id),
  'delete-card': d => {
    const n = state.expenses.filter(e => e.cardId === d.id).length;
    if (!confirm(n ? `Excluir o cartão e seus ${n} lançamentos?` : 'Excluir este cartão?')) return;
    state.cards = state.cards.filter(c => c.id !== d.id);
    state.expenses = state.expenses.filter(e => e.cardId !== d.id);
    closeSheet();
    commit();
  },

  'new-fixed': () => fixedForm(),
  'edit-fixed': d => fixedForm(d.id),
  'delete-fixed': d => {
    if (!confirm('Excluir este gasto fixo?')) return;
    state.fixed = state.fixed.filter(f => f.id !== d.id);
    closeSheet();
    commit();
  },

  'new-category': () => categoryForm(),
  'edit-category': d => categoryForm(d.id),
  'delete-category': d => {
    const kind = catById(d.id).kind || 'expense';
    const fallback = kind === 'income' ? catsOf('income').find(c => c.id !== d.id) : catById('outros');
    if (!fallback) return toast('Mantenha ao menos uma categoria de receita');
    if (!confirm(`Excluir a categoria? Os lançamentos dela vão para "${fallback.name}".`)) return;
    state.categories = state.categories.filter(c => c.id !== d.id);
    for (const item of [...state.expenses, ...state.fixed]) if (item.categoryId === d.id) item.categoryId = fallback.id;
    closeSheet();
    commit();
  },

  'new-invest': () => investForm(),
  'edit-invest': d => investForm(d.id),
  'open-invest': d => investDetail(d.id),
  'delete-invest': d => {
    if (!confirm('Excluir este investimento e todo o histórico?')) return;
    state.investments = state.investments.filter(i => i.id !== d.id);
    state.moves = state.moves.filter(m => m.investmentId !== d.id);
    closeSheet();
    commit();
  },
  'new-move': d => moveForm(d.id, d.kind),
  'delete-move': d => {
    const m = state.moves.find(x => x.id === d.id);
    if (!m || !confirm(`Excluir ${MOVES[m.kind].label.toLowerCase()} de ${money(m.amount)}?`)) return;
    state.moves = state.moves.filter(x => x.id !== d.id);
    save();
    render();
    investDetail(m.investmentId);
  },

  'export-json': exportJson,
  'export-csv': exportCsv,
  wipe: () => {
    if (!confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) return;
    if (!confirm('Tem certeza? Recomendo exportar um backup antes.')) return;
    state = defaultState();
    commit();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el.dataset, el);
  }
});

document.addEventListener('submit', e => {
  const form = e.target;
  const fn = FORMS[form.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(new FormData(form), form);
});

function shiftMonth(n) {
  if (ui.tab === 'faturas') ui.invMonth = addMonths(ui.invMonth, n);
  else ui.month = addMonths(ui.month, n);
}

['input', 'change'].forEach(type => document.addEventListener(type, e => {
  const form = e.target.closest?.('form[data-form]');
  if (!form) return;
  if (form.dataset.form === 'expense') {
    // "input" e "change" disparam juntos em selects; só reage uma vez por campo.
    if (type === 'input' || e.target.tagName !== 'SELECT') updateExpenseForm(form, e.target.name);
  } else {
    toggleType(form);
  }
}));

document.addEventListener('change', e => {
  const input = e.target.closest?.('input[data-file]');
  const file = input?.files[0];
  if (!file) return;
  input.value = '';
  toast(`Lendo ${file.name}…`);
  if (input.dataset.file === 'csv') readInvoiceCsv(file);
  else importJson(file);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
});

render();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
