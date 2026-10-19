/* The approved payday interface, backed by the user's saved data. */
(function () {
    const home = document.querySelector('#payday-home');
    const plan = document.querySelector('#payday-plan');
    const setup = document.querySelector('#payday-setup');
    const settings = document.querySelector('#payday-settings');
    if (!home && !plan && !setup && !settings) return;
    const frequencyNames = { weekly: 'Every week', biweekly: 'Every two weeks', semimonthly: 'Twice a month (15th and month end)', monthly: 'Every month', irregular: 'No regular payday', once: 'One time' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
    const date = value => validPlanDate(value) ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Choose a date';
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const button = (label, action, cls = 'save-button', extra = '') => `<button type="button" class="${cls}" data-plan-action="${action}" ${extra}>${label}</button>`;
    const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const amountField = (label, name, cents = null, extra = '') => field(label, name, cents == null ? '' : (cents / 100).toFixed(2), 'number', `step="0.01" min="0" required ${extra}`);
    const selectFrequency = (name, value, bill = false) => `<label class="field">${bill ? 'Repeats' : 'How often?'}<select name="${name}">${Object.entries(frequencyNames).filter(([key]) => bill ? !['irregular', 'semimonthly'].includes(key) : key !== 'once').map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    const header = (eyebrow, title, action = '') => `<div class="section-top"><div><p class="small-label">${eyebrow}</p><h3>${title}</h3></div>${action}</div>`;
    let p, accounts, transactions, pageBase, owner = localStorage.getItem('flow_user_id'), modalBase, setupDirty = false;
    const dialog = document.createElement('dialog');
    dialog.id = 'payday-dialog'; dialog.className = 'transaction-details-dialog'; dialog.setAttribute('aria-labelledby', 'payday-dialog-title');
    document.body.appendChild(dialog);
    const message = document.createElement('p'); message.className = 'payday-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    (setup || home || plan || settings).after(message);
    function notify(text) { message.textContent = text; }
    function icons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }
    function load() { p = loadFlowPlanning(); accounts = loadBankAccounts(); transactions = loadTransactions(); pageBase = localStorage.getItem('flowPlanning'); }
    function persist(next, base = pageBase) {
        if (owner !== localStorage.getItem('flow_user_id')) throw new Error('Your signed-in account changed. Reload to continue.');
        if (localStorage.getItem('flowPlanning') !== base) throw new Error('Your plan changed on another screen or device. Reload to see the latest copy before saving.');
        saveFlowPlanning(next); p = next; pageBase = localStorage.getItem('flowPlanning');
    }
    function clone() { return JSON.parse(JSON.stringify(p)); }
    function readCents(value, allowNegative = false) {
        if (!(allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(String(value))) throw new Error('Enter an amount with up to two decimals.');
        const cents = Math.round(Number(value) * 100);
        if (!Number.isSafeInteger(cents) || !allowNegative && cents < 0) throw new Error('Check this amount.');
        return cents;
    }
    function estimate(completing = false) { return paydayEstimate(completing ? { ...p, setup: { ...p.setup, completed: true } } : p, accounts, transactions); }
    function showModal(title, body, save, label = 'Save changes') {
        modalBase = localStorage.getItem('flowPlanning');
        dialog.innerHTML = `<div class="dialog-head"><h2 id="payday-dialog-title">${esc(title)}</h2>${button(icon('x'), 'close', 'icon-button', 'aria-label="Close"')}</div>${save ? `<form id="payday-form">${body}<p class="form-message" role="alert"></p><div class="modal-actions"><button type="submit" class="save-button">${label}</button></div></form>` : body}`;
        if (save) dialog.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const form = event.currentTarget;
            if (!form.reportValidity()) return;
            try {
                const next = clone(); save(new FormData(form), next); persist(next, modalBase);
                dialog.close(); render(); notify('Your plan is saved.');
            } catch (error) { form.querySelector('.form-message').textContent = error.message || 'Could not save. Your previous plan is still saved.'; }
        });
        if (title === 'Confirm your available balance') dialog.querySelector('input[name=balance]').removeAttribute('min');
        if (!dialog.open) dialog.showModal(); icons();
    }
    function breakdown(e) {
        if (!e.ready) return `<p class="detail-help">Finish these decisions to see your estimate:</p><ul class="missing-plan">${e.missing.map(s => `<li>${esc(s)}</li>`).join('')}</ul><a href="setup.html" class="save-button">Open setup guide</a>`;
        return `<div class="breakdown"><div><span>Selected available money</span><strong>${money(e.balanceCents)}</strong></div><div><span>Unpaid bills before ${date(p.payday.nextDate)}</span><strong>−${money(e.billsCents)}</strong></div><div><span>Essentials still set aside</span><strong>−${money(e.essentialsCents)}</strong></div><div><span>Your cushion</span><strong>−${money(e.cushionCents)}</strong></div><div class="breakdown-total"><span>${e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated left'}</span><strong>${money(e.leftCents)}</strong></div></div><p class="detail-help">Future pay and credit limits are excluded. Add any unpaid credit-card payment as a bill; card spending does not reduce your cash balance by itself. Category limits are optional and are not deducted a second time. Available balances may already reflect pending payments.</p>${e.notes.map(n => `<p class="detail-help">${esc(n)}</p>`).join('')}`;
    }
    function timeline(edit = false) {
        const e = estimate();
        if (!p.billsConfirmed) return `<p class="detail-help">Confirm your upcoming bills in the setup guide.</p>`;
        if (!e.bills.length) return `<p class="detail-help">No confirmed bills due before ${date(p.payday.nextDate)}.</p>`;
        return `<ul class="timeline">${e.bills.slice(0, 8).map(b => `<li><span class="date-tile">${new Date(b.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}<strong>${Number(b.dueDate.slice(-2))}</strong></span><div><strong>${esc(b.name)}</strong><small>${b.dueDate < flowToday() ? 'Check overdue bill' : 'Confirmed'} · ${frequencyNames[b.frequency]}</small></div><strong>${money(b.amountCents)}</strong>${edit ? button(icon('pencil'), 'bill', 'icon-button', `data-id="${esc(b.id)}" aria-label="Edit ${esc(b.name)}"`) : ''}</li>`).join('')}</ul>`;
    }
    function recentRow(t) {
        const category = t.type === 'Transfer' ? 'Transfer' : t.category || 'Other';
        const nameIcon = t.type === 'Transfer' ? 'arrow-left-right' : t.amount > 0 ? 'banknote' : ({ Food: 'utensils', Transport: 'fuel', Shopping: 'shopping-bag', Entertainment: 'music', Bills: 'file-text' })[t.category] || 'receipt';
        return `<button type="button" class="transaction-row payday-transaction" data-plan-action="transaction" data-id="${esc(t.id)}"><span class="transaction-left"><span class="merchant-icon blue-icon">${icon(nameIcon)}</span><span><strong>${esc(t.name)}</strong><span>${esc(category)}${t.status === 'pending' ? ' · Pending' : ''}${t.notes ? ' · ' + esc(t.notes) : ''}</span></span></span><span class="transaction-right"><strong class="${t.amount > 0 ? 'income-text' : ''}">${t.amount < 0 ? '−' : '+'}${money(Math.abs(Math.round(t.amount * 100)))}</strong><span>${validPlanDate(t.date) ? date(t.date) : 'Date needed'}</span></span></button>`;
    }
    function categoryBars() {
        const today = flowToday();
        const days = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
        const categories = Object.entries(getSpendingBreakdown(transactions, today.slice(0, 7), days).categorySpending).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        const max = Math.max(1, ...categories.map(([, n]) => n));
        return categories.length ? `<div class="categories-mini">${categories.slice(0, 8).map(([name, value]) => `<div class="category-mini"><div class="row-between"><span>${esc(name)}</span><strong>${money(Math.round(value * 100))}</strong></div><div class="progress-bar"><div class="progress-fill" style="width:${value / max * 100}%"></div></div></div>`).join('')}</div>` : `<p class="detail-help">Your spending breakdown appears as activity arrives.</p>`;
    }
    function recoveryAction(e, cls = 'save-button') {
        if (!p.setup.completed) return `<a class="${cls}" href="setup.html">Start the short setup ${icon('arrow-right')}</a>`;
        if (e.missing.some(item => /balance|spending account/i.test(item))) return button('Confirm available balance', 'balance', cls);
        if (e.missing.some(item => /payday/i.test(item))) return button('Confirm next payday', 'payday', cls);
        if (e.missing.some(item => /bills/i.test(item))) return '<a class="' + cls + '" href="setup.html?step=3">Check upcoming bills</a>';
        return '<a class="' + cls + '" href="setup.html?step=4">Check money to keep aside</a>';
    }
    function renderHome() {
        if (!home) return;
        const e = estimate(); const reviewCount = transactions.filter(needsCurrentTransactionReview).length;
        const recent = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
        home.innerHTML = `<div class="page-header"><div><p class="small-label">Your money, in focus</p><h2>A little clarity for your day<span class="heading-dot">.</span></h2><p>${e.ready ? `Your plan through ${date(p.payday.nextDate)}.` : 'A few small decisions, more room to breathe.'}</p></div></div><section class="payday-grid"><article class="spending-overview payday-hero"><div><div class="hero-top"><span class="hero-eyebrow"><span class="live-dot"></span>${e.ready ? (e.leftCents < 0 ? 'Estimated shortfall until payday' : 'Estimated left until payday') : 'Your payday plan'}</span><span class="hero-period">${e.ready ? e.days + ' days to go' : ''}</span></div><h3>${e.ready ? money(e.leftCents) : p.setup.completed ? 'A quick check' : 'Let’s make a plan'}</h3><p class="hero-caption">${e.ready ? 'After your upcoming bills, essentials, and cushion.' : esc(e.missing[0]) + ' to see what’s left until payday.'}</p>${e.ready ? button('See how this is calculated ' + icon('arrow-up-right'), 'breakdown', 'hero-link') : recoveryAction(e, 'hero-link')}</div><div class="hero-metrics"><div><span>${icon('calendar-days')} Next payday</span><strong>${date(p.payday.nextDate)}</strong></div><div><span>${e.ready ? (e.leftCents < 0 ? 'Review your plan' : 'About this much per day') : 'Your progress'}</span><strong>${e.ready ? (e.leftCents < 0 ? 'Adjust set-asides' : money(Math.floor(e.leftCents / e.days))) : `Step ${p.setup.step + 1} of 6`}</strong></div></div></article><article class="card">${header('Coming up', 'Before payday', '<a href="budgets.html">Manage</a>')}${p.preferences.billReminders ? timeline() : '<p class="detail-help">Upcoming bill reminders are hidden. You can still see and edit every bill in Plan.</p>'}<p class="detail-help">Confirmed unpaid bills are set aside in your estimate.</p></article></section><section class="card attention-card">${header('Your next step', reviewCount || !e.ready ? 'Just a little attention' : 'You’re up to date', '<span class="subtle-icon">' + icon('sparkles') + '</span>')}<div class="attention-list">${reviewCount ? `<a class="attention-item row-between" href="review.html?quick=1"><span><strong>${reviewCount} ${reviewCount === 1 ? 'payment needs' : 'payments need'} a decision</strong><small>Choose categories for the few payments that vary.</small></span><span>↗</span></a>` : ''}${!e.ready ? `<a class="attention-item row-between" href="setup.html"><span><strong>${p.setup.completed ? 'Refresh your plan' : 'Take the short setup guide'}</strong><small>${esc(e.missing.slice(0, 2).join(' · '))}</small></span><span>↗</span></a>` : !reviewCount ? '<p class="detail-help">Your new activity is sorted. Your categories stay editable in Activity.</p>' : ''}</div></section><section class="bottom-grid"><article class="card recent-card">${header('Latest activity', 'Recent transactions', '<a href="transactions.html">See all</a>')}<div class="transaction-list">${recent.map(recentRow).join('') || '<p class="detail-help">Connect a bank or add your first transaction to get started.</p><a class="back-button" href="account.html">Open Account</a>'}</div></article><article class="card">${header('This month', 'Where it went')}${categoryBars()}</article></section>`;
    }
    function renderPlan() {
        if (!plan) return;
        const e = estimate();
        plan.innerHTML = `<section class="plan-summary"><div><p class="small-label">Your plan ${validPlanDate(p.payday.nextDate) ? 'through ' + date(p.payday.nextDate) : ''}</p><h3>${e.ready ? money(e.leftCents) + (e.leftCents < 0 ? ' estimated shortfall' : ' estimated left') : 'A little setup, more clarity'}</h3><p>${e.ready ? 'Your bills and set-asides are accounted for.' : esc(e.missing.slice(0, 2).join(' · '))}</p></div>${e.ready ? button('See breakdown', 'breakdown', 'back-button') : recoveryAction(e)}</section><section class="plan-columns"><div><article class="card">${header('Your next income', 'Payday', button('Edit', 'payday', 'inline-link'))}<div class="row-between"><div><strong class="setting-title">${validPlanDate(p.payday.nextDate) ? new Date(p.payday.nextDate + 'T12:00:00').toLocaleDateString('en-US', { dateStyle: 'long' }) : 'Confirm your next payday'}</strong><p>${frequencyNames[p.payday.frequency]}</p></div><span class="subtle-icon">${icon('calendar-days')}</span></div><p class="detail-help">Future pay isn’t included in what you can spend before it arrives.</p></article><article class="card">${header('Coming up', 'Bills before payday', button('Add bill', 'bill', 'inline-link'))}${timeline(true)}${p.bills.filter(b => !validPlanDate(p.payday.nextDate) || b.nextDate > p.payday.nextDate).length ? `<details class="manual-balance-details"><summary>Later bills</summary><div class="plain-list">${p.bills.filter(b => !validPlanDate(p.payday.nextDate) || b.nextDate > p.payday.nextDate).map(b => `<div class="row-between"><div><strong>${esc(b.name)}</strong><p>${date(b.nextDate)} · ${money(b.amountCents)}</p></div>${button('Edit', 'bill', 'back-button', `data-id="${esc(b.id)}"`)}</div>`).join('')}</div></details>` : ''}<p class="detail-help">Already paid? Open the bill to confirm it’s reflected in your balance and move to its next date.</p></article></div><div><article class="card">${header('Keep aside', 'Everyday essentials', button('Edit', 'essentials', 'inline-link'))}<div class="plain-list">${e.reserves.map(r => `<div class="row-between"><span class="setting-title">${esc(r.name)}</span><div><strong>${money(r.remainingCents)}</strong><small class="setting-note">${money(r.amountCents)} set aside</small></div></div>`).join('') || '<p class="detail-help">Choose what to keep aside in setup. Category limits are optional.</p>'}</div></article><article class="card">${header('A little breathing room', 'Your cushion', button('Edit', 'essentials', 'inline-link'))}<strong class="cushion-value">${money(p.cushionCents)}</strong><p class="detail-help">Money you’ve chosen to keep out of everyday spending.</p></article><article class="card">${header('Your money', 'Spending accounts', button('Manage', 'accounts', 'inline-link'))}<p class="detail-help">${p.manualBalance ? `Available balance confirmed by you on ${date(p.manualBalance.date)}.` : accounts.filter(a => p.selectedAccountIds.includes(a.id)).map(a => esc(a.name)).join(', ') || 'Choose accounts or enter your available balance.'}</p>${button('Update available balance', 'balance', 'back-button')}</article></div></section>`;
    }
    function supported(a) { return a.type === 'depository' && a.currency === 'USD' && a.availableCents !== null; }
    function accountsMarkup() {
        return accounts.map(a => `<label class="choice"><input type="checkbox" name="account" value="${esc(a.id)}" ${p.selectedAccountIds.includes(a.id) && !p.manualBalance ? 'checked' : ''} ${!supported(a) ? 'disabled' : ''}><div><strong>${esc(a.name)}</strong><small>${!supported(a) ? 'Available USD cash balance needed · use manual balance' : `${esc(a.subtype || 'Cash account')} · Cached bank balance`}</small></div><strong>${supported(a) ? money(a.availableCents) : '—'}</strong></label>`).join('');
    }
    function incomeSuggestion() {
        const groups = {};
        for (const t of transactions) if (t.source === 'bank' && t.amount > 0 && t.type === 'Income' && t.status !== 'pending' && validPlanDate(t.date)) (groups[normalizedName(t.name)] ||= []).push(t);
        for (const entries of Object.values(groups)) {
            entries.sort((a, b) => b.date.localeCompare(a.date));
            if (entries.length < 2) continue;
            const gap = planDays(entries[1].date, entries[0].date);
            const frequency = gap >= 6 && gap <= 8 ? 'weekly' : gap >= 13 && gap <= 15 ? 'biweekly' : gap >= 26 && gap <= 32 ? 'monthly' : null;
            if (!frequency) continue;
            let next = entries[0].date;
            for (let i = 0; i < 120 && next <= flowToday(); i++) next = nextPlanDate(next, frequency);
            return { date: next, frequency };
        }
        return null;
    }
    function billSuggestions() {
        return recurringSuggestions(transactions, [], flowToday()).filter(s => s.type === 'Expense' &&
            !p.bills.some(b => normalizedName(b.name) === normalizedName(s.name)));
    }
    const reserveFields = (values = p.essentials) => {
        const entries = values.length ? values : [{ id: 'food', name: 'Food & groceries', category: 'Food', amountCents: null }, { id: 'transport', name: 'Transport', category: 'Transport', amountCents: null }, { id: 'fun', name: 'Entertainment', category: 'Entertainment', amountCents: null }];
        const draft = setup && p.setup.step === 4 ? p.setup.reserveDraft : null;
        const inputs = entries.map((r, i) => amountField(esc(r.name), 'essential-' + i, r.amountCents)).join('') + amountField('A cushion to leave untouched', 'cushion', p.cushionCents);
        if (!draft) return inputs;
        const holder = document.createElement('div'); holder.innerHTML = inputs;
        for (const input of holder.querySelectorAll('input')) if (draft[input.name] !== undefined) input.setAttribute('value', draft[input.name]);
        return holder.innerHTML;
    };
    function collectReserves(form, next) {
        const rows = next.essentials.length ? next.essentials : [{ id: 'food', name: 'Food & groceries', category: 'Food' }, { id: 'transport', name: 'Transport', category: 'Transport' }, { id: 'fun', name: 'Entertainment', category: 'Entertainment' }];
        next.essentials = rows.map((r, i) => ({ ...r, amountCents: readCents(form.get('essential-' + i)) }));
        next.cushionCents = readCents(form.get('cushion')); delete next.setup.reserveDraft; next.reservesConfirmed = true; next.periodStartedOn = flowToday();
    }
    function renderSetup() {
        if (!setup) return;
        const step = p.setup.step; let body = '';
        const intro = (label, title, text) => `<div class="setup-heading"><p class="small-label">${label}</p><h2>${title}</h2><p>${text}</p></div>`;
        if (step === 0) body = `<span class="intro-mark">${icon('sprout')}</span>${intro('A fresh start', 'A little setup.<br>A lot more clarity.', 'Let’s work out what you can spend until payday. We’ll take it one small step at a time.')}<div class="onboarding-benefit">${icon('landmark')} Choose the money you use every day</div><div class="onboarding-benefit">${icon('calendar-days')} Make room for bills and essentials</div><div class="onboarding-benefit">${icon('sparkles')} Let Flow handle routine sorting</div><p class="detail-help">About 5 minutes, plus bank sign-in. No need to sort your old transactions first.</p>`;
        if (step === 1) body = intro('Your money', 'Which money do you spend from?', 'Choose your everyday accounts, or confirm an available balance manually.') + (accounts.length ? accountsMarkup() : `<p class="detail-help">No available account balances yet. Sync your bank from Account, or enter the available balance you see in your bank.</p>`) + `<div class="heading-actions"><a class="back-button" href="account.html#bank-connections">${accounts.length ? 'Manage banks' : 'Connect or sync bank'}</a>${button('Refresh account balances', 'refresh-accounts', 'back-button')}</div><details class="manual-balance-details" ${p.manualBalance ? 'open' : ''}><summary>Enter an available balance manually</summary><div class="stack" style="margin-top:15px">${amountField('Available spending money', 'manualBalance', p.manualBalance?.cents, 'data-optional-amount')}<label class="toggle-label"><input type="checkbox" name="useManual" ${p.manualBalance ? 'checked' : ''}>Use this balance instead of bank account balances</label><p class="detail-help">Confirm the available amount from your bank today. We’ll ask you to update manual balances on a new day.</p></div></details>`;
        if (step === 2) { const suggestion = !p.payday.nextDate && incomeSuggestion(); body = intro('Your next payday', 'When does more money come in?', suggestion ? 'This date is suggested from your recent paychecks. Please confirm it.' : 'Confirm your next payday. You can change it whenever life changes.') + `<div class="stack">${field('Next payday or planning end date', 'payday', p.payday.nextDate || suggestion?.date || '', 'date', `required min="${addPlanDays(flowToday(), 1)}" max="${addPlanDays(flowToday(), 366)}"`)}${selectFrequency('frequency', suggestion?.frequency || p.payday.frequency)}</div><p class="detail-help">No regular payday? Choose the date you’d like this plan to cover instead. Twice-monthly scheduling uses the 15th and month end; check your actual pay date.</p>`; }
        if (step === 3) body = intro('Coming up', 'Let’s make room for your bills.', `Confirm what’s still unpaid before ${date(p.payday.nextDate)}.`) + `<div class="plain-list">${p.bills.map(b => `<div class="row-between"><div><strong class="setting-title">${esc(b.name)}</strong><p>${date(b.nextDate)} · ${money(b.amountCents)}</p></div>${button('Edit', 'bill', 'back-button', `data-id="${esc(b.id)}"`)}</div>`).join('')}</div><div class="suggested-bills">${billSuggestions().slice(0, 8).map(s => `<div class="row-between"><div><strong class="setting-title">${esc(s.name)}</strong><p>Looks monthly · ${money(Math.abs(Math.round(s.amount * 100)))} · next ${date(s.nextDate)}</p></div>${button('Check', 'suggested-bill', 'back-button', `data-name="${esc(s.name)}"`)}</div>`).join('')}</div>${button('Add a missing bill', 'bill', 'inline-link')}<p class="detail-help">Include rent, subscriptions, debt or credit-card payments, and anything else still due. Continuing confirms this list, including if there are no upcoming bills.</p>`;
        if (step === 4) body = intro('Keep aside', 'Leave room for everyday life.', 'Choose what to reserve from today until payday. Enter 0 for anything you don’t need.') + `<div class="stack">${reserveFields()}</div><p class="detail-help">These are amounts to keep aside now. Editing starts a fresh reserve period today. Detailed monthly category limits stay optional.</p>`;
        if (step === 5) { const e = estimate(true); body = `<span class="intro-mark">${icon(e.ready ? 'check' : 'circle-help')}</span>${intro('Your plan', e.ready ? 'A clearer view until payday.' : 'One more quick check.', `Your plan through ${date(p.payday.nextDate)}.`)}${e.ready ? `<h3 class="setup-ready">${money(e.leftCents)}</h3><p class="detail-help">${e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated left'} after bills and set-asides.</p>` : ''}${breakdown(e)}`; }
        setup.innerHTML = `<div class="setup-wrap"><div class="row-between" style="margin-bottom:16px"><p class="small-label">Your setup · ${step + 1} of 6</p>${button('Save & close', 'save-close', 'inline-link')}</div><div class="setup-progress" aria-label="Step ${step + 1} of 6">${[0, 1, 2, 3, 4, 5].map(i => `<span class="${i <= step ? 'active' : ''}"></span>`).join('')}</div><section class="card setup-card"><form id="setup-form">${body}<p class="form-message" role="alert"></p><div class="setup-footer">${step ? button('Back', 'setup-back', 'back-button') : '<span class="optional">Your progress is saved.</span>'}<button type="submit" class="save-button">${step === 0 ? 'Let’s get started' : step === 5 ? 'Open my Home' : 'Continue'} ${icon('arrow-right')}</button></div></form></section></div>`;
        const optional = setup.querySelector('[data-optional-amount]'); if (optional) { optional.required = false; optional.removeAttribute('min'); }
        setup.querySelector('form').addEventListener('input', () => { setupDirty = true; });
        setup.querySelector('form').addEventListener('change', () => { setupDirty = true; });
        setup.querySelector('form').addEventListener('submit', event => { event.preventDefault(); advanceSetup(event.currentTarget, 'next'); });
        setupDirty = false;
    }
    function advanceSetup(form, direction) {
        try {
            if (direction === 'next' && !form.reportValidity()) return;
            const next = clone(); const values = new FormData(form); const step = next.setup.step;
            if (step === 1) {
                next.selectedAccountIds = values.getAll('account').map(String);
                if (values.get('useManual')) next.manualBalance = { cents: readCents(values.get('manualBalance'), true), date: flowToday() };
                else next.manualBalance = null;
                if (direction === 'next' && !next.manualBalance && !next.selectedAccountIds.length) throw new Error('Choose a spending account, or enter and select a manual available balance.');
            }
            if (step === 2 && values.get('payday')) {
                if (!validPlanDate(String(values.get('payday'))) || String(values.get('payday')) <= flowToday()) throw new Error('Choose a future payday or planning date.');
                next.payday = { nextDate: String(values.get('payday')), frequency: String(values.get('frequency')) };
            }
            if (step === 3 && direction === 'next') next.billsConfirmed = true;
            if (step === 4) {
                if ([...form.querySelectorAll('input[type=number]')].every(input => input.value !== '' && input.validity.valid)) collectReserves(values, next);
                else next.setup.reserveDraft = Object.fromEntries([...values].map(([key, value]) => [key, String(value)]));
            }
            if (step === 5 && direction === 'next') {
                if (!paydayEstimate({ ...next, setup: { ...next.setup, completed: true } }, accounts, transactions).ready) throw new Error('Check the missing details before finishing. Use Back to update your balance, payday, or bills.');
                next.setup.completed = true;
            } else if (direction === 'next') next.setup.step = Math.min(5, step + 1);
            else if (direction === 'back') next.setup.step = Math.max(0, step - 1);
            persist(next); setupDirty = false;
            if (direction === 'close' || step === 5 && direction === 'next') location.href = 'index.html';
            else render();
        } catch (error) { form.querySelector('.form-message').textContent = error.message || 'Could not save this step. Your earlier progress is still saved.'; }
    }
    function editBill(id, suggested) {
        const b = p.bills.find(bill => bill.id === id);
        const initial = b || suggested;
        showModal(b ? 'Edit bill' : 'Add a bill', `<div class="stack">${field('Name', 'name', initial?.name || '', 'text', 'required maxlength="200"')}${amountField('Amount', 'amount', initial?.amountCents ?? null)}${field('Next unpaid due date', 'date', initial?.nextDate || '', 'date', 'required')}${selectFrequency('frequency', initial?.frequency || 'monthly', true)}</div>${b ? `<div class="bill-actions">${button('Payment is already reflected in my balance', 'bill-paid', 'inline-link', `data-id="${esc(b.id)}"`)}${button('Remove this bill', 'bill-delete', 'inline-link', `data-id="${esc(b.id)}"`)}</div>` : ''}`, (values, next) => {
            const amount = readCents(values.get('amount')); if (amount <= 0) throw new Error('Enter an amount greater than zero.');
            const date = String(values.get('date')); if (!validPlanDate(date)) throw new Error('Choose a valid due date.');
            const value = { id: b?.id || makeRecordId(next.bills), name: String(values.get('name')).trim(), amountCents: amount, nextDate: date, anchorDay: Number(date.slice(-2)), frequency: String(values.get('frequency')) };
            if (!value.name) throw new Error('Enter a bill name.');
            const index = next.bills.findIndex(row => row.id === b?.id);
            if (index >= 0) next.bills[index] = value; else next.bills.push(value);
        });
    }
    function renderSettings() {
        if (!settings) return;
        settings.innerHTML = `<section class="card account-card">${header('Getting comfortable', 'Setup & help')}<div class="plain-list"><div class="row-between"><div><strong class="setting-title">Your setup guide</strong><p>${p.setup.completed ? 'Revisit any choice in your plan.' : 'One small decision at a time.'}</p></div><a href="setup.html" class="back-button">${p.setup.completed ? 'Revisit' : 'Open'}</a></div><div class="row-between"><div><strong class="setting-title">How the payday number works</strong><p>See what’s included and kept aside.</p></div>${button(icon('chevron-right'), 'breakdown', 'icon-button', 'aria-label="Explain payday amount"')}</div><div class="row-between"><div><strong class="setting-title">Spending accounts</strong><p>Available money, sources, and freshness.</p></div>${button('Manage', 'accounts', 'back-button')}</div></div></section><section class="card account-card">${header('Preferences', 'A little help, when you want it')}<label class="toggle-label"><input type="checkbox" data-plan-preference="billReminders" ${p.preferences.billReminders ? 'checked' : ''}>Show upcoming bills in Flow</label><label class="toggle-label"><input type="checkbox" data-plan-preference="autoCategories" ${p.preferences.autoCategories ? 'checked' : ''}>Organize reliable new bank categories automatically</label><p class="detail-help">You can always change an individual category. Mixed-purpose payments stay flexible.</p></section>`;
    }
    function render() { if (setup && setupDirty) return; try { load(); renderHome(); renderPlan(); renderSettings(); if (setup && !setupDirty) renderSetup(); icons(); } catch (error) { notify(error.message); } }
    document.addEventListener('click', event => {
        const target = event.target.closest('[data-plan-action]'); if (!target) return;
        const action = target.dataset.planAction;
        try {
            if (action === 'close') return dialog.close();
            if (action === 'transaction') return window.FlowTransactionDetails.open(target.dataset.id);
            if (action === 'setup-back' || action === 'save-close') return advanceSetup(setup.querySelector('form'), action === 'setup-back' ? 'back' : 'close');
            if (setupDirty && ['bill', 'suggested-bill', 'refresh-accounts'].includes(action)) { notify('Continue or save this step before opening another decision.'); return; }
            if (action === 'breakdown') return showModal('How your estimate works', breakdown(estimate()));
            if (action === 'refresh-accounts') { notify('Checking your connected accounts…'); return Promise.resolve(window.refreshFlowAccounts?.(true)).then(() => { render(); notify('Account check finished. If no balance is available, enter it manually.'); }); }
            if (action === 'balance') return showModal('Confirm your available balance', amountField('Available spending money today', 'balance', p.manualBalance?.cents) + '<p class="detail-help">Use the available amount in your bank. This replaces bank balances in your payday estimate until you select accounts again.</p>', (values, next) => { next.manualBalance = { cents: readCents(values.get('balance'), true), date: flowToday() }; });
            if (action === 'accounts') return showModal('Your spending money', `${accountsMarkup() || '<p class="detail-help">No cached account balances available. Sync your bank from Account or enter your available balance manually.</p>'}<p class="detail-help">Only supported USD cash balances can be selected. Cached balances may be older than their retrieval time.</p>${button('Enter available balance', 'balance', 'back-button', 'style="margin-top:12px"')}`, (values, next) => {
                const ids = values.getAll('account').map(String);
                if (!ids.length) throw new Error('Choose a cash account, or enter an available balance manually.');
                next.selectedAccountIds = ids; next.manualBalance = null;
            }, 'Use selected accounts');
            if (action === 'payday') return showModal('Your next payday', `<div class="stack">${field('Next payday or planning end date', 'date', p.payday.nextDate, 'date', `required min="${addPlanDays(flowToday(), 1)}" max="${addPlanDays(flowToday(), 366)}"`)}${selectFrequency('frequency', p.payday.frequency)}</div><p class="detail-help">If your previous payday has passed, confirming a new date starts your usual essential set-asides again from today. Check that your bills are up to date.</p>`, (values, next) => { const date = String(values.get('date')); if (!validPlanDate(date) || date <= flowToday()) throw new Error('Choose a future date.'); if (next.payday.nextDate && next.payday.nextDate <= flowToday()) next.periodStartedOn = flowToday(); next.payday = { nextDate: date, frequency: String(values.get('frequency')) }; });
            if (action === 'essentials') return showModal('Keep a little aside', `<div class="stack">${reserveFields()}</div><p class="detail-help">Choose amounts to reserve from today. This starts a fresh reserve period; your bank balances and past transactions stay intact.</p>`, collectReserves);
            if (action === 'bill') return editBill(target.dataset.id);
            if (action === 'suggested-bill') { const s = billSuggestions().find(s => s.name === target.dataset.name); if (s) editBill(null, { name: s.name, amountCents: Math.abs(Math.round(s.amount * 100)), nextDate: s.nextDate, frequency: 'monthly' }); return; }
            if (action === 'bill-delete' || action === 'bill-paid') {
                const b = p.bills.find(b => b.id === target.dataset.id); if (!b) return;
                if (!confirm(action === 'bill-delete' ? `Remove ${b.name} from your plan?` : `Confirm this payment is already reflected in your available bank balance. Move ${b.name} to its next due date?`)) return;
                const next = clone(); const bill = next.bills.find(row => row.id === b.id);
                const following = nextPlanDate(bill.nextDate, bill.frequency, bill.anchorDay);
                if (action === 'bill-delete' || !following) next.bills = next.bills.filter(row => row.id !== bill.id);
                else bill.nextDate = following;
                persist(next, modalBase); dialog.close(); render(); return;
            }
        } catch (error) { const box = dialog.open && dialog.querySelector('.form-message'); if (box) box.textContent = error.message; else notify(error.message); }
    });
    document.addEventListener('change', event => {
        if (!event.target.dataset.planPreference) return;
        try { const next = clone(); next.preferences[event.target.dataset.planPreference] = event.target.checked; persist(next); notify('Preference saved.'); }
        catch (error) { event.target.checked = !event.target.checked; notify(error.message); }
    });
    document.addEventListener('flow-transaction-updated', render);
    document.addEventListener('flow-transaction-view-refresh', render);
    document.addEventListener('flow-accounts-updated', () => { if (setupDirty || dialog.open) notify('Account balances updated. Finish your current edit to refresh the view.'); else render(); });
    document.addEventListener('flow-transaction-data-updated', () => { if (setupDirty || dialog.open) notify('Your saved copy changed. Reload before saving another edit.'); else render(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    if (setup) {
        try { load(); const step = Number(new URLSearchParams(location.search).get('step')); if (new URLSearchParams(location.search).has('step') && Number.isInteger(step) && step >= 0 && step <= 5) { const next = clone(); next.setup.step = step; persist(next); } } catch (error) { notify(error.message); }
        window.addEventListener('beforeunload', event => { if (setupDirty) { event.preventDefault(); event.returnValue = ''; } });
    }
    if (plan) {
        const selectTab = value => {
            const categories = value === 'categories';
            document.querySelector('#category-limits').hidden = !categories; plan.hidden = categories;
            for (const tab of document.querySelectorAll('[data-plan-tab]')) { const active = (tab.dataset.planTab === 'categories') === categories; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); }
            const url = new URL(location.href); if (categories) url.searchParams.set('view', 'categories'); else { url.searchParams.delete('view'); url.searchParams.delete('month'); } history.replaceState(null, '', url);
            document.querySelector('.nav-link.active').href = 'budgets.html';
        };
        for (const tab of document.querySelectorAll('[data-plan-tab]')) tab.addEventListener('click', () => selectTab(tab.dataset.planTab));
        const params = new URLSearchParams(location.search); selectTab(params.get('view') === 'categories' || params.has('month') ? 'categories' : 'payday');
    }
    render();
})();
