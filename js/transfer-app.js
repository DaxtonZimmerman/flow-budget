var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* The same transfer sheet is available from Activity, Home, and Review. */
(function () {
    const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
    const day = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
    const button = (text, action, cls = 'back-button') => { const node = el('button', text, cls); node.type = 'button'; node.addEventListener('click', action); return node; };
    const stamp = () => JSON.stringify(['transactions', 'bankAccounts'].map(key => flowStorage.getItem(key)));
    const read = () => ({ items: loadTransactions(), accounts: loadBankAccounts() });
    let active = null, running = false;
    const dialog = el('dialog', '', 'transfer-dialog'); dialog.id = 'transfer-match-dialog';
    dialog.setAttribute('aria-labelledby', 'transfer-match-title');
    dialog.innerHTML = '<div class="dialog-heading"><div><p class="small-label">Between your accounts</p><h2 id="transfer-match-title">Check this transfer</h2></div><button type="button" class="icon-button" aria-label="Close transfer">×</button></div><div id="transfer-match-body"></div><p id="transfer-match-message" class="form-message" role="status" aria-live="polite"></p><div id="transfer-match-actions" class="transfer-actions"></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('[aria-label="Close transfer"]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { active = null; if (typeof flushFlowDataViews === 'function') flushFlowDataViews(); });
    const body = dialog.querySelector('#transfer-match-body'), message = dialog.querySelector('#transfer-match-message'), actions = dialog.querySelector('#transfer-match-actions');
    function commit(next, expected, owner) {
        if (owner !== flowStorage.getItem('flow_user_id') || expected !== stamp()) throw new Error('New activity or saved changes arrived. Close and reopen this transfer before choosing.');
        flowStorage.setItem('transactions', JSON.stringify(next));
        if (typeof flowDataChanged === 'function') flowDataChanged();
        if (typeof refreshFlowDataViews === 'function') refreshFlowDataViews();
    }
    function choice(action) {
        try { action(); } catch (error) { message.textContent = error.name === 'QuotaExceededError' ? 'Flow could not save. Free some browser storage and try again.' : error.message || 'Flow could not save this transfer.'; }
    }
    function entry(item, accounts) {
        const row = el('div', '', 'transfer-entry');
        row.append(el('span', item.amount < 0 ? 'From' : 'To', 'small-label'), el('strong', transferAccount(item, accounts)?.name || 'Bank account'));
        row.append(el('span', `${item.amount < 0 ? '−' : '+'}${money(item.amount)} · ${day(item.date)}`));
        const original = el('details'); original.append(el('summary', 'Bank description'), el('small', item.name)); row.append(original);
        return row;
    }
    function open(id) {
        const { items, accounts } = read(), item = items.find(t => String(t.id) === String(id));
        if (!item || item.source !== 'bank') return false;
        active = { owner: flowStorage.getItem('flow_user_id'), stamp: stamp(), key: transferRecordKey(item) };
        const opened = active;
        body.replaceChildren(); actions.replaceChildren(); message.textContent = '';
        const peer = linkedTransferPeer(item, items, accounts);
        if (peer) {
            dialog.querySelector('h2').textContent = 'One transfer. Both accounts.';
            body.append(el('p', transferPairLabel(item, peer, accounts), 'transfer-route'));
            const entries = el('div', '', 'transfer-entries');
            for (const t of [item, peer].sort((a, b) => a.amount - b.amount)) entries.append(entry(t, accounts));
            body.append(entries, el('p', `${item.transferPair.mode === 'automatic' ? 'Linked automatically because both entries were already confirmed as transfers.' : 'You confirmed these entries are the same transfer.'} Both bank records stay in Activity. Neither counts as income or spending.`, 'detail-help'));
            body.append(el('p', 'Undo restores the earlier types on both entries, keeping newer notes and categories. Existing remembered transfer rules stay in place.', 'detail-help'));
            actions.append(button('Undo match', () => choice(() => {
                commit(unlinkTransferRecords(read().items, opened.key), opened.stamp, opened.owner);
                dialog.close(); render();
            })));
        } else if (item.transferPair && validTransferFields(item)) {
            dialog.querySelector('h2').textContent = 'Check this transfer match';
            body.append(entry(item, accounts), el('p', 'The other account or matching entry is unavailable or changed. You can undo the saved match and check the entries again.', 'detail-help'));
            actions.append(button('Undo match', () => choice(() => {
                commit(unlinkTransferRecords(read().items, opened.key), opened.stamp, opened.owner);
                dialog.close(); render();
            })));
        } else {
            dialog.querySelector('h2').textContent = 'Is this the same transfer?';
            const candidates = transferCandidates(item, items, accounts, true);
            body.append(entry(item, accounts));
            if (item.status === 'pending') body.append(el('p', 'This entry is pending. Flow waits for both sides to post before matching them.', 'detail-help'));
            else if (!candidates.length) body.append(el('p', 'The other side is not available to match yet. Flow needs an equal, opposite posted entry in a different connected USD cash account, within three days. Your bank may report each side at a different time.', 'detail-help'));
            else {
                const label = el('label', 'Other side of this movement', 'field'), select = el('select'); select.id = 'transfer-peer-choice';
                label.hidden = candidates.length === 1;
                for (const t of candidates) select.add(new Option(`${transferAccount(t, accounts).name} · ${day(t.date)} · ${money(t.amount)}`, transferRecordKey(t)));
                label.append(select); body.append(label);
                const preview = el('div'); body.append(preview);
                const update = () => { const other = candidates.find(t => transferRecordKey(t) === select.value); preview.replaceChildren(el('p', transferPairLabel(item, other, accounts), 'transfer-route'), entry(other, accounts)); };
                select.addEventListener('change', update); update();
                body.append(el('p', 'Link only money moved between your own accounts. Both entries become transfers, excluded from income and spending. Bank amounts, dates, and balances stay unchanged.', 'detail-help'));
                actions.append(button('Yes, link this transfer', () => choice(() => {
                    commit(matchTransferRecords(read().items, accounts, opened.key, select.value), opened.stamp, opened.owner);
                    dialog.close(); render();
                }), 'save-button'));
                actions.append(button('Not the same transfer', () => choice(() => {
                    const current = read().items;
                    const next = current.map(t => transferRecordKey(t) === opened.key || transferRecordKey(t) === select.value
                        ? { ...t, transferNoMatch: [...new Set([...(t.transferNoMatch || []), transferRecordKey(t) === opened.key ? select.value : opened.key])] } : t);
                    commit(next, opened.stamp, opened.owner); dialog.close(); render();
                })));
            }
        }
        actions.append(button('Done for now', () => dialog.close()));
        if (!dialog.open) dialog.showModal();
        return true;
    }
    function state() {
        const { items, accounts } = read(), seen = new Set(), linked = [];
        for (const item of items) {
            const peer = linkedTransferPeer(item, items, accounts);
            if (!peer || seen.has(transferRecordKey(item))) continue;
            seen.add(transferRecordKey(item)); seen.add(transferRecordKey(peer));
            linked.push({ item, peer, label: transferPairLabel(item, peer, accounts) });
        }
        return { suggestions: transferSuggestions(items, accounts), linked: linked.sort((a, b) => b.item.date.localeCompare(a.item.date)) };
    }
    function render() {
        let data;
        try { data = state(); } catch (_) { return; }
        const review = document.querySelector('#quick-review-banner');
        if (review) {
            let card = document.querySelector('#transfer-review-card');
            if (!card) { card = el('section', '', 'card transfer-review-card'); card.id = 'transfer-review-card'; review.before(card); }
            card.hidden = !data.suggestions.length && !data.linked.length;
            card.replaceChildren(el('p', 'Money moves', 'small-label'), el('h3', 'Between your accounts'));
            card.append(el('p', `${data.linked.length} linked ${data.linked.length === 1 ? 'transfer' : 'transfers'} · ${data.suggestions.length} possible ${data.suggestions.length === 1 ? 'match' : 'matches'} to check. The original bank entries stay in Activity.`, 'detail-help'));
            for (const pair of data.suggestions.slice(0, 5)) {
                const row = el('div', '', 'transfer-review-row'), info = el('div');
                info.append(el('strong', pair.label), el('small', `${money(pair.outgoing.amount)} · ${day(pair.outgoing.date)}${pair.outgoing.date !== pair.incoming.date ? ' / ' + day(pair.incoming.date) : ''}`));
                row.append(info, button('Check transfer', () => open(pair.outgoing.id))); card.append(row);
            }
            if (data.suggestions.length > 5) card.append(el('p', 'The next matches appear as you finish these. You can also open any bank entry in Activity.', 'detail-help'));
            if (data.linked.length) {
                const list = el('details', '', 'transfer-matched-list'); list.append(el('summary', `View ${data.linked.length} linked ${data.linked.length === 1 ? 'transfer' : 'transfers'}`));
                for (const pair of data.linked.slice(0, 12)) {
                    const row = el('div', '', 'transfer-review-row'), info = el('div');
                    info.append(el('strong', pair.label), el('small', `${money(pair.item.amount)} · ${day(pair.item.date)}`));
                    row.append(info, button('View match', () => open(pair.item.id))); list.append(row);
                }
                if (data.linked.length > 12) list.append(el('p', 'Showing the 12 most recent matches. Open an older entry in Activity to see or undo its match.', 'detail-help'));
                card.append(list);
            }
            const groups = document.querySelector('#quick-review-groups');
            let hint = document.querySelector('#transfer-quick-hint');
            if (!hint) { hint = el('div', '', 'transfer-activity-summary'); hint.id = 'transfer-quick-hint'; groups.before(hint); }
            hint.hidden = !data.suggestions.length;
            hint.replaceChildren(el('span', `${data.suggestions.length} possible transfer matches can be checked by account.`), button('Check transfers by account', () => {
                if (typeof window.hasFlowReviewDraft === 'function' && window.hasFlowReviewDraft()) {
                    document.querySelector('#quick-review-message').textContent = 'Apply your current group choice before checking transfer matches.'; return;
                }
                document.querySelector('#quick-review-dialog').close(); card.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }, 'inline-link'));
        }
        const history = document.querySelector('.transaction-summary-grid');
        if (history) {
            let banner = document.querySelector('#transfer-activity-summary');
            if (!banner) { banner = el('div', '', 'transfer-activity-summary'); banner.id = 'transfer-activity-summary'; history.after(banner); }
            banner.hidden = !data.linked.length && !data.suggestions.length;
            banner.replaceChildren(el('span', `${data.linked.length} linked ${data.linked.length === 1 ? 'transfer' : 'transfers'}${data.suggestions.length ? ' · ' + data.suggestions.length + ' possible matches to check' : ' · excluded from income and spending'}`));
            const link = el('a', 'Review transfers', 'inline-link'); link.href = 'review.html#transfer-review-card'; banner.append(link);
        }
    }
    function reconcile() {
        if (running || !flowStorage.getItem('flow_user_id') || flowStorage.getItem('flow_pending') === '1') return;
        running = true;
        try {
            const owner = flowStorage.getItem('flow_user_id'), expected = stamp(), { items, accounts } = read();
            // If an account is temporarily unavailable, retain dated match data until it is available again.
            if (items.some(t => t.transferPair && !transferAccount(t, accounts))) return;
            const next = reconcileTransferRecords(items, accounts);
            if (JSON.stringify(next) !== JSON.stringify(items)) commit(next, expected, owner);
        } catch (_) { /* Storage/conflict handling remains available in Account; never replace unreadable records. */ }
        finally { running = false; }
        render();
    }
    window.FlowTransfers = { open, render, reconcile };
    for (const name of ['flow-cloud-ready', 'flow-accounts-updated', 'flow-bank-updated', 'flow-transaction-updated']) document.addEventListener(name, reconcile);
    document.addEventListener('flow-transaction-view-refresh', () => { reconcile(); render(); });
    queueMicrotask(() => { reconcile(); render(); });
})();
