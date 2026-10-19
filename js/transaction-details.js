/* Shared transaction popup for Activity, Home, and grouped review. */
(function () {
    const dialog = document.createElement('dialog');
    dialog.id = 'transaction-details-dialog';
    dialog.className = 'transaction-details-dialog';
    dialog.setAttribute('aria-labelledby', 'transaction-details-title');
    dialog.innerHTML = `
        <div class="transaction-details-heading"><p class="small-label">One transaction</p><button type="button" class="icon-button" id="close-transaction-details" aria-label="Close transaction"><i data-lucide="x" aria-hidden="true"></i></button></div>
        <h2 id="transaction-details-title"></h2>
        <div class="transaction-details-amount" id="transaction-details-amount"></div>
        <p class="transaction-details-meta" id="transaction-details-meta"></p>
        <form id="transaction-details-form">
            <div class="transaction-details-fields">
                <div class="form-group"><label for="transaction-details-type">Type</label><select id="transaction-details-type"></select></div>
                <div class="form-group"><label for="transaction-details-category" id="transaction-details-category-label">Category</label><select id="transaction-details-category" autofocus></select></div>
            </div>
            <p id="transaction-details-category-source" class="transaction-details-help"></p>
            <p id="transaction-details-type-help" class="transaction-details-help" hidden>Use Transfer for money moved between accounts you own.</p>
            <div class="form-group" id="transaction-details-date-field"><label for="transaction-details-date">Date</label><input id="transaction-details-date" type="date"></div>
            <div class="form-group"><label for="transaction-details-notes">What was it for? <span class="optional-label">Optional</span></label><textarea id="transaction-details-notes" rows="3" placeholder="For example, dinner with friends"></textarea></div>
            <p id="transaction-details-message" class="form-message" role="status" aria-live="polite"></p>
            <div class="transaction-details-footer"><p>Only this transaction will change.</p><button type="submit" class="save-button">Save this transaction</button></div>
        </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const type = dialog.querySelector('#transaction-details-type');
    const category = dialog.querySelector('#transaction-details-category');
    const date = dialog.querySelector('#transaction-details-date');
    const notes = dialog.querySelector('#transaction-details-notes');
    const message = dialog.querySelector('#transaction-details-message');
    const formatMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
    const standardCategories = ['Salary', 'Income', 'Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Other'];
    let active = null;
    let changedWhileOpen = false;
    for (const event of ['flow-bank-updated', 'flow-transaction-data-updated']) {
        document.addEventListener(event, () => { if (dialog.open) changedWhileOpen = true; });
    }

    function updateType() {
        category.disabled = type.value === 'Transfer';
        dialog.querySelector('#transaction-details-category-label').textContent =
            category.disabled ? 'Category · not needed' : 'Category';
        dialog.querySelector('#transaction-details-type-help').hidden = type.value !== 'Transfer';
    }
    type.addEventListener('change', updateType);
    dialog.querySelector('#close-transaction-details').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        if (dialog.open) return;
        active = null;
        if (changedWhileOpen) {
            changedWhileOpen = false;
            document.dispatchEvent(new Event('flow-transaction-view-refresh'));
        }
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    function open(id) {
        const transaction = loadTransactions().find(item => String(item.id) === String(id));
        if (!transaction) return false;
        active = { transaction: { ...transaction }, owner: localStorage.getItem('flow_user_id') };
        message.textContent = '';
        const source = dialog.querySelector('#transaction-details-category-source');
        source.textContent = transaction.categoryReason === 'Bank category' ? 'Sorted from a reliable category supplied by your bank. You can change this payment without changing the others.' : transaction.categoryReason || '';
        source.hidden = !source.textContent;
        dialog.querySelector('#transaction-details-title').textContent = transaction.name;
        dialog.querySelector('#transaction-details-amount').textContent = `${transaction.amount < 0 ? '−' : '+'}${formatMoney(transaction.amount)}`;
        const formattedDate = transaction.date ? new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date needed';
        dialog.querySelector('#transaction-details-meta').textContent = `${formattedDate} · ${transaction.source === 'bank' ? 'From your bank' : transaction.source === 'csv' ? 'Imported transaction' : 'Added by you'}${transaction.status === 'pending' ? ' · Pending' : ''}`;
        const choices = transaction.source === 'bank'
            ? transaction.amount < 0 ? ['Expense', 'Transfer'] : transaction.amount > 0 ? ['Income', 'Refund', 'Transfer'] : ['Income', 'Transfer']
            : [transaction.type || (transaction.amount < 0 ? 'Expense' : 'Income')];
        type.replaceChildren();
        for (const value of choices) type.add(new Option(value, value));
        type.value = transaction.type || (transaction.amount < 0 ? 'Expense' : 'Income');
        type.disabled = transaction.source !== 'bank';
        category.replaceChildren();
        const allCategories = [...new Set([...standardCategories, transaction.category].filter(Boolean))];
        for (const value of allCategories) category.add(new Option(value, value));
        category.value = transaction.category || 'Other';
        date.value = transaction.date || '';
        dialog.querySelector('#transaction-details-date-field').hidden = transaction.source === 'bank';
        notes.value = transaction.notes || '';
        updateType();
        if (!dialog.open) dialog.showModal();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        (category.disabled ? notes : category).focus();
        return true;
    }
    form.addEventListener('submit', event => {
        event.preventDefault();
        message.textContent = '';
        if (!active) return;
        let current;
        const id = active.transaction.id;
        try {
            if (active.owner !== localStorage.getItem('flow_user_id')) throw new Error('Your signed-in account changed. Close this window and reopen the transaction.');
            current = JSON.parse(localStorage.getItem('transactions') || '[]');
            const index = current.findIndex(item => String(item.id) === String(id));
            const updated = transactionWithDetails(current[index], { type: type.value, category: category.value,
                date: date.value, notes: notes.value }, active.transaction);
            current[index] = updated;
            localStorage.setItem('transactions', JSON.stringify(current));
        } catch (error) {
            message.textContent = error instanceof SyntaxError ? 'Flow could not read this transaction. Close this window and refresh.'
                : error.name === 'QuotaExceededError' ? 'Flow could not save. Free some browser storage and try again.'
                : error.message || 'Flow could not save this transaction. Try again.';
            return;
        }
        if (typeof flowDataChanged === 'function') {
            try { flowDataChanged(); }
            catch (_) { if (typeof showFlowStatus === 'function') showFlowStatus('Saved on this device. Open Account to sync your changes.'); }
        }
        active = null;
        dialog.close();
        document.dispatchEvent(new CustomEvent('flow-transaction-updated', { detail: { id: id } }));
    });
    window.FlowTransactionDetails = { open: open };
})();
