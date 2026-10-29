var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* The approved payday interface, backed by the user's saved data. */
(function () {
    const home = document.querySelector('#payday-home');
    const plan = document.querySelector('#payday-plan');
    const setup = document.querySelector('#payday-setup');
    const billsPage = document.querySelector('#payday-bills');
    const settings = document.querySelector('#payday-settings');
    if (!home && !plan && !setup && !settings && !billsPage) return;
    const frequencyNames = { weekly: 'Every week', biweekly: 'Every two weeks', semimonthly: 'Twice a month (15th and month end)', monthly: 'Every month', quarterly: 'Every three months', yearly: 'Every year', irregular: 'No regular payday', once: 'One time' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
    const date = value => validPlanDate(value) ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Choose a date';
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const button = (label, action, cls = 'save-button', extra = '') => `<button type="button" class="${cls}" data-plan-action="${action}" ${extra}>${label}</button>`;
    const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const amountField = (label, name, cents = null, extra = '') => field(label, name, cents == null ? '' : (cents / 100).toFixed(2), 'number', `step="0.01" min="0" required ${extra}`);
    const selectFrequency = (name, value, bill = false) => `<label class="field">${bill ? 'Repeats' : 'How often?'}<select name="${name}">${Object.entries(frequencyNames).filter(([key]) => bill ? !['irregular', 'semimonthly'].includes(key) : !['once', 'quarterly', 'yearly'].includes(key)).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    const header = (eyebrow, title, action = '') => `<div class="section-top"><div><p class="small-label">${eyebrow}</p><h3>${title}</h3></div>${action}</div>`;
    let modalInvoker = null, reserveReview = null, evidenceContext = null;
    let p, accounts, transactions, pageBase, owner = flowStorage.getItem('flow_user_id'), modalBase, setupDirty = false, checkIn = null, renderedDay = flowToday(), renderedCheckInDue = false;
    const dialog = document.createElement('dialog');
    dialog.id = 'payday-dialog'; dialog.className = 'transaction-details-dialog'; dialog.setAttribute('aria-labelledby', 'payday-dialog-title');
    document.body.appendChild(dialog);
    const message = document.createElement('p'); message.className = 'payday-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    (setup || home || plan || settings || billsPage).after(message);
    function notify(text) { message.textContent = text; }
    function icons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }
    function load() { p = loadFlowPlanning(); accounts = loadBankAccounts(); transactions = loadTransactions(); pageBase = flowStorage.getItem('flowPlanning'); }
    function persist(next, base = pageBase) {
        if (owner !== flowStorage.getItem('flow_user_id')) throw new Error('Your signed-in account changed. Reload to continue.');
        if (flowStorage.getItem('flowPlanning') !== base) throw new Error('Your plan changed on another screen or device. Reload to see the latest copy before saving.');
        saveFlowPlanning(next); reserveReview=null; p = next; pageBase = flowStorage.getItem('flowPlanning');
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
        modalBase = flowStorage.getItem('flowPlanning');
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
        return `<div class="breakdown"><div><span>Selected available money</span><strong>${money(e.balanceCents)}</strong></div><div><span>Unpaid bills before ${date(p.payday.nextDate)}</span><strong>−${money(e.billsCents)}</strong></div><div><span>Essentials still set aside</span><strong>−${money(e.essentialsCents)}</strong></div><div><span>Your cushion</span><strong>−${money(e.cushionCents)}</strong></div><div><span>Goal reserves</span><strong>−${money(e.goalsCents || 0)}</strong></div><div><span>Card repayment reserves</span><strong>−${money(e.cardsCents || 0)}</strong></div><div><span>Purchases not yet in your balance</span><strong>−${money(e.adjustmentsCents || 0)}</strong></div><div class="breakdown-total"><span>${e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated left'}</span><strong>${money(e.leftCents)}</strong></div></div><p class="detail-help">Future pay and credit limits are excluded. Set a card repayment reserve in Plan; do not also reserve that payment as a bill. Essentials are already set aside, so the headline is extra flexible money. Category limits are optional and are not deducted a second time. Available balances may already reflect pending payments.</p>${e.notes.map(n => `<p class="detail-help">${esc(n)}</p>`).join('')}`;
    }
    function timeline(edit = false) {
        const e = estimate();
        if (!p.billsConfirmed) return `<p class="detail-help">Confirm your upcoming bills in the setup guide.</p>`;
        if (!e.bills.length) return `<p class="detail-help">No confirmed bills due before ${date(p.payday.nextDate)}.</p>`;
        return `<ul class="timeline">${e.bills.slice(0, 8).map(b => `<li><span class="date-tile">${new Date(b.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}<strong>${Number(b.dueDate.slice(-2))}</strong></span><div><strong>${esc(b.name)}</strong><small>${b.dueDate < flowToday() ? 'Check overdue bill' : 'Confirmed'} · ${esc(b.status ? billStatus(b) : frequencyNames[b.frequency])}</small></div><strong>${money(b.amountCents)}</strong>${edit ? button(icon('pencil'), 'bill', 'icon-button', `data-id="${esc(b.id)}" aria-label="Edit ${esc(b.name)}"`) : ''}</li>`).join('')}</ul>`;
    }
    function recentRow(t) {
        const peer = typeof linkedTransferPeer === 'function' ? linkedTransferPeer(t, transactions, accounts) : null;
        const displayName = peer ? transferPairLabel(t, peer, accounts) : t.name;
        const category = t.type === 'Transfer' ? (peer ? 'Linked transfer · ' + (t.amount < 0 ? 'Money out' : 'Money in') : 'Transfer') : t.category || 'Other';
        const nameIcon = t.type === 'Transfer' ? 'arrow-left-right' : t.amount > 0 ? 'banknote' : ({ Food: 'utensils', Transport: 'fuel', Shopping: 'shopping-bag', Entertainment: 'music', Bills: 'file-text' })[t.category] || 'receipt';
        return `<button type="button" class="transaction-row payday-transaction" data-plan-action="transaction" data-id="${esc(t.id)}"><span class="transaction-left"><span class="merchant-icon blue-icon">${icon(nameIcon)}</span><span><strong>${esc(displayName)}</strong><span>${esc(category)}${t.status === 'pending' ? ' · Pending' : ''}${t.notes ? ' · ' + esc(t.notes) : ''}</span></span></span><span class="transaction-right"><strong class="${t.amount > 0 && t.type !== 'Transfer' ? 'income-text' : ''}">${t.amount < 0 ? '−' : '+'}${money(Math.abs(Math.round(t.amount * 100)))}</strong><span>${validPlanDate(t.date) ? date(t.date) : 'Date needed'}</span></span></button>`;
    }
    // IMPORTANT: Array methods and rendering. filter removes zero categories, sort orders amounts, and map creates the chart markup.
    function categoryBars(month) {
        const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
        const categories = Object.entries(getSpendingBreakdown(transactions, month, days).categorySpending).filter(([, n]) => n !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        const max = Math.max(1, ...categories.map(([, n]) => Math.abs(n)));
        return categories.length ? `<div class="categories-mini" role="list" aria-label="Expenses by category">${categories.map(([name, value]) => `<div role="listitem"><button type="button" class="category-mini category-open ${value < 0 ? 'net-refund' : ''}" data-category-activity="${esc(name)}" data-category-month="${month}" aria-label="View ${esc(name)} transactions"><span class="row-between"><span>${esc(name)}</span><strong>${money(Math.round(value * 100))}<span aria-hidden="true" class="category-open-arrow">›</span></strong></span><span class="progress-bar" aria-hidden="true"><span class="progress-fill" style="width:${Math.abs(value) / max * 100}%"></span></span></button></div>`).join('')}</div>` : `<p class="detail-help">No expenses recorded for this month yet.</p>`;
    }
    function homeOverview() {
        const requestedMonth = new URLSearchParams(location.search).get('month');
        const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth || '') ? requestedMonth : flowToday().slice(0, 7);
        const label = new Date(month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const totals = getMoneyTotals(transactions, month);
        return `<section class="home-panel home-overview" aria-labelledby="home-overview-title"><div class="home-panel-heading"><div><p class="home-muted">Recorded activity</p><h2 id="home-overview-title">${esc(label)}</h2></div><a class="home-text-link" href="transactions.html?month=${month}">See activity ${icon('chevron-right')}</a></div><dl class="home-totals"><div><dt>Total income</dt><dd id="home-income">${money(moneyToCents(totals.income))}</dd></div><div><dt>Total expenses</dt><dd id="home-expenses">${money(moneyToCents(totals.spending))}</dd></div><div><dt>Remaining balance</dt><dd id="home-balance" ${totals.net < 0 ? 'class="home-negative"' : ''}>${money(moneyToCents(totals.net))}</dd></div></dl><p class="home-overview-note">Income minus expenses, separate from your bank balance.</p><div class="home-category-chart"><h3>Expenses by category</h3>${categoryBars(month)}</div><p class="home-footnote">Transfers and pending payments excluded. Refunds reduce expenses.</p></section>`;
    }
    function recoveryAction(e, cls = 'save-button') {
        if (!p.setup.completed) return `<a class="${cls}" href="setup.html">Start the short setup ${icon('arrow-right')}</a>`;
        if (paydayCheckInDue(p)) return button('Start payday check-in', 'payday-checkin', cls);
        if (e.missing.some(item => /repayment|card/i.test(item) || accounts.some(a => a.type === 'credit' && a.name && item.toLowerCase().includes(a.name.toLowerCase())))) return '<button type="button" class="' + cls + '" data-tool="card">Check card repayment ' + icon('arrow-right') + '</button>';
        if (e.missing.some(item => /overdue bills/i.test(item))) return '<a class="' + cls + '" href="bills.html#bill-tracking">Check overdue bills</a>';
        if (e.missing.some(item => /balance|spending account/i.test(item))) return '<button type="button" class="' + cls + '" data-tool="reconcile">Check available money</button>';
        if (e.missing.some(item => /payday/i.test(item))) return button('Confirm next payday', 'payday', cls);
        if (e.missing.some(item => /bills/i.test(item))) return '<a class="' + cls + '" href="setup.html?step=3">Confirm upcoming bills</a>';
        return '<a class="' + cls + '" href="setup.html?step=4">Check money to keep aside</a>';
    }
    function receivedPayButton(cls = 'back-button') {
        if (!p.setup.completed || !validPlanDate(p.payday.nextDate)) return '';
        const marked = p.lastPaydayCheckIn?.receivedOn === flowToday();
        return button(icon(marked?'check':'circle-check') + (marked?' Paid today':' I got paid'), 'payday-received', cls,
            marked ? 'disabled aria-label="Already marked paid today"' : '');
    }
    function paydayCheckInCard() {
        if (!paydayCheckInDue(p)) return '';
        return `<section class="card payday-checkin-card">${header('A fresh plan', 'Ready for your next plan?', icon('sunrise'))}<p>Check your available money, then plan until your next payday.</p>${button('Start payday check-in', 'payday-checkin')}<small>Start when your pay arrives. Your bills carry forward.</small></section>`;
    }
    let homeSlideKey = 'spending', homeSlides = [], homeChanges = [], homeBaseline, homeCarousel;
    function homeSource() { return flowHomeSourceStatus(p, accounts, flowToday()); }
    function homeTask(task, cls = 'home-next-main') {
        const content = '<span class="home-next-icon">' + icon(task.icon) + '</span><span><strong>' + esc(task.title) + '</strong><small>' + esc(task.text) + '</small></span>' + icon('chevron-right');
        if (task.href) return '<a class="' + cls + '" href="' + esc(task.href) + '">' + content + '</a>';
        return '<button type="button" class="' + cls + '" ' + (task.tool ? 'data-tool="' + task.tool + '"' : 'data-plan-action="' + task.action + '"') + '>' + content + '</button>';
    }
    function homeTasks(e) {
        const reminders = typeof flowReminderItems === 'function' ? flowReminderItems(p, e, accounts, transactions) : [];
        return flowHomeTasks(p, e, billState(), transactions.filter(needsCurrentTransactionReview).length, reminders, paydayCheckInDue(p));
    }
    function homeHighlights(e) {
        const week = flowWeeklySummary(p, transactions, accounts), slides = [];
        if (p.billsConfirmed && e.ready && window.FlowMobileViews) slides.push(FlowMobileViews.billHighlight(e, p.payday.nextDate));
        if (week.transactions) {
            const days = Array.from({ length: 7 }, (_, i) => addPlanDays(week.since, i));
            const daily = days.map(day => Math.round(getMoneyTotals(transactions.filter(t => t.date === day)).spending * 100));
            const max = Math.max(1, ...daily.map(Math.abs));
            slides.push({ key: 'spending', label: 'Recorded spending',
                body: '<strong class="home-highlight-amount">' + money(week.spendingCents) + '</strong><p>' + date(week.since) + '–' + date(flowToday()) + '</p><div class="home-spark" role="img" aria-label="' + esc(days.map((d, i) => date(d) + ': ' + money(daily[i])).join('; ')) + '">' + daily.map((n, i) => '<span class="home-spark-day"><span class="home-spark-bar ' + (n < 0 ? 'refund' : '') + '" style="height:' + Math.abs(n) / max * 22 + 'px"></span><span class="home-spark-label">' + new Date(days[i] + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' }) + '</span></span>').join('') + '</div>' });
        }
        const goal = (e.goals || flowFeatures(p).goals)[0];
        if (goal) {
            const saved = goal.remainingCents ?? goal.reservedCents;
            slides.push({ key: 'goal', label: goal.name, body: '<strong class="home-highlight-amount">' + money(saved) + '</strong><p>of ' + money(goal.targetCents) + ' · ' + (goal.location === 'inside' ? 'kept in spending money' : 'held outside spending money') + '</p><progress value="' + Math.min(saved, goal.targetCents) + '" max="' + goal.targetCents + '" aria-label="' + esc(goal.name) + ' progress"></progress><button type="button" class="home-text-link" data-tool="goal" data-id="' + esc(goal.id) + '">Open goal ' + icon('chevron-right') + '</button>' });
        }
        if (homeBaseline === undefined) { try { homeBaseline = JSON.parse(flowStorage.getItem('flowLastEstimate') || 'null'); } catch (_) { homeBaseline = null; } }
        const current = flowEstimateSnapshot(p, e);
        homeChanges = flowExplainChange(homeBaseline, current);
        if (homeChanges.length) slides.push({ key: 'changes', label: 'Since your last saved view', body: '<strong class="home-highlight-amount">' + homeChanges.length + ' plan ' + (homeChanges.length === 1 ? 'input' : 'inputs') + ' changed</strong><p>See what changed in your available money.</p>' + button('See changes ' + icon('chevron-right'), 'home-changes', 'home-text-link') });
        if (e.ready && !document.hidden) try { flowStorage.setItem('flowLastEstimate', JSON.stringify(current)); } catch (_) { /* Optional view comparisons must not block Home. */ }
        if (p.preferences.weeklyReminders === true) slides.push({ key: 'weekly', label: 'Your weekly check-in', body: '<strong class="home-highlight-amount">' + (week.due ? 'A quick reset' : 'All checked') + '</strong><p>' + (week.due ? 'Money, bills, and what changed.' : 'Last checked ' + date(flowFeatures(p).checkIn.date) + '.') + '</p><button type="button" class="home-text-link" data-tool="weekly">' + (week.due ? 'Start check-in' : 'View check-in') + ' ' + icon('chevron-right') + '</button>' });
        if (typeof flowNetWorth === 'function') {
            const worth = flowNetWorth(p, accounts);
            slides.push({ key:'networth', label:'Net worth', body: '<strong class="home-highlight-amount">' + (worth.rows.length ? money(worth.cents) : 'Your bigger picture') + '</strong><p>' + (worth.rows.length ? 'Estimate · tracked accounts' + (worth.missing.length ? ' · some balances need a check' : '') : 'What you own, minus what you owe.') + '</p><button type="button" class="home-text-link" data-growth="wealth">' + (worth.enabled ? 'View net worth' : 'Start tracking') + ' ' + icon('chevron-right') + '</button>' });
        }
        homeSlides = slides;
        if (!slides.length) return '';
        if (!slides.some(slide => slide.key === homeSlideKey)) homeSlideKey = slides[0].key;
        const selected = slides.find(slide => slide.key === homeSlideKey), index = slides.indexOf(selected);
        return '<section class="home-panel home-highlights" aria-roledescription="carousel" aria-label="Your highlights"><div class="home-panel-heading"><h2>At a glance</h2>' + (slides.length > 1 ? '<div class="home-carousel-arrows">' + button(icon('chevron-left'), 'home-slide', 'icon-button', 'data-step="-1" aria-label="Previous highlight" aria-controls="home-highlights-track"') + button(icon('chevron-right'), 'home-slide', 'icon-button', 'data-step="1" aria-label="Next highlight" aria-controls="home-highlights-track"') + '</div>' : '') + '</div><div class="home-highlights-track" id="home-highlights-track" role="group" tabindex="0" aria-label="Swipe or use arrow keys for highlights">' + slides.map((slide, i) => '<div class="home-highlight-content" data-highlight-key="' + slide.key + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + slides.length + ': ' + esc(slide.label) + '"' + (i === index ? '' : ' inert aria-hidden="true"') + '><span class="home-muted">' + esc(slide.label) + '</span>' + slide.body + '</div>').join('') + '</div>' + (slides.length > 1 ? '<div class="home-carousel-dots" aria-label="Choose a highlight">' + slides.map((slide, i) => button('<span></span>', 'home-slide', 'home-slide-dot', 'data-key="' + slide.key + '" aria-controls="home-highlights-track" aria-label="' + (i + 1) + ' of ' + slides.length + ': ' + esc(slide.label) + '" aria-pressed="' + (i === index) + '"')).join('') + '</div>' : '') + '<p class="sr-only home-highlight-status" role="status" aria-live="polite" aria-atomic="true"></p></section>';
    }
    function mountHomeCarousel() {
        const panel = home.querySelector('.home-highlights'), track = panel?.querySelector('.home-highlights-track');
        if (!track) return;
        const slides = [...track.children], reduced = matchMedia('(prefers-reduced-motion:reduce)');
        let settleTimer, requested = null;
        const position = i => slides[i].offsetLeft - slides[0].offsetLeft;
        function select(i, announce = false) {
            homeSlideKey = slides[i].dataset.highlightKey;
            slides.forEach((slide, n) => { slide.inert = n !== i; slide.setAttribute('aria-hidden', String(n !== i)); });
            panel.querySelectorAll('.home-slide-dot').forEach(dot => dot.setAttribute('aria-pressed', String(dot.dataset.key === homeSlideKey)));
            const previous = panel.querySelector('[data-step="-1"]'), next = panel.querySelector('[data-step="1"]');
            if (previous) previous.disabled = i === 0;
            if (next) next.disabled = i === slides.length - 1;
            if (announce) panel.querySelector('.home-highlight-status').textContent = slides[i].getAttribute('aria-label');
        }
        function go(i, smooth = true) {
            i = Math.max(0, Math.min(slides.length - 1, i));
            requested = i;
            select(i, smooth);
            track.scrollTo({ left: position(i), behavior: smooth && !reduced.matches ? 'smooth' : 'auto' });
        }
        function settled() {
            clearTimeout(settleTimer);
            if (!track.isConnected || !track.clientWidth) return;
            if (requested !== null && Math.abs(track.scrollLeft - position(requested)) > 2) return;
            requested = null;
            let nearest = 0;
            slides.forEach((_, i) => { if (Math.abs(track.scrollLeft - position(i)) < Math.abs(track.scrollLeft - position(nearest))) nearest = i; });
            select(nearest, true);
        }
        track.addEventListener('scroll', () => { clearTimeout(settleTimer); settleTimer = setTimeout(settled, 120); }, { passive: true });
        track.addEventListener('scrollend', settled);
        // A finger or trackpad can take over an in-progress button animation.
        for (const name of ['pointerdown', 'wheel']) track.addEventListener(name, () => { requested = null; }, { passive: true });
        track.addEventListener('keydown', event => {
            if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = slides.findIndex(slide => slide.dataset.highlightKey === homeSlideKey);
            go(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
        });
        const observer = new ResizeObserver(() => go(slides.findIndex(slide => slide.dataset.highlightKey === homeSlideKey), false));
        observer.observe(track);
        go(slides.findIndex(slide => slide.dataset.highlightKey === homeSlideKey), false);
        homeCarousel = { go, cleanup() { observer.disconnect(); clearTimeout(settleTimer); } };
    }

    function moneyMap(e, compact = false) { return window.FlowMobileViews?.moneyMap(e, compact) || ''; }
    function runway() {
        const path = flowPaydayRunway(p, flowToday());
        if (!path) return '';
        return '<div class="payday-runway" style="--runway-progress:' + (path.progress ?? 0) + '" role="img" aria-label="' + path.days + ' days until payday"><span><strong>' + path.days + '</strong><small>' + (path.days === 1 ? 'day to go' : 'days to go') + '</small></span></div>';
    }
    function sourceFeedMarkup() {
        if(typeof loadBankFeedStatus!=='function')return '';
        const rows=loadBankFeedStatus(owner), ids=new Set(loadBankAccounts().filter(a=>p.selectedAccountIds.includes(a.id)).map(a=>a.bankConnectionId));
        const selected=ids.size?rows.filter(row=>ids.has(row.id)):rows;
        if(!selected.length)return '';
        return '<section class="source-feed-status"><span>Transaction feed</span><button type="button" data-bank-feed-open class="source-feed-button">'+esc(bankFeedSummary(selected).title)+' '+icon('chevron-right')+'</button></section>';
    }
    function renderSourceSheet(result='') {
        const panel=dialog.querySelector('#source-status-panel');if(!panel||owner!==flowStorage.getItem('flow_user_id'))return;
        const current=flowHomeMoneySource(p,loadBankAccounts(),flowToday());
        const when=value=>Number.isFinite(Date.parse(value))?esc(new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})):'Not supplied by the bank';
        panel.innerHTML=`<section class="source-money-hero"><span>${current.manual?'Balance you confirmed':'Latest available bank estimate'}</span><strong>${current.amountCents===null?'Balance unavailable':money(current.amountCents)}</strong><small>${current.manual?'Confirmed '+date(current.confirmedOn):current.caution?'Waiting for a newer bank update':'Bank connected · checks automatically'}</small></section><div data-source-feed>${sourceFeedMarkup()}</div><details class="setup-extra"><summary>Accounts & update times</summary>${current.manual?'<p class="detail-help">This is the amount you entered. Confirm your full available balance again on a new day.</p>':current.rows.map(a=>`<section class="source-account"><div><strong>${esc(a.name)}</strong><strong>${a.type==='depository'&&a.currency==='USD'&&Number.isSafeInteger(a.availableCents)?money(a.availableCents):'Unavailable'}</strong></div><dl><div><dt>Bank’s balance date</dt><dd>${when(a.bankUpdatedAt)}</dd></div><div><dt>Flow received this balance</dt><dd>${when(a.retrievedAt)}</dd></div></dl></section>`).join('')}</details><p class="source-result" role="status">${esc(result)}</p><details class="setup-extra"><summary>My pay or a transaction is missing</summary><p>Your bank may show activity before its feed sends it to Flow. A recent check means Flow asked for available data; it does not confirm the bank has sent every transaction.</p><p>You can wait for the feed, or confirm the full available balance you see in your bank. Future pay is never added automatically.</p></details><div class="source-actions">${!current.manual&&p.selectedAccountIds.length?button('Check for updates','source-check','back-button'):''}${button('Confirm my available balance','balance','save-button')}<a class="inline-link" href="account.html#bank-connections">Manage banks</a></div>`;
        icons();
    }
    async function checkSourceSheet(target) {
        const panel=dialog.querySelector('#source-status-panel'),base=flowStorage.getItem('flowPlanning');if(!panel)return;
        target.disabled=true;target.textContent='Checking…';
        let result,timer;try{result=await Promise.race([Promise.resolve(window.refreshFlowAccounts?.(true)),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),20000);})]);}catch(_){result=null;}finally{clearTimeout(timer);}
        if(!panel.isConnected||owner!==flowStorage.getItem('flow_user_id')||base!==flowStorage.getItem('flowPlanning'))return;
        renderSourceSheet(result?.status==='checked'?'Check finished. The bank feed may still be behind your banking app.':'Could not finish this check. The last known amount is kept; Flow will try again automatically.');
    }
    function renderHome() {
        if (!home) return;
        homeCarousel?.cleanup(); homeCarousel = null;
        home.dataset.design = 'payday-path';
        const e = estimate(), source = homeSource(), tasks = homeTasks(e), today = flowToday();
        const recent = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
        const upcoming = p.billsConfirmed ? e.bills.filter(b => b.dueDate >= today && b.dueDate <= p.payday.nextDate).slice(0, 2) : [];
        let notice = '';
        if (p.setup.completed && !e.ready) notice = '<div class="home-notice" role="status">' + icon('circle-help') + '<div><strong>Let’s update your plan</strong><p>' + esc(e.missing[0]) + '.</p></div>' + button('Details', 'breakdown', 'home-text-link') + '</div>';
        else if (e.ready && e.leftCents < 0) notice = '<div class="home-notice">' + icon('triangle-alert') + '<div><strong>Your plan needs adjusting</strong><p>Your plan needs more than you have available.</p></div></div>';
        else if (e.ready && source.caution) notice = '<div class="home-notice">' + icon('clock-3') + '<div><strong>' + esc(source.label) + '</strong><p>Flow checks automatically. Open details if your balance needs attention.</p></div>' + button('Details', 'home-source', 'home-text-link') + '</div>';
        const heroAction = !e.ready ? recoveryAction(e, 'home-primary') : e.leftCents < 0 ? '<a class="home-primary" href="budgets.html">Adjust my plan ' + icon('arrow-right') + '</a>' : '<button type="button" class="home-primary" data-tool="purchase">Can I spend this? ' + icon('arrow-right') + '</button>';
        const hero = '<section class="payday-hero home-hero" id="flow-decision-tools" aria-labelledby="home-money-title"><div class="home-hero-period">' + icon('sun') + ' ' + (validPlanDate(p.payday.nextDate) ? 'Until ' + date(p.payday.nextDate) + ' payday' : 'Your payday plan') + '</div><h3 class="home-amount">' + (e.ready ? money(Math.abs(e.leftCents)) : p.setup.completed ? 'Let’s check' : 'Let’s make a plan') + '</h3><h2 id="home-money-title">' + (e.ready ? e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated to spend' : p.setup.completed ? 'Confirm your plan' : 'Start with your next payday') + '</h2><div class="home-hero-meta">' + button(esc(source.label), 'home-source', 'home-source-button') + button('How it works ' + icon('chevron-right'), 'breakdown', 'home-text-link') + '</div>' + '<div class="home-hero-actions">' + heroAction + receivedPayButton('home-paid-button') + '</div></section>';
        const path = '<section class="home-panel home-payday-path"><div class="home-panel-heading"><h2>Coming up</h2><a class="home-text-link" href="bills.html">All bills</a></div><div class="home-path"><div class="home-path-stop"><span class="home-path-dot">' + icon('circle-dot') + '</span><strong>Today</strong><small>' + date(today) + '</small></div>' + upcoming.map(b => button('<span class="home-path-dot">' + icon('receipt') + '</span><strong>' + esc(b.name) + '</strong><small>' + date(b.dueDate) + '</small>', 'bill', 'home-path-stop', 'data-id="' + esc(b.id) + '" aria-label="View ' + esc(b.name) + ', due ' + date(b.dueDate) + '"')).join('') + button('<span class="home-path-dot">' + icon('flag') + '</span><strong>Payday</strong><small>' + date(p.payday.nextDate) + '</small>', 'payday', 'home-path-stop') + '</div>' + (!p.billsConfirmed ? '<p class="home-footnote">Confirm your bills in setup to add them to the path.</p>' : '') + '</section>';
        const next = e.ready && tasks.length ? '<section class="home-next">' + homeTask(tasks[0]) + (tasks.length > 1 ? button('Open your check-in', 'home-tasks', 'home-all-tasks') : '') + '</section>' : '';
        const highlights = '<details class="mobile-home-overview"><summary>This month’s activity ' + icon('chevron-down') + '</summary>' + homeOverview() + '</details>' + homeHighlights(e);
        const simpleMath=e.ready?'<details class="home-money-details"><summary>Your money at a glance</summary><div class="home-simple-math"><span>Available estimate<strong>'+money(e.balanceCents)+'</strong></span><span>Planned costs<strong>'+money(e.balanceCents-e.leftCents)+'</strong></span></div></details>':'';
        const visualHero=hero.replace('<h3 class="home-amount">',runway()+'<h3 class="home-amount">').replace('<div class="home-hero-meta">',simpleMath+'<div class="home-hero-meta">');
        const essentials=e.ready&&e.reserves.length?'<section class="home-panel home-everyday"><div class="home-panel-heading"><div><h2>Already set aside</h2><p class="home-muted">Ready for everyday spending</p></div><a href="budgets.html" class="home-text-link">Plan '+icon('chevron-right')+'</a></div><div class="home-everyday-list">'+e.reserves.slice(0,3).map(r=>button('<span class="home-everyday-icon">'+icon(({Food:'utensils',Transport:'car',Entertainment:'music'})[r.category]||'wallet')+'</span><span><strong>'+esc(r.name)+'</strong><small>'+money(r.spentCents)+' used</small></span><strong>'+money(r.remainingCents)+'<small>left</small></strong>'+icon('chevron-right'),'essential','home-everyday-row','data-id="'+esc(r.id)+'"')).join('')+'</div></section>':'';
        const phoneHero = window.FlowMobileViews ? FlowMobileViews.decorateHero(visualHero, e, validPlanDate(p.payday.nextDate) ? planDays(today, p.payday.nextDate) : 0) : visualHero;
        home.innerHTML = '<header class="home-greeting"><div><p>' + esc(new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})) + '</p><h1>Today</h1></div><a href="add-transaction.html" class="home-quick-add" aria-label="Add a transaction">' + icon('plus') + '</a></header>' + notice + '<div class="home-layout"><div class="home-main-column">' + phoneHero + next + essentials + path + '</div><div class="home-side-column">' + highlights + '<section class="home-panel home-recent"><div class="home-panel-heading"><h2>Recent activity</h2><a class="home-text-link" href="transactions.html">See all</a></div><div class="transaction-list">' + (recent.map(recentRow).join('') || '<div class="home-empty"><p>Your payments will appear here.</p><a href="account.html#bank-connections" class="home-text-link">Connect a bank ' + icon('chevron-right') + '</a><a href="add-transaction.html" class="home-text-link">Add a payment ' + icon('chevron-right') + '</a></div>') + '</div></section></div></div>';
        mountHomeCarousel();
    }
    function renderBills() {
        if (!billsPage) return;
        billsPage.innerHTML = '<div class="page-header"><h1>Bills</h1>' + button('Add bill ' + icon('plus'), 'bill', 'save-button') + '</div><section class="card">' + header('', 'Before payday') + timeline(true) + '</section>' + billManagementCards();
        if (window.FlowMobileViews) billsPage.querySelector('.page-header').insertAdjacentHTML('afterend', FlowMobileViews.billsSummary(p, estimate(), billSuggestions().length));
    }
    function renderPlan() {
        if (!plan) return;
        const e = estimate();
        plan.innerHTML = `${paydayCheckInCard()}<section class="plan-summary"><div><p class="small-label">Your plan ${validPlanDate(p.payday.nextDate) ? 'through ' + date(p.payday.nextDate) : ''}</p><h3>${e.ready ? money(e.leftCents) + (e.leftCents < 0 ? ' estimated shortfall' : ' estimated left') : 'A little setup, more clarity'}</h3><p>${e.ready ? 'Your bills and set-asides are accounted for.' : esc(e.missing.slice(0, 2).join(' · '))}</p></div>${e.ready ? button('See breakdown', 'breakdown', 'back-button') : recoveryAction(e)}</section><section class="plan-columns"><div><article class="card">${header('Your next income', 'Payday', button('Edit', 'payday', 'inline-link'))}<div class="row-between"><div><strong class="setting-title">${validPlanDate(p.payday.nextDate) ? new Date(p.payday.nextDate + 'T12:00:00').toLocaleDateString('en-US', { dateStyle: 'long' }) : 'Confirm your next payday'}</strong><p>${frequencyNames[p.payday.frequency]}</p></div><span class="subtle-icon">${icon('calendar-days')}</span></div>${receivedPayButton('back-button plan-paid-button')}<p class="detail-help">Future pay isn’t included in what you can spend before it arrives.</p></article><article class="card">${header('Coming up', 'Bills before payday', button('Add bill', 'bill', 'inline-link'))}${timeline(true)}<p class="detail-help">Already paid? Open the bill to confirm it’s reflected in your balance and move to its next date.</p></article>${billManagementCards()}</div><div><article class="card">${header('Keep aside', 'Everyday spending', button('Edit', 'essentials', 'inline-link'))}<div class="plain-list">${e.reserves.map(r => `<div class="row-between"><span class="setting-title">${esc(r.name)}</span><div><strong>${money(r.remainingCents)}</strong><small class="setting-note">${money(r.amountCents)} set aside</small></div></div>`).join('') || '<p class="detail-help">Choose what to keep aside in setup. Category limits are optional.</p>'}</div></article><article class="card">${header('A little breathing room', 'Your cushion', button('Edit', 'essentials', 'inline-link'))}<strong class="cushion-value">${money(p.cushionCents)}</strong><p class="detail-help">Money you’ve chosen to keep out of everyday spending.</p></article><article class="card">${header('Your money', 'Spending accounts', button('Manage', 'accounts', 'inline-link'))}<p class="detail-help">${p.manualBalance ? `Available balance confirmed by you on ${date(p.manualBalance.date)}.` : accounts.filter(a => p.selectedAccountIds.includes(a.id)).map(a => esc(a.name)).join(', ') || 'Choose accounts or enter your available balance.'}</p>${button('Update available balance', 'balance', 'back-button')}</article></div></section>`;
        if (window.FlowMobileViews) {
            const desktop = document.createElement('div'); desktop.className = 'desktop-plan';
            while (plan.firstChild) desktop.append(plan.firstChild);
            plan.append(desktop);
            plan.insertAdjacentHTML('afterbegin', FlowMobileViews.plan(p, e, homeSource(), recoveryAction(e)));
        }
    }
    function supported(a) { return a.type === 'depository' && a.currency === 'USD' && Number.isSafeInteger(a.availableCents); }
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
    function billState() { return getBillTrackingState(p, accounts, transactions); }
    function billStatus(row) {
        return ({ paid: row?.confirmed ? 'Paid · confirmed by you' : 'Paid · matched', found: 'Payment found · check balance',
            amount: 'Amount changed · check', ambiguous: 'Choose the matching payment', changed: 'Saved payment changed',
            refund: 'Refund found · check', pending: 'Payment processing', overdue: 'Date passed · check payment', upcoming: 'Upcoming' })[row?.status] || 'Completed';
    }
    function billSuggestions() { return suggestRecurringBills(p, accounts, transactions); }
    function suggestionMarkup(limit = 8) {
        const suggestions = billSuggestions();
        return suggestions.slice(0, limit).map(s => `<div class="bill-suggestion"><div><strong>${esc(s.name)}</strong><p>${money(s.amountCents)} · ${frequencyNames[s.frequency]} · next around ${date(s.nextDate)}</p><small>${esc(s.accountName)} · matching payments on ${date(s.previousDate)} and ${date(s.lastDate)}${s.varies ? ' · amounts vary' : ''}</small></div><div class="bill-row-actions">${button('Check', 'suggested-bill', 'back-button', `data-key="${esc(s.key)}"`)}${button('Dismiss', 'dismiss-bill', 'inline-link', `data-key="${esc(s.key)}" aria-label="Dismiss suggestion ${esc(s.name)}"`)}</div></div>`).join('') + (suggestions.length > limit ? `<p class="detail-help">${suggestions.length - limit} more possible bills. Confirm or dismiss these to see the next ones.</p>` : '');
    }
    function billManagementCards() {
        const state = billState();
        const rows = state.bills.map(b => {
            const row = b.attention || (b.next && b.next.status !== 'upcoming' ? b.next : b.lastPaid || b.next);
            const ignored = row && (p.billPaymentDecisions || []).some(d => d.billId === b.id && d.dueDate === row.dueDate && d.choice === 'ignore');
            const mobile = window.FlowMobileViews ? FlowMobileViews.billRow(b, row) : '';
            return `<div class="tracked-bill">${mobile}<div class="tracked-bill-desktop"><strong>${esc(b.name)}</strong><p>${money(b.next?.amountCents ?? row?.amountCents ?? b.amountCents)} · ${frequencyNames[b.frequency]}${b.next ? ' · due ' + date(b.next.dueDate) : ' · complete'}</p><span class="bill-status ${row?.needsAttention ? 'bill-status-check' : row?.paid ? 'bill-status-paid' : ''}">${esc(billStatus(row))}</span>${b.lastPaid && b.next ? `<small>Last matched cycle: ${date(b.lastPaid.dueDate)}</small>` : ''}</div><div class="bill-row-actions">${row && (row.needsAttention || row.payment || row.confirmed || ignored || row.status === 'pending') ? button(row.paid ? 'View match' : 'Check', 'review-bill', 'back-button', `data-id="${esc(b.id)}" data-date="${row.dueDate}" aria-label="Check bill ${esc(b.name)}"`) : ''}${button('Edit', 'bill', 'inline-link', `data-id="${esc(b.id)}" aria-label="Edit bill ${esc(b.name)}"`)}</div></div>`;
        }).join('');
        const dismissed = p.dismissedBillSuggestions || [];
        return `<article class="card" id="bill-tracking">${header('Bills & subscriptions', 'Keep the routine simple', button('Add a bill', 'bill', 'inline-link'))}${rows || '<p class="detail-help">Confirm a suggestion below, or add a bill. You choose what belongs in your plan.</p>'}<p class="detail-help">Clear posted payments are matched once. If the bank balance has no reliable date, Flow asks you to check before releasing the money set aside.</p></article><article class="card" id="bill-discovery">${header('Possible repeats', 'Anything we should plan for?')}${suggestionMarkup() || '<p class="detail-help">No clear new patterns yet. Suggestions appear after repeated payments from your linked cash accounts.</p>'}${dismissed.length ? `<details class="manual-balance-details"><summary>Dismissed suggestions (${dismissed.length})</summary><div class="plain-list">${dismissed.map(d => `<div class="row-between"><strong>${esc(d.label)}</strong>${button('Restore', 'restore-bill-suggestion', 'inline-link', `data-key="${esc(d.key)}" aria-label="Restore suggestion ${esc(d.label)}"`)}</div>`).join('')}</div></details>` : ''}<p class="detail-help">Suggestions do not reserve money until you confirm the bill and its next unpaid date.</p></article>`;
    }
    function reviewBill(billId, dueDate) {
        const row = billState().rows.find(r => r.billId === billId && r.dueDate === dueDate);
        if (!row) throw new Error('This bill changed. Reload to see its latest state.');
        const fingerprints = new Map(row.candidates.map(t => [billPaymentKey(t), billFingerprint(t)]));
        const intro = `<p class="bill-review-intro"><strong>${esc(row.name)}</strong><br>${money(row.amountCents)} expected · due ${date(row.dueDate)}</p><span class="bill-status ${row.needsAttention ? 'bill-status-check' : ''}">${esc(billStatus(row))}</span>`;
        const explain = row.status === 'amount' ? `A payment of ${money(Math.abs(Math.round(row.payment.amount * 100)))} was found. Your usual amount stays the same unless you choose to update it.`
            : row.status === 'ambiguous' ? 'More than one payment or bill could match. Choose the right payment before confirming.'
            : row.status === 'changed' ? 'The bank payment saved with this bill was changed or removed. Check it again before releasing this bill’s set-aside.'
            : row.status === 'refund' ? 'A matching refund was found. Check whether this bill is still due or has been settled.'
            : row.status === 'pending' ? 'The payment is still processing. It stays reserved until posted and reflected in your available balance.'
            : row.status === 'overdue' ? 'No clear posted payment has matched yet. Bank activity can arrive late; check before marking this bill paid.'
            : row.paid ? 'This cycle is no longer reserved as an unpaid bill. You can correct an incorrect match here.'
            : 'A payment was found, but its effect on the available balance is not yet established. Check your available bank balance before confirming.';
        const ignored = (p.billPaymentDecisions || []).some(d => d.billId === billId && d.dueDate === dueDate && d.choice === 'ignore');
        const controls = `<div class="bill-actions">${row.payment ? button('Not this payment', 'ignore-bill-payment', 'inline-link', `data-id="${esc(billId)}" data-date="${dueDate}" data-payment="${esc(billPaymentKey(row.payment))}" data-fingerprint="${esc(billFingerprint(row.payment))}"`) : ''}${row.confirmed ? button('Undo my confirmation', 'reset-bill-decision', 'inline-link', `data-id="${esc(billId)}" data-date="${dueDate}"`) : ''}${ignored ? button('Reconsider ignored payments', 'reset-bill-ignores', 'inline-link', `data-id="${esc(billId)}" data-date="${dueDate}"`) : ''}${button('Edit bill details', 'bill', 'inline-link', `data-id="${esc(billId)}"`)}</div>`;
        if (row.paid || row.status === 'pending') return showModal('Check a bill', intro + `<p class="detail-help">${esc(explain)}</p>${row.payment ? `<p class="bill-match-evidence">${esc(row.payment.name)} · ${date(row.payment.date)} · ${money(Math.abs(Math.round(row.payment.amount * 100)))}</p>` : ''}` + controls);
        const options = row.candidates.map(t => `<option value="${esc(billPaymentKey(t))}" ${row.payment && billPaymentKey(row.payment) === billPaymentKey(t) ? 'selected' : ''}>${esc(t.name)} · ${date(t.date)} · ${money(Math.abs(Math.round(t.amount * 100)))}</option>`).join('');
        const form = intro + `<p class="detail-help">${esc(explain)}</p><div class="stack bill-match-form">${options ? `<label class="field">Payment<select name="payment" required>${options}</select></label>` : '<p class="detail-help">This confirmation records that you have checked the payment, even if it has not arrived in Flow yet.</p>'}<label class="toggle-label"><input type="checkbox" name="reflected" required>I checked that this bill’s payment is reflected in my available balance.</label>${row.candidates.some(t => Math.abs(Math.round(t.amount * 100)) !== row.amountCents) ? '<label class="toggle-label"><input type="checkbox" name="updateAmount">Use the selected payment’s amount for future cycles, too.</label>' : ''}</div>` + controls;
        showModal('Check a bill', form, (values, next) => {
            if (!values.get('reflected')) throw new Error('Check the payment in your available balance first.');
            const key = String(values.get('payment') || '');
            const fresh = loadTransactions();
            if (key) {
                const current = fresh.find(t => billPaymentKey(t) === key);
                if (!current || billFingerprint(current) !== fingerprints.get(key)) throw new Error('This payment changed while you were checking it. Close and reopen this bill before saving.');
            }
            Object.assign(next, decideBillPayment(next, fresh, loadBankAccounts(), billId, dueDate, key ? 'paid' : 'manual', key, Boolean(values.get('updateAmount'))));
        }, 'Confirm paid');
    }
    function reserveSuggestionMarkup(suggestion) {
        if (!suggestion) return '';
        return `<div class="reserve-period"><span class="reserve-period-icon">${icon('calendar-days')}</span><div><strong>${suggestion.days} days · until ${date(p.payday.nextDate)}</strong><small>For this plan, not a whole month</small></div></div>`;
    }
    function reserveInput(row, name, value, suggested, evidenceRow = null) {
        const symbol = ({Food:'utensils',Transport:'car',Entertainment:'music',Cushion:'shield-check'})[row.category] || 'wallet';
        const basis=evidenceRow ? evidenceRow.method==='previous'?'Your last plan':evidenceRow.method==='none'?'Choose what you need':evidenceRow.wholePurchase?'One usual purchase covered':'Your usual spending' : row.category==='Cushion'?'Your choice':'Your amount';
        return `<div class="reserve-item"><label class="reserve-choice"><span class="reserve-choice-icon">${icon(symbol)}</span><span class="reserve-choice-copy"><strong>${esc(row.name)}</strong><small>${basis}</small></span><span class="reserve-choice-amount"><span aria-hidden="true">$</span><input aria-label="${esc(row.name)}" name="${name}" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(value)}"></span></label>${evidenceRow?`<div class="reserve-item-footer"><span>${evidenceRow.confidence==='limited'?'Early estimate':'Based on your spending'}</span>${button('See purchases '+icon('chevron-right'),'reserve-evidence','inline-link',`data-category="${esc(row.category)}" data-input="${name}"`)}</div>`:''}</div>`;

    }
    function reserveFields(values = p.essentials, guided = false) {
        const suggestion = guided ? flowStarterReserves(p,transactions,accounts,flowToday(),Date.now(),reserveReview||{}) : null;
        const entries = values.length ? values : suggestion?.entries || [{id:'food',name:'Food & groceries',category:'Food',amountCents:0},{id:'transport',name:'Transport',category:'Transport',amountCents:0},{id:'fun',name:'Entertainment',category:'Entertainment',amountCents:0}];
        const defaults = guided && !p.reservesConfirmed;
        const draft = setup && flowSetupStage(p.setup.step) === 2 ? p.setup.reserveDraft : null;
        const inputs = entries.map((row,i) => reserveInput(row,'essential-'+i,
            draft?.['essential-'+i] ?? ((defaults ? suggestion?.entries[i]?.amountCents ?? 0 : row.amountCents || 0)/100).toFixed(2),
            suggestion?.entries[i]?.amountCents,suggestion?.history?.rows.find(r=>r.category===row.category))).join('') + reserveInput({name:'Safety cushion',category:'Cushion'},'cushion',
                draft?.cushion ?? ((defaults ? suggestion?.cushionCents || 0 : p.cushionCents)/100).toFixed(2), suggestion?.cushionCents);
        return inputs;
    }
    function reserveGuideNote(suggestion) {
        if (!suggestion) return '';
        return `<p class="reserve-suggestion-note">${icon('history')} ${suggestion.source==='history'?'Based on your recent spending':suggestion.source==='previous'?'Your last amounts, ready to adjust':'No reliable history yet. Choose what you need; 0 means none.'}</p>`;
    }
    function applyReserveReview(next) {
        if(!reserveReview)return;
        const guide=flowBudgetGuide(next),g=flowEnableGrowth(next);g.version=2;
        g.budgetGuide={...guide,excludedKeys:[...reserveReview.excludedKeys],includedKeys:[...reserveReview.includedKeys]};
    }
    const evidenceDialog=document.createElement('dialog');evidenceDialog.id='reserve-evidence-dialog';evidenceDialog.className='transaction-details-dialog reserve-evidence-dialog';evidenceDialog.setAttribute('aria-labelledby','reserve-evidence-title');document.body.append(evidenceDialog);
    function evidenceModel(){const c=evidenceContext;return flowStarterReserves(c.plan,c.tx,c.accounts,flowToday(),Date.now(),c.review).history.rows.find(r=>r.category===c.category);}
    function evidenceGuard(){if(!evidenceContext||evidenceContext.owner!==flowStorage.getItem('flow_user_id')||evidenceContext.day!==flowToday()||evidenceContext.base!==flowStorage.getItem('flowPlanning')||evidenceContext.txStamp!==flowStorage.getItem('transactions'))throw new Error('New saved changes arrived. Close and reopen this breakdown.');}
    function renderEvidence(){
        const row=evidenceModel(),c=evidenceContext,max=Math.max(1,...row.windows.map(w=>w.cents));
        const purchases=new Map([...row.samples,...row.excluded].map(t=>[t.key,t]));
        evidenceDialog.innerHTML=`<div class="dialog-head"><div><p class="small-label">Behind your suggestion</p><h2 id="reserve-evidence-title" tabindex="-1">${esc(c.category)}</h2></div><button type="button" class="icon-button" data-evidence-action="close" aria-label="Close breakdown">${icon('x')}</button></div><div class="evidence-hero"><span>For ${planDays(flowToday(),c.plan.payday.nextDate)} days</span><strong>${money(row.suggestedCents)}</strong><p>${row.wholePurchase?'Covers one usual purchase instead of part of one.':row.method==='previous'?'Your last confirmed amount; history is limited.':row.method==='none'?'No reliable estimate yet. Choose an amount that fits your needs.':row.method==='purchases'?'A usual purchase amount; history is limited.':'The middle amount from your matching spending periods.'}</p></div>${row.windows.length?`<section class="evidence-chart" aria-label="Past spending periods">${[...row.windows].reverse().map(w=>`<div><strong>${money(w.cents)}</strong><span class="evidence-bar" style="--bar-size:${Math.max(3,w.cents/max*100)}%" aria-hidden="true"></span><small>${date(w.from)}<br>${date(w.through)}</small></div>`).join('')}</section>`:''}<h3 class="evidence-section-title">Purchases behind it</h3><p class="detail-help">Mark a one-off purchase to leave it out of suggestions.</p><div class="evidence-purchases">${[...purchases.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<label class="evidence-purchase"><span><strong>${esc(t.name)}</strong><small>${date(t.date)} · ${money(t.cents)}</small></span><span class="evidence-oneoff"><input type="checkbox" data-evidence-key="${esc(t.key)}" ${c.review.excludedKeys.includes(t.key)||t.excluded&&!c.review.includedKeys.includes(t.key)?'checked':''} aria-label="Leave ${esc(t.name)} out of suggestions">One-off</span></label>`).join('')||'<p class="detail-help">No categorised purchases in this history.</p>'}</div>${row.refunds.length?`<details class="setup-extra"><summary>Refunds reduce these totals</summary>${row.refunds.map(t=>`<p>${esc(t.name)} · ${date(t.date)} · −${money(t.cents)}</p>`).join('')}</details>`:''}<p class="evidence-footnote">These choices change suggestions, not your transactions.</p><p class="form-message" role="alert"></p><footer class="evidence-footer"><button type="button" class="save-button" data-evidence-action="use">Use ${money(row.suggestedCents)} for ${esc(c.category)}</button></footer>`;
        icons();
    }
    function openEvidence(target){
        const inCheck=Boolean(checkIn&&checkIn.step===2),draft=clone();if(inCheck)draft.payday.nextDate=checkIn.nextDate;
        evidenceContext={category:target.dataset.category,input:target.dataset.input,plan:draft,tx:loadTransactions(),accounts:loadBankAccounts(),review:JSON.parse(JSON.stringify(reserveReview||flowBudgetGuide(p))),owner,base:pageBase,day:flowToday(),txStamp:flowStorage.getItem('transactions'),invoker:target,inCheck};
        evidenceGuard();renderEvidence();evidenceDialog.showModal();evidenceDialog.querySelector('h2').focus({preventScroll:true});
    }
    evidenceDialog.addEventListener('change',event=>{if(!event.target.dataset.evidenceKey)return;try{evidenceGuard();const key=event.target.dataset.evidenceKey,r=evidenceContext.review;r.excludedKeys=r.excludedKeys.filter(k=>k!==key);r.includedKeys=r.includedKeys.filter(k=>k!==key);(event.target.checked?r.excludedKeys:r.includedKeys).push(key);renderEvidence();[...evidenceDialog.querySelectorAll('[data-evidence-key]')].find(n=>n.dataset.evidenceKey===key)?.focus({preventScroll:true});}catch(error){evidenceDialog.querySelector('.form-message').textContent=error.message;}});
    evidenceDialog.addEventListener('click',event=>{const action=event.target.closest('[data-evidence-action]')?.dataset.evidenceAction;if(!action)return;if(action==='close')return evidenceDialog.close();try{evidenceGuard();const row=evidenceModel(),c=evidenceContext,parent=c.inCheck?dialog:setup,input=parent.querySelector(`[name="${c.input}"]`);if(!input)throw new Error('Reopen this amount to update it.');reserveReview=c.review;input.value=(row.suggestedCents/100).toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}));evidenceDialog.close();}catch(error){evidenceDialog.querySelector('.form-message').textContent=error.message;}});
    evidenceDialog.addEventListener('close',()=>{const invoker=evidenceContext?.invoker;evidenceContext=null;if(invoker?.isConnected)invoker.focus({preventScroll:true});});
    function updateSetupReservePreview() {
        if (!setup || flowSetupStage(p.setup.step) !== 2) return;
        const box = setup.querySelector('#reserve-preview'), form = setup.querySelector('form');
        try {
            accounts=loadBankAccounts();transactions=loadTransactions();setupPreviewStamp=JSON.stringify([flowStorage.getItem('bankAccounts'),flowStorage.getItem('transactions')]);
            const next = clone(); collectReserves(new FormData(form),next,true);
            const e = paydayEstimate({...next,setup:{...next.setup,completed:true}},accounts,transactions);
            box.innerHTML = `<span>${e.ready ? e.leftCents < 0 ? 'Over your available money' : 'Left after bills & these amounts' : 'Kept aside for this plan'}</span><strong>${money(e.ready ? e.leftCents : next.essentials.reduce((sum,r)=>sum+r.amountCents,0)+next.cushionCents)}</strong>${e.ready && e.leftCents<0 ? '<small>Your expected costs are higher than your available money. Check the amounts before continuing.</small>' : ''}`;
            box.classList.toggle('reserve-shortfall',e.ready && e.leftCents<0);
        } catch (_) { box.innerHTML = '<span>Enter each amount to see what’s left.</span>'; }
    }
    function collectReserves(form, next, keepCurrentPeriod = false) {
        const preservePeriod=keepCurrentPeriod&&next.setup.completed&&next.reservesConfirmed;
        const rows = next.essentials.length ? next.essentials : [{ id: 'food', name: 'Food & groceries', category: 'Food' }, { id: 'transport', name: 'Transport', category: 'Transport' }, { id: 'fun', name: 'Entertainment', category: 'Entertainment' }];
        next.essentials = rows.map((r, i) => ({ ...r, amountCents: readCents(form.get('essential-' + i)) }));
        next.cushionCents = readCents(form.get('cushion')); applyReserveReview(next); delete next.setup.reserveDraft; next.reservesConfirmed = true;if(!preservePeriod){next.periodStartedOn=flowToday();next.reservePeriodKey=makeRecordId([]);}
    }
    let setupDraftTimer,setupRenderedOn,setupPreviewStamp,setupDraftSaved=false;
    function rememberSetupDraft() {
        if(!setup||!p||owner!==flowStorage.getItem('flow_user_id')||pageBase!==flowStorage.getItem('flowPlanning'))return;
        const form=setup.querySelector('form');if(!form)return;setupDraftSaved=false;
        try{flowSetupDraft(flowStorage,owner,pageBase,p.setup.step,[...new FormData(form)],flowToday());setupDraftSaved=true;const status=setup.querySelector('[data-setup-draft-status]');if(status)status.textContent='Progress saved';}
        catch(_){const status=setup.querySelector('[data-setup-draft-status]');if(status)status.textContent='Keep this screen open to finish';}
    }
    function restoreSetupDraft(form) {
        const values=flowSetupDraft(flowStorage,owner,pageBase,p.setup.step,undefined,flowToday());if(!values)return;
        const map=new Map();for(const [name,value]of values){if(!map.has(name))map.set(name,[]);map.get(name).push(value);}
        for(const input of form.elements){if(!input.name||input.type==='submit'||input.name==='setupChecked')continue;if(input.type==='checkbox')input.checked=(map.get(input.name)||[]).includes(input.value);else if(map.has(input.name))input.value=map.get(input.name)[0];}
    }
    function setupMoneyFields() {
        const draft=clone(),cash=accounts.filter(supported);
        if(!draft.selectedAccountIds.length&&!draft.manualBalance&&cash.length===1)draft.selectedAccountIds=[cash[0].id];
        const selected=draft.selectedAccountIds;
        const suggestion=!p.payday.nextDate&&flowPaydaySuggestion(transactions,accounts,selected);
        const choices=accounts.length?accounts.map(a=>`<label class="choice"><input type="checkbox" name="account" value="${esc(a.id)}" ${selected.includes(a.id)?'checked':''} ${supported(a)?'':'disabled'}><div><strong>${esc(a.name)}</strong><small>${supported(a)?'Spending account':'Available USD balance needed'}</small></div><strong data-setup-account-amount="${esc(a.id)}">${supported(a)?money(a.availableCents):'—'}</strong></label>`).join(''):'';
        return `<div class="setup-heading"><h2>Let’s start with your money</h2><p>Choose your accounts and next payday.</p></div><section class="starter-money"><h3>Where do you spend from?</h3>${choices||'<p class="detail-help">Connect your bank, or start with a balance you confirm.</p>'}<div class="heading-actions"><a class="inline-link" href="account.html#bank-connections">${cash.length?'Manage banks':'Connect my bank'}</a>${cash.length?button('Check balances','refresh-accounts','inline-link'):''}</div><details class="manual-balance-details" ${p.manualBalance||!cash.length?'open':''}><summary>${cash.length?'Use a balance I confirm':'Start without connecting a bank'}</summary><label class="toggle-label"><input type="checkbox" name="useManual" ${p.manualBalance||!cash.length?'checked':''}>Use the available balance I enter</label>${amountField('Full available balance today','manualBalance',p.manualBalance?.date===flowToday()?p.manualBalance.cents:null,'data-optional-amount')}<small>Use the total you can spend, not just your paycheck. Confirm again on a new day.</small></details></section><section class="starter-payday"><h3>When is your next payday?</h3><div class="stack">${field('Next payday or planning end date','payday',p.payday.nextDate||suggestion?.date||'','date',`required min="${addPlanDays(flowToday(),1)}" max="${addPlanDays(flowToday(),366)}"`)}${selectFrequency('frequency',suggestion?.frequency||p.payday.frequency||'biweekly')}</div>${suggestion?'<p class="detail-help">Suggested from recent paychecks. Please check the date.</p>':''}<details class="setup-extra"><summary>No regular payday?</summary><p>Choose a date for this plan to end and select “No regular payday.” Future income is never added automatically.</p></details></section>`;
    }
    function refreshSetupBankPreview() {
        if(!setup)return;accounts=loadBankAccounts();transactions=loadTransactions();
        if(flowSetupStage(p.setup.step)===0){for(const value of setup.querySelectorAll('[data-setup-account-amount]')){const a=accounts.find(a=>a.id===value.dataset.setupAccountAmount);value.textContent=a&&supported(a)?money(a.availableCents):'Unavailable';const checkbox=value.closest('label').querySelector('input');checkbox.disabled=!a||!supported(a);}return;}
        if(flowSetupStage(p.setup.step)===2){updateSetupReservePreview();const confirm=setup.querySelector('[name=setupChecked]');if(confirm)confirm.checked=false;}
    }
    function renderSetup() {
        if(!setup)return;setupRenderedOn=flowToday();setupDraftSaved=false;const step=p.setup.step,stage=flowSetupStage(step);let body='';
        if(stage===0)body=setupMoneyFields();
        if(stage===1)body=`<div class="setup-heading"><h2>Anything due before ${date(p.payday.nextDate)}?</h2><p>Add anything you expect to pay.</p></div><div class="plain-list">${p.bills.map(b=>`<div class="row-between"><div><strong class="setting-title">${esc(b.name)}</strong><p>${date(b.nextDate)} · ${money(b.amountCents)}</p></div>${button('Edit','bill','back-button',`data-id="${esc(b.id)}"`)}</div>`).join('')||'<div class="setup-empty-bills">'+icon('calendar-check')+'<strong>No bills added yet</strong><span>Nothing due? Continue to everyday spending.</span></div>'}</div><div class="suggested-bills">${suggestionMarkup()}</div>${button('Add a bill','bill','back-button')}`;
        if(stage===2){const suggestion=flowStarterReserves(p,transactions,accounts);body=`<div class="setup-heading"><h2>What should we keep aside?</h2><p>Review these amounts for ${planDays(flowToday(),p.payday.nextDate)} days. Tap any amount to change it.</p></div>${reserveSuggestionMarkup(suggestion)}<div class="reserve-choices">${reserveFields(p.essentials,true)}</div><div id="reserve-preview" class="reserve-preview" role="status" aria-live="polite"></div>${button('Use suggested amounts','reserve-suggestions','inline-link')}${reserveGuideNote(suggestion)}<details class="setup-extra"><summary>What does the amount left mean?</summary><p>It is extra money after bills, everyday set-asides, your cushion and any existing goal or card reserves. Food and transport set-asides are still there to use.</p></details>`;}
        setup.innerHTML=`<div class="setup-wrap setup-simple"><header class="setup-simple-header"><div><p class="small-label">${['Your money','Upcoming bills','Everyday spending'][stage]} · ${stage+1} of 3</p><span class="setup-draft-status" data-setup-draft-status>Each step is saved</span></div>${button('Close','save-close','inline-link')}</header><div class="setup-progress" aria-label="Step ${stage+1} of 3">${[0,1,2].map(i=>`<span class="${i<=stage?'active':''}"></span>`).join('')}</div><section class="card setup-card"><form id="setup-form">${body}<p class="form-message" role="alert"></p><div class="setup-footer">${stage?button('Back','setup-back','back-button'):'<span class="optional">You can change this later.</span>'}<button type="submit" class="save-button">${stage===2?(p.setup.completed?'Save plan changes':'Start my plan'):stage===1?'These are my bills':'Continue'} ${icon('arrow-right')}</button></div></form></section></div>`;
        const form=setup.querySelector('form'),optional=form.querySelector('[data-optional-amount]');if(optional){optional.required=false;optional.removeAttribute('min');}
        restoreSetupDraft(form);
        const changed=()=>{setupDirty=true;clearTimeout(setupDraftTimer);setupDraftTimer=setTimeout(rememberSetupDraft,200);};
        form.addEventListener('input',changed);form.addEventListener('change',changed);
        form.addEventListener('submit',event=>{event.preventDefault();advanceSetup(event.currentTarget,'next');});
        if(stage===2){updateSetupReservePreview();form.addEventListener('input',()=>{updateSetupReservePreview();});}
        setupDirty=Boolean(flowSetupDraft(flowStorage,owner,pageBase,step,undefined,flowToday()));
    }
    function advanceSetup(form,direction) {
        try{
            clearTimeout(setupDraftTimer);rememberSetupDraft();
            if(direction==='close'){setupDirty=false;location.href='index.html';return;}
            if(direction==='next'&&!form.reportValidity())return;
            if(direction==='next'&&setupRenderedOn!==flowToday())throw new Error('A new day started. Close and reopen setup to confirm today’s money.');
            if(direction==='next'&&flowSetupStage(p.setup.step)===2&&setupPreviewStamp!==JSON.stringify([flowStorage.getItem('bankAccounts'),flowStorage.getItem('transactions')])){updateSetupReservePreview();throw new Error('New activity arrived. Check the updated estimate and confirm again.');}
            let next=clone();const values=new FormData(form),stage=flowSetupStage(p.setup.step);
            if(stage===0&&direction==='next')next=flowSetupMoney(next,{selectedAccountIds:values.getAll('account').map(String),useManual:Boolean(values.get('useManual')),balanceCents:values.get('useManual')?readCents(values.get('manualBalance'),true):null,nextDate:String(values.get('payday')||''),frequency:String(values.get('frequency'))},accounts);
            if(stage===1&&direction==='next')next.billsConfirmed=true;
            if(stage===2){if(direction==='next')collectReserves(values,next,true);else next.setup.reserveDraft=Object.fromEntries([...values].filter(([key])=>key.startsWith('essential-')||key==='cushion').map(([key,value])=>[key,String(value)]));}
            if(stage===2&&direction==='next'){
                // The explicit Start/Save button confirms this preview; stale-data checks still apply.
                const e=paydayEstimate({...next,setup:{...next.setup,completed:true}},loadBankAccounts(),loadTransactions());
                if(!e.ready)throw new Error(e.missing.join(' · ')+'. Use Back to check these details.');
                next.setup.completed=true;next.setup.step=5;
            }else next.setup.step=direction==='back'?flowSetupPrevious(p.setup.step):flowSetupNext(p.setup.step);
            persist(next);flowSetupDraft(flowStorage,owner,pageBase,p.setup.step,null);setupDirty=false;
            if(stage===2&&direction==='next')location.href='index.html';else render();
        }catch(error){form.querySelector('.form-message').textContent=error.message||'Could not save. Your earlier plan is kept.';}
    }
    function editBill(id, suggested) {
        const b = p.bills.find(bill => bill.id === id);
        const tracked = b && billState().bills.find(row => row.id === b.id);
        const initial = b ? { ...b, nextDate: tracked.next?.dueDate || b.nextDate, amountCents: tracked.next?.amountCents || billAmountAt(b, flowToday()) } : suggested;
        const sources = new Map();
        for (const t of billBankTransactions(transactions, flowToday()).sort((a, b) => b.date.localeCompare(a.date))) {
            const account = billCashAccount(t, accounts) || (typeof flowFundedCardPurchase === 'function' && flowFundedCardPurchase(t,p,accounts) ? flowCardAccount(t,accounts) : null);
            if (t.type !== 'Expense' || t.amount >= 0 || t.status === 'pending' || !account) continue;
            if (!sources.has(billSourceKey(t))) sources.set(billSourceKey(t), { merchant: billName(t.name), bankConnectionId: t.bankConnectionId, accountId: t.accountId, currency: 'USD', label: t.name + ' · ' + account.name });
        }
        const initialTracking = initial?.tracking;
        if (initialTracking && !sources.has(billTrackingKey(initialTracking))) sources.set(billTrackingKey(initialTracking), { ...initialTracking, label: initial?.name + ' · saved account' });
        const selectedSource = initialTracking ? billTrackingKey(initialTracking) : '';
        const matching = `<label class="field">Recognize future payments<select name="billSource"><option value="">I’ll mark payments myself</option>${[...sources].map(([key, source]) => `<option value="${esc(key)}" ${key === selectedSource ? 'selected' : ''}>${esc(source.label)}</option>`).join('')}</select></label><p class="detail-help">Matching uses this exact payment name and bank account. You can change any match later.</p>`;
        showModal(b ? 'Edit bill' : 'Confirm a bill', `<div class="stack">${field('Name', 'name', initial?.name || '', 'text', 'required maxlength="200"')}${amountField('Usual amount', 'amount', initial?.amountCents ?? null)}${field('Next unpaid due date', 'date', initial?.nextDate || '', 'date', 'required')}${selectFrequency('frequency', initial?.frequency || 'monthly', true)}${field('End date · optional', 'endDate', b?.endDate || '', 'date')}<label class="toggle-label"><input type="checkbox" name="variable" ${b?.variable ? 'checked' : ''}>Amount varies</label>${amountField('Maximum amount to reserve when variable', 'ceiling', b?.ceilingCents ?? initial?.amountCents ?? 0)}${matching}</div>${suggested ? `<p class="bill-match-evidence">${suggested.sampleCount} similar payments · last ${date(suggested.lastDate)} · ${esc(suggested.accountName)}. Confirm the actual next unpaid date.</p>` : ''}${b ? `<div class="bill-actions">${button('Payment is already reflected in my balance', 'bill-paid', 'inline-link', `data-id="${esc(b.id)}" data-date="${esc(tracked.next?.dueDate || b.nextDate)}"`)}${button('Remove this bill', 'bill-delete', 'inline-link', `data-id="${esc(b.id)}"`)}</div>` : ''}`, (values, next) => {
            const amount = readCents(values.get('amount')); if (amount <= 0) throw new Error('Enter an amount greater than zero.');
            const date = String(values.get('date')); if (!validPlanDate(date)) throw new Error('Choose a valid due date.');
            const value = { ...(b || {}), id: b?.id || makeRecordId(next.bills), name: String(values.get('name')).trim(), amountCents: amount,
                nextDate: date, anchorDay: initial?.anchorDay && initial.nextDate === date ? initial.anchorDay : Number(date.slice(-2)), frequency: String(values.get('frequency')), amountChanges: [] };
            value.endDate = String(values.get('endDate') || ''); value.variable = Boolean(values.get('variable')); value.ceilingCents = value.variable ? readCents(values.get('ceiling')) : amount;
            if (value.variable && value.ceilingCents < amount) throw new Error('The variable reserve must cover the usual amount.');
            if (!value.name) throw new Error('Enter a bill name.');
            const source = sources.get(String(values.get('billSource') || ''));
            if (source) value.tracking = { merchant: source.merchant, bankConnectionId: source.bankConnectionId, accountId: source.accountId, currency: 'USD' }; else delete value.tracking;
            // Keep known bill-payment identities when the next unpaid date is rebased.
            // They remain separate from the everyday essential allowances.
            const history = new Map((b?.paymentHistory || []).map(h => [h.transactionKey, h]));
            for (const row of tracked?.occurrences || []) if (row.paid && row.payment) history.set(billPaymentKey(row.payment), { transactionKey: billPaymentKey(row.payment), fingerprint: billFingerprint(row.payment), dueDate: row.dueDate });
            if (history.size) value.paymentHistory = [...history.values()];
            const index = next.bills.findIndex(row => row.id === b?.id);
            const oldEstimate = typeof flowFeatures === 'function' ? paydayEstimate(p,accounts,transactions) : null;
            if (index >= 0) next.bills[index] = value; else next.bills.push(value);
            if (b && next.features) for (const goal of next.features.goals.filter(g=>g.billId===b.id)) {
                const actual=oldEstimate.goals.find(g=>g.id===goal.id);
                if(actual)goal.reservedCents=actual.remainingCents;
                goal.coveredBillPayments=flowBillPaymentCoverage(next,getBillTrackingState(next,accounts,transactions).rows,accounts);
            }
            if (suggested) next.dismissedBillSuggestions = (next.dismissedBillSuggestions || []).filter(d => d.key !== suggested.key);
        }, b ? 'Save changes' : 'Add to my bills');
    }
    function checkInAccountStamp() {
        const rows = loadBankAccounts();
        return JSON.stringify(p.selectedAccountIds.map(id => rows.find(a => a.id === id) || null));
    }
    function checkInChoices() {
        return { nextDate: checkIn.nextDate, frequency: checkIn.frequency, balanceMode: checkIn.balanceMode, receivedPay: checkIn.receivedPay,
            balanceCents: checkIn.balanceMode === 'manual' ? readCents(checkIn.balance, true) : null,
            essentialAmounts: checkIn.amounts.map(value => readCents(value)), cushionCents: readCents(checkIn.cushion) };
    }
    function checkInEstimate() {
        const next = preparePaydayCheckIn(p, checkInChoices());applyReserveReview(next);
        return paydayEstimate(next, loadBankAccounts(), loadTransactions());
    }
    function applyCheckInSuggestions() {
        const draft = clone();draft.payday.nextDate=checkIn.nextDate;draft.manualBalance=checkIn.balanceMode==='manual'?{cents:readCents(checkIn.balance,true),date:flowToday()}:null;
        const suggestion=flowStarterReserves(draft,loadTransactions(),loadBankAccounts(),flowToday(),Date.now(),reserveReview||{});
        if (!suggestion) return;
        checkIn.suggestion=suggestion;checkIn.amounts=suggestion.entries.map(e=>(e.amountCents/100).toFixed(2));
        checkIn.cushion=(suggestion.cushionCents/100).toFixed(2);checkIn.reservesEdited=false;
    }
    function startPaydayCheckIn(receivedPay = false) {
        reserveReview=null;load();
        if (receivedPay && p.lastPaydayCheckIn?.receivedOn === flowToday()) throw new Error('Already marked paid today. You can edit your plan in Plan.');
        if (!(paydayCheckInAvailable(p) || receivedPay && p.setup.completed && validPlanDate(p.payday.nextDate))) throw new Error('Your current plan is still running. You can edit its date and amounts in Plan.');
        checkIn = { step: 0, receivedPay, base: pageBase, startedOn: flowToday(), nextDate: suggestNextPayday(p,flowToday(),Date.now(),receivedPay), frequency: p.payday.frequency,
            balanceMode: p.selectedAccountIds.length ? 'bank' : 'manual', bankCheck:'idle',
            balance: p.manualBalance?.date === flowToday() ? (p.manualBalance.cents / 100).toFixed(2) : '',
            amounts: p.essentials.map(e => (e.amountCents / 100).toFixed(2)), cushion: (p.cushionCents / 100).toFixed(2), accountStamp: '' };
        renderPaydayCheckIn();
    }
    function selectedMoneyStamp() {
        return JSON.stringify(loadBankAccounts().filter(a=>p.selectedAccountIds.includes(a.id)).map(a=>[a.id,a.availableCents,a.currentCents,a.currency]).sort((a,b)=>a[0].localeCompare(b[0])));
    }
    function renderCheckInBankStatus() {
        const box=dialog.querySelector('#checkin-bank-status');if(!box||!checkIn)return;
        const stamp=selectedMoneyStamp();if(checkIn.shownMoneyStamp&&checkIn.shownMoneyStamp!==stamp){if(checkIn.bankCheck!=='checking')checkIn.bankCheck='changed';if(checkIn.balanceMode==='bank'){const confirm=dialog.querySelector('[name=moneyChecked]');if(confirm)confirm.checked=false;}}checkIn.shownMoneyStamp=stamp;
        const chosen=loadBankAccounts().filter(a=>p.selectedAccountIds.includes(a.id)),complete=chosen.length===p.selectedAccountIds.length&&chosen.length>0&&chosen.every(supported);
        const total=complete?chosen.reduce((sum,a)=>sum+a.availableCents,0):null;
        const label=checkIn.bankCheck==='checking'?'Checking for updates…':checkIn.bankCheck==='changed'?'A different balance arrived':checkIn.bankCheck==='same'?'No different balance returned':checkIn.bankCheck==='unavailable'?'Update check unavailable':'Selected spending accounts';
        box.innerHTML=`<section class="payday-bank-card"><div class="payday-bank-caption">${icon(checkIn.bankCheck==='checking'?'loader-circle':'landmark')}<span role="status">${label}</span></div><strong class="payday-bank-total">${total===null?'Balance needed':money(total)}</strong><span class="payday-bank-subtitle">${total===null?'Choose a confirmed balance below':'Available in your connected accounts'}</span>${chosen.length?`<details><summary>${chosen.length} ${chosen.length===1?'account':'accounts'} ${icon('chevron-down')}</summary>${chosen.map(a=>`<div><span>${esc(a.name)}</span><strong>${supported(a)?money(a.availableCents):'Unavailable'}</strong></div>`).join('')}</details>`:''}</section>${['same','changed'].includes(checkIn.bankCheck)?'<p class="payday-bank-note">This is the balance returned by your bank feed. A completed check does not confirm that your pay is included.</p>':''}${p.selectedAccountIds.length?button(checkIn.bankCheck==='checking'?'Checking…':'Check again','checkin-refresh','inline-link',checkIn.bankCheck==='checking'?'disabled':''):''}`;
        icons();
    }
    async function checkPaydayBank() {
        const draft=checkIn;if(!draft||draft.step!==1||draft.bankCheck==='checking')return;
        draft.bankCheck='checking';const before=selectedMoneyStamp();renderCheckInBankStatus();
        let result,timer;
        try {
            const work=(async()=>{
                // These are existing free cached endpoints, not a paid institution refresh.
                if(window.updateBanksAutomatically) await window.updateBanksAutomatically({force:true});
                return window.refreshFlowAccounts?await window.refreshFlowAccounts(true):{status:'unavailable'};
            })().catch(()=>({status:'unavailable'}));
            result=await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'unavailable'}),20000);})]);
        } finally {clearTimeout(timer);}
        if(checkIn!==draft||owner!==flowStorage.getItem('flow_user_id')||draft.base!==flowStorage.getItem('flowPlanning')||draft.startedOn!==flowToday()||!dialog.open)return;
        const changed=before!==selectedMoneyStamp();
        draft.bankCheck=result?.status==='checked'?(changed?'changed':'same'):'unavailable';
        if(draft.step!==1)return;
        if(changed){const confirm=dialog.querySelector('[name=moneyChecked]');if(confirm&&draft.balanceMode==='bank')confirm.checked=false;}
        renderCheckInBankStatus();
    }
    function renderPaydayCheckIn() {
        const step = checkIn.step;
        let body;
        if (step === 0) body = `<p class="detail-help">When is your next payday? This date comes from your usual schedule.</p><div class="stack">${field('Next payday or planning end date', 'nextDate', checkIn.nextDate, 'date', `required min="${addPlanDays(flowToday(), 1)}" max="${addPlanDays(flowToday(), 366)}"`)}${selectFrequency('frequency', checkIn.frequency)}</div><p class="detail-help">No regular payday? Choose a date for this plan to end.</p>`;
        if (step === 1) {
            body = `<p class="detail-help">${checkIn.receivedPay?'Use your full available balance, including your pay.':'Start with the money available today.'}</p><div id="checkin-bank-status"></div><div class="stack checkin-money-fields"><label class="field">Use for this plan<select name="balanceMode"><option value="bank" ${checkIn.balanceMode === 'bank' ? 'selected' : ''} ${!p.selectedAccountIds.length ? 'disabled' : ''}>Connected bank accounts</option><option value="manual" ${checkIn.balanceMode === 'manual' ? 'selected' : ''}>Balance I confirm</option></select></label><div id="checkin-manual" ${checkIn.balanceMode === 'manual' ? '' : 'hidden'}>${field('Full available balance today', 'checkinBalance', checkIn.balance, 'number', `step="0.01" ${checkIn.balanceMode === 'manual' ? 'required' : 'disabled'}`)}<small>Use the available balance in your bank, not just your paycheck.</small></div><label class="toggle-label"><input type="checkbox" name="moneyChecked" required>${checkIn.receivedPay?'My pay is included in this balance.':'This is the available money I can use today.'}</label></div><details class="setup-extra"><summary>Pay is in my bank but missing here</summary><p>Your bank can show a deposit before its feed sends it to Flow. Flow checks automatically; checking again cannot force a newer bank balance.</p><p>Wait for the feed, or choose “Balance I confirm” above to use your bank’s full available balance now. Don’t add the paycheck a second time.</p></details>`;
        }
        if (step === 2) body = `<p class="detail-help">Until ${date(checkIn.nextDate)} · ${planDays(flowToday(),checkIn.nextDate)} days. Tap an amount to adjust it.</p><div class="reserve-choices">${p.essentials.map((e,i)=>reserveInput(e,'checkinEssential-'+i,checkIn.amounts[i],checkIn.suggestion?.entries[i]?.amountCents,checkIn.suggestion?.history?.rows.find(r=>r.category===e.category))).join('')}${reserveInput({name:'Safety cushion',category:'Cushion'},'checkinCushion',checkIn.cushion,checkIn.suggestion?.cushionCents)}</div>${button('Use suggested amounts','checkin-suggestions','inline-link')}${reserveGuideNote(checkIn.suggestion)}<div id="checkin-preview" class="checkin-preview"></div><details class="setup-extra"><summary>Your bills carry forward</summary><p>Unpaid bills stay in your plan. You can check them before starting.</p>${button('See bills','checkin-bills','inline-link')}</details>`;
        showModal(checkIn.receivedPay ? 'I got paid' : 'A quick payday check-in', `<p class="small-label">${['Next payday', 'Available money', 'Your new plan'][step]} · ${step + 1} of 3</p><div class="setup-progress" aria-label="Step ${step + 1} of 3">${[0, 1, 2].map(i => `<span class="${i <= step ? 'active' : ''}"></span>`).join('')}</div><form id="payday-checkin-form">${body}<p class="form-message" role="alert"></p><div class="setup-footer">${step ? button('Back', 'checkin-back', 'back-button') : '<span class="optional">Nothing changes until you finish.</span>'}<button type="submit" class="save-button">${step === 2 ? checkIn.receivedPay ? 'Mark paid & start plan' : 'Start new plan' : 'Continue'}</button></div></form>`);
        const form = dialog.querySelector('#payday-checkin-form');
        dialog.scrollTop = 0;
        const title = dialog.querySelector('#payday-dialog-title');
        title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true });
        form.addEventListener('submit', event => { event.preventDefault(); advancePaydayCheckIn(); });
        if (step === 1) form.querySelector('[name=balanceMode]').addEventListener('change', event => {
            checkIn.balanceMode = event.target.value;
            const manual = checkIn.balanceMode === 'manual', input = form.querySelector('[name=checkinBalance]');
            form.querySelector('#checkin-manual').hidden = !manual; input.disabled = !manual; input.required = manual;
            form.querySelector('[name=moneyChecked]').checked = false;
        });
        if (step === 1) { renderCheckInBankStatus(); if(checkIn.bankCheck==='idle' && p.selectedAccountIds.length) void checkPaydayBank(); }
        if (step === 2) {
            form.addEventListener('input', event => {
                if (event.target.name === 'planChecked') return;
                checkIn.reservesEdited=true;

                updateCheckInPreview();
            });
            updateCheckInPreview();
        }
    }
    function rememberCheckInFields() {
        const values = new FormData(dialog.querySelector('#payday-checkin-form'));
        if (checkIn.step === 0) { checkIn.nextDate = String(values.get('nextDate') || ''); checkIn.frequency = String(values.get('frequency') || ''); }
        if (checkIn.step === 1) { checkIn.balanceMode = String(values.get('balanceMode')); const input = dialog.querySelector('[name=checkinBalance]'); checkIn.balance = input.value; }
        if (checkIn.step === 2) { checkIn.amounts = p.essentials.map((_, i) => String(values.get('checkinEssential-' + i))); checkIn.cushion = String(values.get('checkinCushion')); }
        return values;
    }
    function updateCheckInPreview() {
        try {
            rememberCheckInFields();
            const e = checkInEstimate();
            checkIn.previewStamp = JSON.stringify([flowStorage.getItem('bankAccounts'), flowStorage.getItem('transactions')]);
            const costs=[['Unpaid bills',e.billsCents],['Everyday spending',e.essentialsCents],['Safety cushion',e.cushionCents],['Savings goals',e.goalsCents||0],['Card payments',e.cardsCents||0],['Recent purchases',e.adjustmentsCents||0]].filter(([,value])=>value);
            dialog.querySelector('#checkin-preview').innerHTML=`<div class="reserve-preview ${e.leftCents<0?'reserve-shortfall':''}"><span>${e.leftCents<0?'Estimated shortfall':'Left after your planned costs'}</span><strong>${e.ready?money(e.leftCents):'Check details'}</strong></div><details class="setup-extra"><summary>See the calculation</summary><div class="breakdown"><div><span>Available money</span><strong>${money(e.balanceCents)}</strong></div>${costs.map(([label,value])=>`<div><span>${label}</span><strong>−${money(value)}</strong></div>`).join('')}</div></details>${e.ready?'':`<p class="detail-help" role="status">${esc(e.missing.join(' · '))}.</p>`}`;

        } catch (_) { dialog.querySelector('#checkin-preview').innerHTML = '<p class="detail-help">Enter each amount to preview your new plan. Enter 0 for anything you do not need.</p>'; }
    }
    function advancePaydayCheckIn() {
        const form = dialog.querySelector('#payday-checkin-form');
        if (!form.reportValidity()) return;
        try {
            if (owner !== flowStorage.getItem('flow_user_id') || checkIn.base !== flowStorage.getItem('flowPlanning')) throw new Error('Your account or plan changed. Close and reopen this check-in before saving.');
            if (checkIn.startedOn !== flowToday()) throw new Error('A new day started. Close and reopen the check-in to confirm today’s available money.');
            const values = rememberCheckInFields();
            if (checkIn.step === 0) {
                if (!validPlanDate(checkIn.nextDate) || checkIn.nextDate <= flowToday() || planDays(flowToday(), checkIn.nextDate) > 366) throw new Error('Choose a future payday or planning date within the next year.');
            } else if (checkIn.step === 1) {
                if (checkIn.balanceMode==='bank' && checkIn.bankCheck==='checking') throw new Error('Finishing the bank check. Your amounts are kept.');
                if (!values.get('moneyChecked')) throw new Error('Check your available money first.');
                const e = checkInEstimate(), missing = e.missing.filter(value => /balance|account/i.test(value));
                if (missing.length) throw new Error(missing.join(' · ') + '. Enter your available balance if needed.');
                checkIn.accountStamp = checkIn.balanceMode === 'bank' ? checkInAccountStamp() : '';
            } else {
                // Starting the plan is the confirmation; no duplicate checkbox is needed.
                if (checkIn.balanceMode === 'bank' && checkIn.accountStamp !== checkInAccountStamp()) throw new Error('Your bank balances changed during the check-in. Go Back and check the updated available money.');
                if (checkIn.previewStamp !== JSON.stringify([flowStorage.getItem('bankAccounts'), flowStorage.getItem('transactions')])) {
                    updateCheckInPreview();
                    throw new Error('New activity arrived. Check the updated estimate and confirm your plan again.');
                }
                const next = preparePaydayCheckIn(p, checkInChoices());applyReserveReview(next);
                const e = paydayEstimate(next, loadBankAccounts(), loadTransactions());
                if (!e.ready) throw new Error('Before starting: ' + e.missing.join(' · ') + '.');
                const paid=checkIn.receivedPay;persist(next, checkIn.base); dialog.close(); render(); notify(paid?'Marked paid. Your next payday plan is ready.':'Your new plan is saved. Bills carried forward and everyday set-asides restarted today.'); return;
            }
            if (checkIn.step === 1 && !checkIn.reservesEdited) applyCheckInSuggestions();
            checkIn.step++; renderPaydayCheckIn();
        } catch (error) { form.querySelector('.form-message').textContent = error.message || 'Could not start the new plan. Your previous plan is still saved.'; }
    }
    function renderSettings() {
        if (!settings) return;
        settings.innerHTML = `<section class="card account-card"><div class="plain-list"><div class="row-between"><strong class="setting-title">Setup guide</strong><a href="setup.html" class="back-button">${p.setup.completed ? 'Revisit' : 'Open'}</a></div><div class="row-between"><strong class="setting-title">How your estimate works</strong>${button(icon('chevron-right'), 'breakdown', 'icon-button', 'aria-label="Explain payday amount"')}</div><div class="row-between"><strong class="setting-title">Spending accounts</strong>${button('Manage', 'accounts', 'back-button')}</div></div></section><section class="card account-card">${header('', 'Preferences')}<label class="toggle-label"><input type="checkbox" data-plan-preference="billReminders" ${p.preferences.billReminders ? 'checked' : ''}>Bill reminders in Flow</label><label class="toggle-label"><input type="checkbox" data-plan-preference="autoCategories" ${p.preferences.autoCategories ? 'checked' : ''}>Automatic categories</label><p class="detail-help">Reliable matches only. You can edit any payment.</p></section>`;
    }
    function render() { if (setup && setupDirty) return; try { load(); renderedCheckInDue=paydayCheckInDue(p); renderHome(); renderPlan(); renderBills(); renderSettings(); if (setup && !setupDirty) renderSetup(); icons(); document.dispatchEvent(new Event('flow-payday-rendered')); } catch (error) { notify(error.message); } }
    document.addEventListener('click', event => {
        const target = event.target.closest('[data-plan-action]'); if (!target) return;
        const action = target.dataset.planAction;
        if (!dialog.open) modalInvoker = window.FlowApp?.describeControl(target);
        try {
            if (action === 'close') return dialog.close();
            if (action === 'home-slide') {
                const current = homeSlides.findIndex(slide => slide.key === homeSlideKey);
                const next = target.dataset.key ? homeSlides.findIndex(slide => slide.key === target.dataset.key) : current + Number(target.dataset.step);
                homeCarousel?.go(next);
                return;
            }
            if (action === 'home-tasks') return showModal('Your next steps', '<div class="home-task-list">' + homeTasks(estimate()).map(task => homeTask(task)).join('') + '</div>');
            if (action === 'home-changes') return showModal('What changed in your plan', '<div class="breakdown">' + homeChanges.map(c => '<div><span>' + esc(c.label) + '</span><strong>' + (c.deltaCents >= 0 ? '+' : '') + money(c.deltaCents) + '</strong></div>').join('') + '</div><p class="detail-help">Changes to saved plan inputs, not a claim that every bank payment has arrived or been reconciled.</p>');
            if(action==='home-source') {showModal('Your spending money','<div id="source-status-panel"></div>');renderSourceSheet();return;}
            if(action==='source-check') {void checkSourceSheet(target);return;}

            if (action === 'transaction') return window.FlowTransactionDetails.open(target.dataset.id);
            if (action === 'setup-back' || action === 'save-close') return advanceSetup(setup.querySelector('form'), action === 'setup-back' ? 'back' : 'close');
            if (setupDirty && ['bill', 'suggested-bill'].includes(action)) { notify('Continue or save this step before opening another decision.'); return; }
            if (action === 'reserve-evidence') return openEvidence(target);
            if (action === 'reserve-suggestions') {
                const suggestion=flowStarterReserves(p,transactions,accounts,flowToday(),Date.now(),reserveReview||{});if(!suggestion)return;
                for (const [i,row] of suggestion.entries.entries()) setup.querySelector('[name=essential-'+i+']').value=(row.amountCents/100).toFixed(2);
                setup.querySelector('[name=cushion]').value=(suggestion.cushionCents/100).toFixed(2);
                setupDirty=true;setup.querySelector('[name=cushion]').dispatchEvent(new Event('input',{bubbles:true}));return;
            }
            if (action === 'checkin-suggestions' && checkIn) {
                applyCheckInSuggestions();renderPaydayCheckIn();return;
            }
            if (action === 'breakdown') return showModal('How your estimate works', breakdown(estimate()));
            if (action === 'essential') {
                const reserve = p.essentials.find(r => r.id === target.dataset.id);
                if (!reserve) throw new Error('This set-aside changed. Reload to see your plan.');
                return showModal('Set aside for ' + reserve.name, amountField('Total for this reserve period', 'amount', reserve.amountCents) + '<p class="detail-help">What you already spent in this reserve period still counts. Your other set-asides and the period start date stay the same.</p>', (values, next) => {
                    const current = next.essentials.find(r => r.id === reserve.id);
                    if (!current) throw new Error('This set-aside changed. Reload to see your plan.');
                    current.amountCents = readCents(values.get('amount'));
                }, 'Update plan');
            }
            if (action === 'cushion') return showModal('Your cushion', amountField('Amount to leave untouched', 'amount', p.cushionCents) + '<p class="detail-help">This stays outside your flexible spending estimate.</p>', (values, next) => { next.cushionCents = readCents(values.get('amount')); }, 'Update cushion');
            if(action==='refresh-accounts'){
                if(setup)rememberSetupDraft();const base=pageBase;target.disabled=true;notify('Checking for bank updates…');
                return Promise.resolve(window.refreshFlowAccounts?.(true)).then(result=>{if(owner!==flowStorage.getItem('flow_user_id')||base!==flowStorage.getItem('flowPlanning'))return;if(setup){accounts=loadBankAccounts();renderSetup();icons();}else render();notify(result?.status==='checked'?'Check finished. Confirm your pay is included before starting a new plan.':'Update check unavailable. Your last known balance is kept.');}).catch(()=>{if(target.isConnected)target.disabled=false;notify('Could not check now. Your draft is kept.');});
            }
            if (action === 'balance') return showModal('Confirm your available balance', amountField('Available spending money today', 'balance', p.manualBalance?.cents) + '<p class="detail-help">Use the available amount in your bank. This replaces bank balances in your payday estimate until you select accounts again.</p>', (values, next) => { next.manualBalance = { cents: readCents(values.get('balance'), true), date: flowToday() }; });
            if (action === 'accounts') return showModal('Your spending money', `${accountsMarkup() || '<p class="detail-help">No cached account balances available. Sync your bank from Account or enter your available balance manually.</p>'}<p class="detail-help">Only supported USD cash balances can be selected. Cached balances may be older than their retrieval time.</p>${button('Enter available balance', 'balance', 'back-button', 'style="margin-top:12px"')}`, (values, next) => {
                const ids = values.getAll('account').map(String);
                if (!ids.length) throw new Error('Choose a cash account, or enter an available balance manually.');
                next.selectedAccountIds = ids; next.manualBalance = null;
            }, 'Use selected accounts');
            if (action === 'payday-received') return startPaydayCheckIn(true);
            if (action === 'payday-checkin' || action === 'payday' && paydayCheckInDue(p)) return startPaydayCheckIn();
            if (action === 'checkin-back' && checkIn) { rememberCheckInFields(); checkIn.step--; renderPaydayCheckIn(); return; }
            if (action === 'checkin-bills' && checkIn) { dialog.close(); location.href = 'bills.html#bill-tracking'; return; }
            if (action === 'checkin-refresh' && checkIn) { void checkPaydayBank(); return; }
            if (action === 'payday') return showModal('Your next payday', `<div class="stack">${field('Next payday or planning end date', 'date', p.payday.nextDate, 'date', `required min="${addPlanDays(flowToday(), 1)}" max="${addPlanDays(flowToday(), 366)}"`)}${selectFrequency('frequency', p.payday.frequency)}</div><p class="detail-help">Your plan lasts through 11:59 PM on payday. It won’t assume you’ve been paid.</p>${receivedPayButton()}<p class="detail-help">Change the date here if your pay is delayed.</p>`, (values, next) => { const date = String(values.get('date')); if (!validPlanDate(date) || date <= flowToday()) throw new Error('Choose a future date.'); next.payday = { nextDate: date, frequency: String(values.get('frequency')), anchorDay: date === next.payday.nextDate ? next.payday.anchorDay || Number(date.slice(-2)) : Number(date.slice(-2)) }; });
            if (action === 'essentials') return showModal('Keep a little aside', `<div class="stack">${reserveFields()}</div><p class="detail-help">Choose amounts to reserve from today. This starts a fresh reserve period; your bank balances and past transactions stay intact.</p>`, collectReserves);
            if (action === 'bill') return editBill(target.dataset.id);
            if (action === 'suggested-bill') { const suggestion = billSuggestions().find(s => s.key === target.dataset.key); if (suggestion) editBill(null, suggestion); return; }
            if (action === 'review-bill') return reviewBill(target.dataset.id, target.dataset.date);
            if (action === 'dismiss-bill' || action === 'restore-bill-suggestion') {
                const next = clone();
                if (action === 'dismiss-bill') {
                    const suggestion = billSuggestions().find(s => s.key === target.dataset.key); if (!suggestion) throw new Error('This suggestion changed. Reload and check again.');
                    next.dismissedBillSuggestions = [...(next.dismissedBillSuggestions || []).filter(d => d.key !== suggestion.key), { key: suggestion.key, label: suggestion.name }];
                } else next.dismissedBillSuggestions = (next.dismissedBillSuggestions || []).filter(d => d.key !== target.dataset.key);
                persist(next); render(); notify(action === 'dismiss-bill' ? 'Suggestion dismissed. You can restore it under Possible repeats.' : 'Suggestion restored.'); return;
            }
            if (action === 'ignore-bill-payment') {
                const fresh = loadTransactions(); const payment = fresh.find(t => billPaymentKey(t) === target.dataset.payment);
                if (!payment || billFingerprint(payment) !== target.dataset.fingerprint) throw new Error('The payment changed. Close and reopen this bill before changing the match.');
                persist(decideBillPayment(clone(), fresh, loadBankAccounts(), target.dataset.id, target.dataset.date, 'ignore', target.dataset.payment), modalBase);
                dialog.close(); render(); notify('Payment is no longer matched to this bill. The bank transaction is unchanged.'); return;
            }
            if (action === 'reset-bill-decision' || action === 'reset-bill-ignores') {
                const next = clone(); next.billPaymentDecisions = (next.billPaymentDecisions || []).filter(d => !(d.billId === target.dataset.id && d.dueDate === target.dataset.date && (action === 'reset-bill-ignores' ? d.choice === 'ignore' : d.choice !== 'ignore')));
                persist(next, modalBase); dialog.close(); render(); notify('Your choice was undone. Flow checked the latest bank facts again.'); return;
            }
            if (action === 'bill-delete' || action === 'bill-paid') {
                const b = p.bills.find(b => b.id === target.dataset.id); if (!b) return;
                if (!confirm(action === 'bill-delete' ? `Remove ${b.name} from your plan?` : `Confirm this payment is already reflected in your available bank balance. Mark this cycle of ${b.name} paid?`)) return;
                let next = clone();
                if (action === 'bill-delete') {
                    next.bills = next.bills.filter(row => row.id !== b.id);
                    next.billPaymentDecisions = (next.billPaymentDecisions || []).filter(d => d.billId !== b.id);
                } else next = decideBillPayment(next, loadTransactions(), loadBankAccounts(), b.id, target.dataset.date || b.nextDate, 'manual');
                persist(next, modalBase); dialog.close(); render(); return;
            }
        } catch (error) { const box = dialog.open && dialog.querySelector('.form-message'); if (box) box.textContent = error.message; else notify(error.message); }
    });
    document.addEventListener('change', event => {
        if (!event.target.dataset.planPreference) return;
        try { const next = clone(); next.preferences[event.target.dataset.planPreference] = event.target.checked; persist(next); notify('Preference saved.'); }
        catch (error) { event.target.checked = !event.target.checked; notify(error.message); }
    });
    document.addEventListener('flow-bank-updated', event => { if (setupDirty || dialog.open) {if(event.detail?.changed)notify('New bank activity arrived. Finish your current edit to refresh the view.');} else render(); });
    document.addEventListener('flow-bank-status-updated',()=>{const feed=dialog.querySelector('[data-source-feed]');if(feed&&owner===flowStorage.getItem('flow_user_id')){feed.innerHTML=sourceFeedMarkup();icons();}});
    dialog.addEventListener('close', () => { reserveReview=null; checkIn = null; if (!setupDirty) render(); window.FlowApp?.restoreControl(modalInvoker); });
    document.addEventListener('flow-transaction-updated', render);
    document.addEventListener('flow-transaction-view-refresh', render);
    document.addEventListener('flow-accounts-updated', () => { if(setup){refreshSetupBankPreview();return;}if(dialog.querySelector('#source-status-panel')){renderSourceSheet();return;}if(checkIn?.step===1){renderCheckInBankStatus();return;} if (setupDirty || dialog.open) notify('Account balances updated. Finish your current edit to refresh the view.'); else render(); });
    document.addEventListener('flow-transaction-data-updated', () => { if (setupDirty || dialog.open) notify('Your saved copy changed. Reload before saving another edit.'); else render(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    if (setup) {
        try { load(); const step = Number(new URLSearchParams(location.search).get('step')); if (new URLSearchParams(location.search).has('step') && Number.isInteger(step) && step >= 0 && step <= 5) { const next = clone(); next.setup.step = step; persist(next); } } catch (error) { notify(error.message); }
        window.addEventListener('beforeunload', event => { if(setupDirty)rememberSetupDraft();if (setupDirty&&!setupDraftSaved) { event.preventDefault(); event.returnValue = ''; } });
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
    function refreshPlanningDay() {
        const newDay=renderedDay!==flowToday(), due=p?paydayCheckInDue(p):false;
        if (!newDay && due===renderedCheckInDue) return;
        renderedDay=flowToday();renderedCheckInDue=due;
        if (dialog.open || setupDirty) { if(newDay) notify('A new day started. Finish or close this edit to refresh your plan.'); }
        else render();
    }
    window.addEventListener('focus',refreshPlanningDay);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPlanningDay();});
    function watchNextDay() {
        const now=new Date(), boundary=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59);
        const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
        const next=now<boundary?boundary:midnight;
        setTimeout(()=>{refreshPlanningDay();watchNextDay();},Math.max(1000,next.getTime()-now.getTime()+100));
    }
    watchNextDay();
    render();
})();
