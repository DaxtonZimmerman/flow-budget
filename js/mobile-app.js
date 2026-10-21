/* Phone navigation and presentation. These controls never save financial records. */
(function () {
    const phone = matchMedia('(max-width:768px)');
    const disclosureState = new Map();
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const icons = () => { if (typeof lucide !== 'undefined') lucide.createIcons(); };
    let billsTab = location.hash === '#bill-discovery' ? 'suggestions' : 'upcoming';
    let queued = false;
    function disclosure(element, key, label) {
        if (!element) return;
        let details = element.closest('details[data-mobile-disclosure]');
        if (!details) {
            details = [...document.querySelectorAll('details[data-mobile-disclosure]')].find(item => item.dataset.mobileDisclosure === key);
            if (details) details.append(element);
        }
        if (!details) {
            details = document.createElement('details'); details.className = 'mobile-disclosure';
            details.dataset.mobileDisclosure = key;
            const summary = document.createElement('summary'); summary.innerHTML = label + icon('chevron-down');
            element.before(details); details.append(summary, element);
        }
        prepareDisclosure(details, key);
    }
    function prepareDisclosure(details, key) {
        if (!details.dataset.mobileReady) {
            details.dataset.mobileReady = 'true';
            details.addEventListener('toggle', () => {
                if (phone.matches && details.isConnected) disclosureState.set(key, details.open);
            });
        }
        details.open = !phone.matches || disclosureState.get(key) === true;
    }
    function updateBills() {
        const page = document.querySelector('#payday-bills'); if (!page) return;
        page.dataset.mobileTab = billsTab;
        for (const tab of page.querySelectorAll('[data-mobile-bill-tab]')) tab.setAttribute('aria-pressed', String(tab.dataset.mobileBillTab === billsTab));
    }
    const activity = document.querySelector('#transaction-history');
    let optionsDialog, filterDialog, filterPlaceholders = [];
    function shellDialog(id, title) {
        const dialog = document.createElement('dialog'); dialog.id = id; dialog.className = 'mobile-filter-dialog';
        dialog.setAttribute('aria-labelledby', id + '-title');
        dialog.innerHTML = `<div class="dialog-heading"><h2 id="${id}-title">${title}</h2><button type="button" class="icon-button" data-mobile-close aria-label="Close">${icon('x')}</button></div>`;
        dialog.addEventListener('click', event => {
            if (event.target.closest('[data-mobile-close]')) dialog.close();
            if (event.target === dialog) {
                const r = dialog.getBoundingClientRect();
                if (event.clientY < r.top || event.clientY > r.bottom || event.clientX < r.left || event.clientX > r.right) dialog.close();
            }
        });
        document.body.append(dialog); return dialog;
    }
    function prepareFilters() {
        if (!activity || filterDialog) return;
        filterDialog = shellDialog('mobile-filter-dialog', 'Filter activity');
        const fields = document.createElement('div'); fields.className = 'mobile-filter-fields'; filterDialog.append(fields);
        for (const id of ['history-month','history-type-filter','history-category-filter','history-sort']) {
            const field = document.getElementById(id)?.closest('.history-filter'); if (!field) continue;
            const placeholder = document.createComment('Original filter position'); field.before(placeholder);
            filterPlaceholders.push({ field, placeholder });
        }
        const done = document.createElement('button'); done.type = 'button'; done.className = 'save-button'; done.textContent = 'Show activity';
        done.addEventListener('click', () => filterDialog.close()); filterDialog.append(done);
        const summary = document.querySelector('#activity-more-filters>summary');
        summary.setAttribute('aria-haspopup','dialog'); summary.setAttribute('aria-label','Filter and sort activity');
        summary.addEventListener('click', event => { if (phone.matches) { event.preventDefault(); filterDialog.showModal(); } });
        filterDialog.addEventListener('close', () => { if (phone.matches) summary.focus({preventScroll:true}); });
        const state = document.createElement('p'); state.className = 'mobile-filter-state mobile-only'; state.setAttribute('role','status');
        document.querySelector('.history-filters').after(state);
        optionsDialog = shellDialog('mobile-activity-options', 'Transaction');
        optionsDialog.insertAdjacentHTML('beforeend','<div class="mobile-action-list"></div>');
        const totals = document.querySelector('.transaction-summary-grid');
        const wrap = document.createElement('details'); wrap.className = 'mobile-activity-totals';
        const totalsSummary = document.createElement('summary'); totalsSummary.innerHTML = 'Income & spending totals ' + icon('chevron-down');
        totals.before(wrap); wrap.append(totalsSummary, totals); prepareDisclosure(wrap,'activity-totals');
    }
    function moveFilters() {
        if (!filterDialog) return;
        if (!phone.matches && filterDialog.open) filterDialog.close();
        for (const { field, placeholder } of filterPlaceholders) {
            if (phone.matches) filterDialog.querySelector('.mobile-filter-fields').append(field);
            else placeholder.after(field);
        }
    }
    function openOptions(row, invoker) {
        const name = row.querySelector('.transaction-open-button strong').textContent;
        optionsDialog.querySelector('h2').textContent = name;
        const list = optionsDialog.querySelector('.mobile-action-list'); list.replaceChildren();
        const open = document.createElement('button'); open.type = 'button'; open.innerHTML = icon('receipt') + 'Open details';
        open.addEventListener('click', () => { optionsDialog.close(); row.querySelector('.transaction-open-button').click(); }); list.append(open);
        const edit = row.querySelector('.edit-transaction-link');
        if (edit) { const link = document.createElement('a'); link.href = edit.href; link.innerHTML = icon('pencil') + 'Edit transaction'; list.append(link); }
        const originalDelete = row.querySelector('.delete-transaction-button');
        if (originalDelete) {
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mobile-delete'; remove.innerHTML = icon('trash-2') + 'Delete transaction';
            remove.addEventListener('click', () => { optionsDialog.close(); originalDelete.click(); }); list.append(remove);
        }
        optionsDialog.onclose = () => { if (invoker.isConnected) invoker.focus({preventScroll:true}); };
        optionsDialog.showModal(); icons();
    }
    function updateActivity() {
        if (!activity) return;
        activity.querySelectorAll('.mobile-date-heading').forEach(el => el.remove());
        const sortedByDate = /^date-/.test(document.querySelector('#history-sort').value);
        let lastDate;
        for (const row of activity.querySelectorAll('.history-row')) {
            if (!row.querySelector('.mobile-transaction-more')) {
                const more = document.createElement('button'); more.type = 'button'; more.className = 'mobile-transaction-more';
                more.setAttribute('aria-label','More options for ' + row.querySelector('.transaction-open-button strong').textContent);
                more.setAttribute('aria-haspopup','dialog'); more.innerHTML = icon('ellipsis');
                // The icon renderer may replace the tapped SVG while opening the sheet.
                // Keep this tap from also reaching the row's open-details handler.
                more.addEventListener('click', event => { event.stopPropagation(); openOptions(row, more); }); row.append(more);
            }
            if (!row.hidden && sortedByDate && row.dataset.transactionDate !== lastDate) {
                lastDate = row.dataset.transactionDate;
                const heading = document.createElement('h4'); heading.className = 'mobile-date-heading';
                heading.textContent = /^\d{4}-\d{2}-\d{2}$/.test(lastDate || '') ? new Date(lastDate + 'T12:00:00').toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric', year:'numeric' }) : 'Date needed';
                row.before(heading);
            }
        }
        const type = document.querySelector('#history-type-filter');
        const category = document.querySelector('#history-category-filter');
        const month = document.querySelector('#history-month').value;
        const selected = [month, type.value !== 'all' ? type.selectedOptions[0].text : '', category.value !== 'all' ? category.value : ''].filter(Boolean);
        const status = document.querySelector('.mobile-filter-state');
        if (status) { status.textContent = selected.join(' · '); status.hidden = selected.length === 0; }
        icons();
    }
    function refresh() {
        queued = false;
        document.querySelectorAll('.mobile-home-overview').forEach(el => prepareDisclosure(el,'home-overview'));
        document.querySelectorAll('.mobile-activity-totals').forEach(el => prepareDisclosure(el,'activity-totals'));
        disclosure(document.querySelector('.home-payday-path'),'payday-path','Your payday path');
        disclosure(document.querySelector('#flow-plan-tools'),'more-plan-tools','Goals, cards & more');
        if (phone.matches) document.querySelector('.home-payday-path')?.closest('details')?.style.setProperty('order','5');
        updateBills(); updateActivity(); observeDialogs();
    }
    function schedule() { if (!queued) { queued = true; queueMicrotask(refresh); } }
    const observed = new WeakSet();
    function sheetViewport() {
        const view = window.visualViewport;
        document.documentElement.style.setProperty('--flow-sheet-height', (view ? view.height * .94 : innerHeight * .94) + 'px');
        document.documentElement.style.setProperty('--flow-sheet-bottom', Math.max(0, view ? innerHeight - view.height - view.offsetTop : 0) + 'px');
    }
    function observeDialogs() {
        for (const dialog of document.querySelectorAll('dialog')) if (!observed.has(dialog)) {
            observed.add(dialog);
            new MutationObserver(() => {
                document.documentElement.classList.toggle('flow-sheet-open', Boolean(document.querySelector('dialog[open]')));
                sheetViewport();
            }).observe(dialog,{ attributes:true, attributeFilter:['open'] });
        }
    }
    document.addEventListener('click', event => {
        const tab = event.target.closest('[data-mobile-bill-tab]');
        if (tab) { billsTab = tab.dataset.mobileBillTab; updateBills(); }
    });
    window.addEventListener('hashchange', () => { if (location.hash === '#bill-discovery') { billsTab = 'suggestions'; updateBills(); } });
    for (const name of ['flow-payday-rendered','flow-activity-rendered','flow-transaction-view-refresh','flow-accounts-updated','flow-review-updated','flow-planning-updated']) document.addEventListener(name,schedule);
    phone.addEventListener('change', () => { moveFilters(); schedule(); });
    window.visualViewport?.addEventListener('resize',sheetViewport);
    window.visualViewport?.addEventListener('scroll',sheetViewport);
    prepareFilters(); moveFilters(); sheetViewport(); schedule();
    document.addEventListener('DOMContentLoaded',schedule);
})();
