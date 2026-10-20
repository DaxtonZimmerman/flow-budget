/* Presentation choices only. The payday engine remains the source of money amounts. */
function flowHomeSourceStatus(planning, accounts, today, now = Date.now()) {
    if (planning.manualBalance) {
        const current = planning.manualBalance.date === today;
        return { kind: current ? 'confirmed' : 'check', label: current ? 'Money confirmed today' : 'Manual balance needs a check', caution: !current };
    }
    const ids = planning.selectedAccountIds || [], selected = accounts.filter(a => ids.includes(a.id));
    if (!selected.length || selected.length !== ids.length) return { kind: 'check', label: 'Choose your spending money', caution: true };
    const timestamps = selected.map(a => Date.parse(a.bankUpdatedAt || ''));
    if (timestamps.some(t => !Number.isFinite(t))) return { kind: 'unknown', label: 'Bank balance date unavailable', caution: true };
    if (timestamps.some(t => now - t > 36 * 3600000 || t > now + 300000)) return { kind: 'check', label: 'Check the bank balance date', caution: true };
    const oldest = new Date(Math.min(...timestamps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { kind: 'bank', label: 'Bank balance dated ' + oldest, caution: false };
}
function flowHomeTasks(planning, estimate, tracking, reviewCount, reminders, checkInDue) {
    const tasks = [];
    if (!planning.setup.completed) tasks.push({ key: 'setup', title: 'Set up your payday plan', text: 'Choose spending money, payday, and what to keep aside.', href: 'setup.html', icon: 'sprout' });
    else if (checkInDue) tasks.push({ key: 'payday', title: 'Start your next payday plan', text: 'Confirm what arrived and what to keep aside.', action: 'payday-checkin', icon: 'sunrise' });
    else if (!estimate.ready) tasks.push({ key: 'check', title: 'Check your money and plan', text: estimate.missing[0] || 'A planning choice needs confirmation.', tool: 'reconcile', icon: 'circle-help' });
    else if (estimate.leftCents < 0) tasks.push({ key: 'shortfall', title: 'Adjust your plan', text: 'Your bills and set-asides exceed available money.', href: 'budgets.html', icon: 'triangle-alert' });
    if (tracking.alerts?.length) tasks.push({ key: 'bills', title: tracking.alerts.length + ' bill' + (tracking.alerts.length === 1 ? ' needs' : 's need') + ' a check', text: 'Check a payment, changed amount, or due date.', href: 'bills.html#bill-tracking', icon: 'receipt' });
    else if (tracking.suggestions?.length) tasks.push({ key: 'suggestions', title: tracking.suggestions.length + ' possible bill' + (tracking.suggestions.length === 1 ? '' : 's') + ' to confirm', text: 'Only add payments you actually expect again.', href: 'bills.html#bill-discovery', icon: 'calendar-days' });
    if (reviewCount) tasks.push({ key: 'review', title: 'Quick check · ' + reviewCount + ' payment' + (reviewCount === 1 ? '' : 's'), text: 'Categories can wait. Your payments stay editable.', href: 'review.html?quick=1', icon: 'layers' });
    if (reminders.some(r => r.action === 'weekly')) tasks.push({ key: 'weekly', title: 'Your weekly check-in', text: 'A quick look at money, bills, and what changed.', tool: 'weekly', icon: 'calendar-check' });
    return tasks;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { flowHomeSourceStatus, flowHomeTasks };
