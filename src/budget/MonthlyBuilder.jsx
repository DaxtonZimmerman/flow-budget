import React, { useEffect, useMemo, useState } from "react";
import { Sheet, MoneyInput, money } from "./components.jsx";
import { capture, saveWorkspace, parseMoney, owner } from "./workspace.js";
const asInput = (cents) => (cents == null ? "" : (cents / 100).toFixed(2));
const prettyDate = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
export function MonthlyBuilder({ month, onClose }) {
  const [base, setBase] = useState(capture),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [changed, setChanged] = useState(false);
  useEffect(() => {
    const detect = () => {
      if (owner() !== base.owner) return onClose();
      setChanged(JSON.stringify(getFlowSnapshot()) !== base.stamp);
    };
    const events = [
      "flow-transaction-updated",
      "flow-planning-updated",
      "flow-cloud-ready",
    ];
    events.forEach((e) => document.addEventListener(e, detect));
    return () => events.forEach((e) => document.removeEventListener(e, detect));
  }, [base, onClose]);
  const p = base.snapshot.flowPlanning || defaultFlowPlanning(),
    guide = flowBudgetGuide(p);
  const [excluded, setExcluded] = useState(() => new Set(guide.excludedKeys)),
    [included, setIncluded] = useState(() => new Set(guide.includedKeys));
  const model = useMemo(
    () =>
      flowMonthlyBudgetModel(base.snapshot, month, base.day, {
        excludedKeys: [...excluded],
        includedKeys: [...included],
      }),
    [base, month, excluded, included],
  );
  const [income, setIncome] = useState(() =>
    asInput(guide.incomeCents ?? model.incomeCents),
  );
  const [savingsRate, setSavingsRate] = useState(() =>
    guide.savingsPercent === null && guide.savingsCents !== null
      ? null
      : (guide.savingsPercent ?? 25),
  );
  const [savings, setSavings] = useState(() => asInput(guide.savingsCents));
  const [edits, setEdits] = useState({}),
    [picks, setPicks] = useState({}),
    [purchaseCategory, setPurchaseCategory] = useState(null);
  const incomeCents = parseMoney(income),
    savingsCents =
      savingsRate === null
        ? parseMoney(savings)
        : incomeCents === null
          ? null
          : Math.round((incomeCents * savingsRate) / 100);
  const rows = model.rows.map((row) => ({
    ...row,
    value: Object.hasOwn(edits, row.category)
      ? edits[row.category]
      : asInput(row.suggestedCents ?? row.existingCents),
    picked: Object.hasOwn(picks, row.category)
      ? picks[row.category]
      : !row.uncategorized &&
        (row.suggestedCents !== null || row.existingCents !== null),
  }));
  const choices = rows
    .filter((r) => r.picked)
    .map((r) => ({ category: r.category, cents: parseMoney(r.value) }));
  let next = null,
    capacity = null,
    calculationError = "";
  const validChoices =
    choices.length > 0 && choices.every((c) => c.cents !== null);
  if (validChoices) {
    try {
      next = flowApplySuggestedBudgets(base.snapshot, month, choices);
      capacity = flowBudgetCapacity(
        next.budgetsByMonth[month],
        flowBudgetBillCosts(p, base.snapshot.transactions, month),
        incomeCents || 0,
        savingsCents || 0,
      );
    } catch (error) {
      calculationError = error.message;
    }
  }
  function goNext() {
    setError("");
    if (step === 0 && (!(incomeCents > 0) || savingsCents === null)) {
      setError("Enter your monthly take-home pay and savings amount.");
      return;
    }
    if (step === 1 && !validChoices) {
      setError("Choose a category and enter its monthly limit.");
      return;
    }
    setStep((s) => Math.min(2, s + 1));
  }
  function excludePurchase(key, checked) {
    const a = new Set(excluded),
      b = new Set(included);
    if (checked) {
      a.add(key);
      b.delete(key);
    } else {
      a.delete(key);
      b.add(key);
    }
    setExcluded(a);
    setIncluded(b);
    setError("");
  }
  function refresh() {
    if (owner() !== base.owner) return onClose();
    setBase(capture());
    setChanged(false);
    setError("");
  }
  function save() {
    try {
      const result = flowMonthlyBudgetDraft(base.snapshot, month, choices, {
        excludedKeys: [...excluded],
        includedKeys: [...included],
        incomeCents,
        savingsCents,
        savingsPercent: savingsRate,
      });
      saveWorkspace(result.snapshot, base);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }
  const monthName = new Date(month + "-01T12:00:00").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  return (
    <Sheet
      title={
        purchaseCategory
          ? purchaseCategory + " purchases"
          : "Build your monthly budget"
      }
      onClose={onClose}
      resetKey={purchaseCategory || step}
    >
      {changed && (
        <div className="rb-notice" role="status">
          Your activity changed.{" "}
          <button className="inline-link" type="button" onClick={refresh}>
            Refresh amounts
          </button>
        </div>
      )}
      {purchaseCategory ? (
        <>
          <div className="rb-body">
            <button
              className="inline-link"
              type="button"
              onClick={() => setPurchaseCategory(null)}
            >
              ‹ Back to categories
            </button>
            <p className="rb-subtitle">
              {prettyDate(model.from)}–{prettyDate(model.through)} · Leave out
              purchases you saved up for. This changes suggestions only.
            </p>
            <div className="rb-purchases">
              {model.purchases
                .filter((t) => t.category === purchaseCategory)
                .map((t, i) => (
                  <article key={t.key + ":" + i} className="rb-purchase">
                    <div>
                      <strong>{t.name}</strong>
                      <span>
                        {prettyDate(t.date)}
                        {t.refund ? " · Refund" : ""}
                        {t.split ? " · Split" : ""}
                      </span>
                    </div>
                    <strong>
                      {t.refund ? "−" : ""}
                      {money(t.cents)}
                    </strong>
                    {!t.refund && (
                      <label className="rb-oneoff">
                        <input
                          type="checkbox"
                          checked={t.excluded}
                          onChange={(e) =>
                            excludePurchase(t.key, e.target.checked)
                          }
                        />
                        {t.split ? "Whole purchase is one-off" : "One-off"}
                      </label>
                    )}
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => window.FlowTransactionDetails?.open(t.id)}
                    >
                      Edit category
                    </button>
                  </article>
                ))}
            </div>
          </div>
          <footer className="rb-footer">
            <button
              className="save-button"
              type="button"
              onClick={() => setPurchaseCategory(null)}
            >
              Done
            </button>
          </footer>
        </>
      ) : (
        <>
          <div
            className="rb-progress"
            aria-label={"Step " + (step + 1) + " of 3"}
          >
            {["Your pay", "Categories", "Your plan"].map((label, i) => (
              <span key={label} className={i <= step ? "is-active" : ""}>
                {label}
              </span>
            ))}
          </div>
          <div className="rb-body">
            {step === 0 && (
              <>
                <p className="rb-eyebrow">{monthName}</p>
                <h3 className="rb-heading">Start with your take-home pay.</h3>
                <p className="rb-subtitle">
                  What usually reaches your bank each month?
                </p>
                <MoneyInput
                  label="Monthly take-home pay"
                  value={income}
                  onChange={(v) => {
                    setIncome(v);
                    setError("");
                  }}
                  autoFocus
                  required
                />
                <fieldset className="rb-savings">
                  <legend>Keep some for savings</legend>
                  <div className="rb-chips">
                    {[10, 20, 25].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={savingsRate === rate}
                        onClick={() => setSavingsRate(rate)}
                      >
                        {rate}%
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={savingsRate === null}
                      onClick={() => {
                        setSavings(asInput(savingsCents));
                        setSavingsRate(null);
                      }}
                    >
                      Custom
                    </button>
                  </div>
                  {savingsRate === null ? (
                    <MoneyInput
                      label="Monthly savings"
                      value={savings}
                      onChange={setSavings}
                    />
                  ) : (
                    <p className="rb-savings-total">
                      {savingsCents === null
                        ? "Enter your pay above"
                        : money(savingsCents) + " set aside each month"}
                    </p>
                  )}
                </fieldset>
              </>
            )}
            {step === 1 && (
              <>
                <h3 className="rb-heading">Your recent spending.</h3>
                <p className="rb-subtitle">
                  {model.complete
                    ? "Based on your latest 30 days of recorded spending."
                    : model.stale
                      ? "Your recent bank history is still catching up. Choose your limits."
                      : "Only " +
                        model.days +
                        " days of history. Choose limits; Flow won’t stretch a short sample into a month."}
                </p>
                <div className="rb-history-period">
                  {prettyDate(model.from)}–{prettyDate(model.through)}
                  {model.outlierCount > 0
                    ? " · " +
                      model.outlierCount +
                      " one-off" +
                      (model.outlierCount === 1 ? "" : "s") +
                      " left out"
                    : ""}
                </div>
                {rows.length === 0 && (
                  <div className="rb-empty">
                    <h4>No recent purchases yet</h4>
                    <p>You can still set your own limits.</p>
                    <a href="budgets.html?view=categories">Add a category</a>
                  </div>
                )}
                <div className="rb-builder-rows">
                  {rows.map((r) => (
                    <section
                      key={r.category}
                      className={
                        "rb-builder-row" +
                        (r.uncategorized ? " rb-unsorted" : "")
                      }
                    >
                      <div className="rb-builder-row-head">
                        <label className="rb-pick">
                          <input
                            type="checkbox"
                            checked={r.picked}
                            onChange={(e) =>
                              setPicks({
                                ...picks,
                                [r.category]: e.target.checked,
                              })
                            }
                          />
                          <strong>{r.category}</strong>
                        </label>
                        <button
                          className="inline-link"
                          type="button"
                          onClick={() => setPurchaseCategory(r.category)}
                        >
                          See purchases ›
                        </button>
                      </div>
                      <p>
                        {r.uncategorized
                          ? "Mixed purchases—sort these or choose your own limit."
                          : r.canSuggest
                            ? "Recorded " +
                              money(Math.max(0, r.observedCents)) +
                              " over 30 days."
                            : model.stale
                              ? "Older history; choose an amount."
                              : "A full month isn’t available yet."}
                      </p>
                      <MoneyInput
                        label={r.category + " monthly limit"}
                        value={r.value}
                        disabled={!r.picked}
                        onChange={(v) =>
                          setEdits({ ...edits, [r.category]: v })
                        }
                        placeholder="Choose an amount"
                      />
                      {!r.picked && r.existingCents !== null && (
                        <small>
                          Your current {money(r.existingCents)} limit stays.
                        </small>
                      )}
                      {r.observedCents < 0 && (
                        <small>
                          Refunds exceeded purchases in this sample.
                        </small>
                      )}
                    </section>
                  ))}
                </div>
                <p className="rb-footnote">
                  Pending payments and transfers stay out. Refunds reduce
                  spending.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="rb-eyebrow">{monthName}</p>
                <h3 className="rb-heading">Here’s your monthly plan.</h3>
                <section
                  className={
                    "rb-result" +
                    (capacity && !capacity.fits ? " rb-result-over" : "")
                  }
                >
                  <span>
                    {capacity?.fits ? "After your plan" : "More than your pay"}
                  </span>
                  <strong>
                    {capacity
                      ? money(Math.abs(capacity.afterSavingsCents))
                      : "—"}
                  </strong>
                  <small>
                    {capacity?.fits
                      ? "left for extra spending or saving"
                      : "Adjust your limits or savings below"}
                  </small>
                </section>
                <dl className="rb-math">
                  <div>
                    <dt>Monthly take-home pay</dt>
                    <dd>{money(incomeCents || 0)}</dd>
                  </div>
                  <div>
                    <dt>Category limits</dt>
                    <dd>{money(capacity?.limitsCents || 0)}</dd>
                  </div>
                  <div>
                    <dt>Bills outside those limits</dt>
                    <dd>{money(capacity?.outsideBillsCents || 0)}</dd>
                  </div>
                  <div>
                    <dt>Savings</dt>
                    <dd>{money(savingsCents || 0)}</dd>
                  </div>
                </dl>
                <div className="rb-review-limits">
                  {next?.budgetsByMonth[month].map((r) => (
                    <div key={r.category}>
                      <span>
                        {r.category}
                        {!rows.some(
                          (x) => x.category === r.category && x.picked,
                        )
                          ? " · kept"
                          : ""}
                      </span>
                      <strong>{money(Math.round(r.limit * 100))}</strong>
                    </div>
                  ))}
                </div>
                {model.otherCount > 0 &&
                  !rows.some((r) => r.category === "Other" && r.picked) && (
                    <p className="rb-notice">
                      {model.otherCount} Other purchases still need sorting.
                      Choose a limit if you want one; any existing Other limit
                      stays.
                    </p>
                  )}
                <p className="rb-footnote">
                  Only your {monthName} category limits change. Your payday plan
                  stays as it is.
                </p>
              </>
            )}
            {(error || calculationError) && (
              <div className="rb-error" role="alert">
                <p>{error || calculationError}</p>
                {/Refresh/.test(error) && (
                  <button
                    className="inline-link"
                    type="button"
                    onClick={refresh}
                  >
                    Refresh amounts
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="rb-footer">
            {step > 0 ? (
              <button
                className="back-button"
                type="button"
                onClick={() => {
                  setStep((s) => s - 1);
                  setError("");
                }}
              >
                Back
              </button>
            ) : (
              <span>Change it any time</span>
            )}
            {step < 2 ? (
              <button className="save-button" type="button" onClick={goNext}>
                Continue →
              </button>
            ) : (
              <button
                className="save-button"
                type="button"
                disabled={!capacity?.fits || changed}
                onClick={save}
              >
                Use this budget
              </button>
            )}
          </footer>
        </>
      )}
    </Sheet>
  );
}
