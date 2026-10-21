/* Visual summaries only. The planning engine remains the source of every money amount. */
function flowMoneyMap(estimate) {
    if (!estimate?.ready) return null;
    const fields = ['balanceCents','leftCents','billsCents','essentialsCents','cushionCents','goalsCents','cardsCents','adjustmentsCents'];
    if (fields.some(key => !Number.isSafeInteger(estimate[key] ?? (['goalsCents','cardsCents','adjustmentsCents'].includes(key) ? 0 : NaN)))) return null;
    const protectedCents = estimate.cushionCents + (estimate.goalsCents || 0) + (estimate.cardsCents || 0) + (estimate.adjustmentsCents || 0);
    const parts = [
        { key:'flexible', label:'Flexible', cents:Math.max(0, estimate.leftCents), color:'#c6e59c' },
        { key:'bills', label:'Bills', cents:estimate.billsCents, color:'#7f9fdb' },
        { key:'essentials', label:'Everyday', cents:estimate.essentialsCents, color:'#e7bf84' },
        { key:'protected', label:'Kept aside', cents:protectedCents, color:'#a5bca7' }
    ];
    if (parts.some(part => part.cents < 0 || !Number.isSafeInteger(part.cents))) return null;
    const total = parts.reduce((sum, part) => sum + part.cents, 0);
    if (!Number.isSafeInteger(total)) return null;
    return { parts:parts.map(part => ({...part, share:total ? part.cents / total : 0})), shortfallCents:Math.max(0,-estimate.leftCents) };
}
function flowPaydayRunway(planning, today) {
    const day = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
        const time = Date.parse(value + 'T12:00:00Z');
        return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time / 86400000 : NaN;
    };
    const end = day(planning.payday?.nextDate), start = day(planning.periodStartedOn), now = day(today);
    if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
    const left = Math.round(end - now), total = Math.round(end - start);
    if (left < 0 || left > 366) return null;
    return { days:left, progress:Number.isFinite(total) && total > 0 && total <= 366 && start <= now ? Math.max(0,Math.min(1,1-left/total)) : null };
}
if (typeof module !== 'undefined' && module.exports) module.exports = {flowMoneyMap,flowPaydayRunway};
