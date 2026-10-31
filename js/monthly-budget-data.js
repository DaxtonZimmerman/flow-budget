/* Recent, explainable monthly limits. These are choices, never bank balances. */
function flowMonthlyBudgetModel(
  snapshot,
  targetMonth,
  today = flowToday(),
  options = {},
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth) || !validPlanDate(today))
    throw new Error("Choose a valid month.");
  const planning = snapshot.flowPlanning || defaultFlowPlanning(),
    guide = { ...flowBudgetGuide(planning), ...options };
  const cutoff =
    targetMonth < today.slice(0, 7)
      ? addPlanDays(flowMonthBefore(targetMonth, -1) + "-01", -1)
      : today;
  const history = flowUniqueHistory(snapshot.transactions || [], cutoff);
  const through =
    history
      .map((t) => t.date)
      .sort()
      .at(-1) || cutoff;
  const from = addPlanDays(through, -29),
    sampleFrom = addPlanDays(through, -89);
  const recent = history.filter((t) => t.date >= from && t.date <= through),
    sample = history.filter((t) => t.date >= sampleFrom && t.date <= through);
  const baseline = flowSuggestedBudgets(sample, targetMonth, cutoff, {
    ...guide,
    planning,
    period: true,
  });
  const skipped = new Set(baseline.effectiveExcludedKeys),
    excludedRefunds = new Set(baseline.excludedRefundKeys);
  const coverageRows = (snapshot.transactions || []).filter(
    (t) => validPlanDate(t?.date) && t.date <= cutoff && t.status !== "pending",
  );
  const bankGroups = new Map();
  for (const t of coverageRows.filter((t) => t.source === "bank")) {
    const key = JSON.stringify([t.bankConnectionId, t.accountId]);
    if (!bankGroups.has(key) || t.date < bankGroups.get(key))
      bankGroups.set(key, t.date);
  }
  const activeGroups = new Set(
    recent
      .filter((t) => t.source === "bank")
      .map((t) => JSON.stringify([t.bankConnectionId, t.accountId])),
  );
  const coverageStart = activeGroups.size
    ? [...activeGroups]
        .map((k) => bankGroups.get(k))
        .sort()
        .at(-1)
    : coverageRows.map((t) => t.date).sort()[0] || through;
  const days = Math.min(
    30,
    Math.max(
      1,
      planDays(coverageStart > from ? coverageStart : from, through) + 1,
    ),
  );
  const stale = planDays(through, cutoff) > 14,
    complete = days === 30 && !stale;
  const totals = new Map(),
    counts = new Map(),
    purchases = [];
  for (const t of recent) {
    if (t.type !== "Refund" && t.amount >= 0) continue;
    const key = flowTransactionKey(t),
      excluded = skipped.has(key) || excludedRefunds.has(key);
    for (const part of flowTransactionParts(t)) {
      if (part.income) continue;
      const category = part.category || "Other";
      if (!totals.has(category)) totals.set(category, 0);
      if (!excluded)
        totals.set(
          category,
          totals.get(category) +
            (t.type === "Refund" ? -part.cents : part.cents),
        );
      if (t.type !== "Refund" && !excluded)
        counts.set(category, (counts.get(category) || 0) + 1);
      purchases.push({
        key,
        id: t.id,
        name: t.name || "Payment",
        date: t.date,
        category,
        cents: part.cents,
        refund: t.type === "Refund",
        excluded,
        automatic: baseline.automaticKeys.includes(key),
        split: Boolean(t.allocations?.length),
      });
    }
  }
  const saved =
    snapshot.budgetsByMonth?.[targetMonth] || snapshot.budgets || [];
  const categories = new Set([
    ...totals.keys(),
    ...saved.map((b) => b.category),
  ]);
  if (!categories.size)
    for (const category of ["Food", "Transport", "Entertainment", "Bills"])
      categories.add(category);
  const rows = [...categories]
    .map((category) => {
      const observedCents = totals.get(category) || 0,
        uncategorized = category === "Other";
      const existingCents = saved.find((b) => b.category === category)?.limit;
      const canSuggest =
        complete && !uncategorized && (counts.get(category) || 0) > 0;
      // Round up to a usable $5 limit. Never annualise a few days of activity,
      // label a negative net refund as spending, or shrink essentials to fit pay.
      const suggestedCents = canSuggest
        ? Math.ceil(Math.max(0, observedCents) / 500) * 500
        : null;
      return {
        category,
        observedCents,
        suggestedCents,
        canSuggest,
        uncategorized,
        existingCents:
          existingCents === undefined ? null : Math.round(existingCents * 100),
        purchaseCount: counts.get(category) || 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.uncategorized) - Number(b.uncategorized) ||
        b.observedCents - a.observedCents ||
        a.category.localeCompare(b.category),
    );
  return {
    from,
    through,
    days,
    complete,
    stale,
    coverageStart,
    rows,
    purchases: purchases.sort((a, b) => b.date.localeCompare(a.date)),
    incomeCents:
      baseline.hasIncome && !baseline.partial ? baseline.incomeCents : null,
    outlierCount: new Set(
      purchases.filter((p) => p.excluded && !p.refund).map((p) => p.key),
    ).size,
    otherCount: new Set(
      purchases
        .filter((p) => p.category === "Other" && !p.refund && !p.excluded)
        .map((p) => p.key),
    ).size,
    otherCents: Math.max(0, totals.get("Other") || 0),
    excludedKeys: [...guide.excludedKeys],
    includedKeys: [...guide.includedKeys],
  };
}
function flowMonthlyBudgetDraft(snapshot, month, choices, guide) {
  if (
    !Number.isSafeInteger(guide.incomeCents) ||
    guide.incomeCents <= 0 ||
    !Number.isSafeInteger(guide.savingsCents) ||
    guide.savingsCents < 0
  )
    throw new Error("Enter your monthly pay and savings amount.");
  const planning = snapshot.flowPlanning || defaultFlowPlanning();
  const next = flowApplySuggestedBudgets(snapshot, month, choices);
  next.flowPlanning = flowCopy(planning);
  const growth = flowEnableGrowth(next.flowPlanning);
  growth.version = 2;
  growth.budgetGuide = { ...flowBudgetGuide(planning), ...guide };
  const capacity = flowBudgetCapacity(
    next.budgetsByMonth[month],
    flowBudgetBillCosts(planning, snapshot.transactions || [], month),
    guide.incomeCents,
    guide.savingsCents,
  );
  if (!capacity.fits)
    throw new Error(
      "These limits and savings need more than your monthly pay.",
    );
  return { snapshot: next, capacity };
}
