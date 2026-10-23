/* Phone presentation only. Money and saving still come from the shared planning engine. */
(function () {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value / 100);
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : 'Choose a date';
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const action = (label, name, attributes = '', cls = 'mobile-list-row') => `<button type="button" class="${cls}" data-plan-action="${name}" ${attributes}>${label}</button>`;
    const title = text => `<h2 class="mobile-section-title">${text}</h2>`;
    function billHighlight(e, payday) {
        const next = e.bills[0];
        return { key:'bills', label:'Bills before payday', body:`<strong class="home-highlight-amount">${money(e.billsCents)}</strong><p>${e.bills.length ? e.bills.length + ' unpaid ' + (e.bills.length === 1 ? 'bill' : 'bills') + ' before ' + date(payday) : 'No confirmed unpaid bills before ' + date(payday)}${next ? ' · Next: ' + esc(next.name) : ''}</p><a class="home-text-link" href="bills.html">See your bills ${icon('arrow-right')}</a>` };
    }
    function moneyMap(e, compact = false) {
        const map = flowMoneyMap(e); if (!map || !map.parts.some(part => part.cents > 0)) return '';
        return '<div class="money-map' + (compact ? ' money-map-compact' : '') + '"><div class="money-map-track" aria-hidden="true">' + map.parts.filter(part => part.cents > 0).map(part => '<span style="--part-color:' + part.color + ';flex-grow:' + part.cents + '"></span>').join('') + '</div><div class="money-map-legend">' + map.parts.filter(part => part.cents > 0).map(part => action('<span class="map-dot" style="--part-color:' + part.color + '"></span><span>' + part.label + '<strong>' + money(part.cents) + '</strong></span>', 'breakdown', 'data-map-part="' + part.key + '" aria-label="' + esc(part.label + ': ' + money(part.cents) + '. See calculation') + '"', 'map-part')).join('') + '</div></div>';
    }
    function decorateHero(html, e, days) {
        const pace = e.ready && e.leftCents >= 0 && days > 0 ? `<p class="mobile-daily-pace mobile-only"><strong>${money(Math.floor(e.leftCents / days))}/day</strong><span>flexible money</span></p>` : '';
        return html.replace('<h3 class="home-amount">', action(icon('info'), 'breakdown', 'aria-label="How your estimate is calculated"', 'mobile-hero-info mobile-only') + '<h3 class="home-amount">').replace('</section>', pace + '</section>');
    }
    function plan(p, e, source, recovery) {
        const lines = e.ready ? `<dl class="mobile-plan-math"><div><dt>Available money</dt><dd>${money(e.balanceCents)}</dd></div>${[
            ['Bills before payday',e.billsCents],['Everyday essentials',e.essentialsCents],['Your cushion',e.cushionCents],
            ['Goal reserves',e.goalsCents],['Card repayment',e.cardsCents],['Purchases not in your balance',e.adjustmentsCents]
        ].filter(([,n]) => n).map(([name,n]) => `<div><dt>${name}</dt><dd>−${money(n)}</dd></div>`).join('')}<div class="plan-calculation-total"><dt>${e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated left'}</dt><dd>${money(e.leftCents)}</dd></div></dl>${action('How this is calculated ' + icon('chevron-right'),'breakdown','','home-text-link')}` : `<p class="detail-help">${e.missing.map(esc).join(' · ')}</p>${recovery}`;
        const reserves = e.reserves.map(r => {
            const progress = r.amountCents > 0 ? Math.min(100, Math.max(0, r.spentCents / r.amountCents * 100)) : 0;
            return action(`<span class="mobile-reserve-top"><span class="mobile-row-icon">${icon(({Food:'utensils',Transport:'car',Entertainment:'music',Shopping:'shopping-bag'})[r.category] || 'wallet')}</span><span class="mobile-row-copy"><strong>${esc(r.name)}</strong><small>${money(r.spentCents)} used of ${money(r.amountCents)}</small></span><span class="mobile-reserve-amount"><strong>${money(r.remainingCents)}</strong><small>left</small></span>${icon('chevron-right')}</span><span class="mobile-reserve-progress" aria-hidden="true"><span style="width:${progress}%"></span></span>`, 'essential', `data-id="${esc(r.id)}"`, 'mobile-reserve-row');
        }).join('');
        const checkIn = typeof paydayCheckInDue === 'function' && paydayCheckInDue(p) ? `<section class="mobile-plan-checkin"><strong>Ready for your next plan?</strong><p>Check your available money when your pay arrives.</p>${action('Start payday check-in','payday-checkin','','save-button')}</section>` : '';
        return `<div class="mobile-plan mobile-only">${checkIn}<section class="mobile-card mobile-plan-summary"><div class="mobile-section-heading"><div><p class="mobile-eyebrow">Until ${date(p.payday.nextDate)}</p><h2>Your payday plan</h2></div>${action(icon('calendar-days'),'payday','aria-label="Edit payday"','icon-button')}</div>${e.ready ? `<div class="plan-hero-total mobile-plan-total"><strong>${money(e.leftCents)}</strong><span>${e.leftCents < 0 ? 'Estimated shortfall' : 'Estimated left until payday'}</span></div>${moneyMap(e)}` : ''}${receivedPayAction(p)}<details class="plan-calculation"><summary>See the calculation ${icon('chevron-down')}</summary>${lines}</details><p class="mobile-source">${esc(source.label)} ${action('Details','home-source','','inline-link')}</p></section>${title('Everyday essentials')}<section class="mobile-card mobile-essentials">${reserves || '<p class="detail-help">Choose the essentials you want to keep aside.</p>'}${action('Edit all set-asides','essentials','','mobile-full-link')}</section>${action(`<span class="mobile-row-icon">${icon('shield-check')}</span><span class="mobile-row-copy"><strong>Your cushion</strong><small>Kept out of everyday spending</small></span><strong>${money(p.cushionCents)}</strong>${icon('chevron-right')}`,'cushion','','mobile-card mobile-list-row mobile-cushion')}<div class="mobile-plan-shortcuts">${action(icon('landmark') + ' Spending money','accounts','','back-button')}<a class="back-button" href="bills.html">${icon('calendar-days')} Your bills</a></div></div>`;
    }
    function receivedPayAction(p) {
        if (!p.setup.completed || !validPlanDate(p.payday.nextDate)) return '';
        const marked=p.lastPaydayCheckIn?.receivedOn===flowToday();
        return action(icon(marked?'check':'circle-check')+(marked?' Paid today':' I got paid'),'payday-received',marked?'disabled aria-label="Already marked paid today"':'','mobile-paid-button');
    }
    function billsSummary(p, e, count) {
        return `<div class="mobile-only mobile-bills-summary"><div class="mobile-segments" role="group" aria-label="Bills view"><button type="button" data-mobile-bill-tab="upcoming" aria-pressed="true">Upcoming</button><button type="button" data-mobile-bill-tab="suggestions" aria-pressed="false">Suggestions <span>${count}</span></button></div><section class="mobile-card mobile-bill-total"><p class="mobile-eyebrow">Bills before ${date(p.payday.nextDate)}</p><strong>${p.billsConfirmed && e.ready ? money(e.billsCents) : 'Confirm your plan'}</strong><p>${p.billsConfirmed && e.ready ? 'Included in your plan' : 'Finish setup to see your bills'}</p></section></div>`;
    }
    function billRow(b, row) {
        const check = row && (row.needsAttention || row.payment || row.confirmed || row.status === 'pending');
        const status = row?.needsAttention ? 'Needs a check' : row?.status === 'pending' ? 'Payment processing' : row?.paid ? 'Last cycle paid' : b.next ? 'Upcoming' : 'Completed';
        return action(`<span class="mobile-row-icon">${icon(row?.needsAttention ? 'circle-alert' : 'receipt')}</span><span class="mobile-row-copy"><strong>${esc(b.name)}</strong><small>${b.next ? date(b.next.dueDate) + ' · ' : ''}${status}</small></span><strong>${money(b.next?.amountCents ?? row?.amountCents ?? b.amountCents)}</strong>${icon('chevron-right')}`, check ? 'review-bill' : 'bill', `data-id="${esc(b.id)}"${check ? ` data-date="${esc(row.dueDate)}"` : ''}`, 'mobile-bill-row mobile-list-row mobile-only');
    }
    window.FlowMobileViews = { billHighlight, decorateHero, plan, billsSummary, billRow, moneyMap };
})();
