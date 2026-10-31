import React, { useEffect, useMemo, useState } from "react";
import { Sheet, MoneyInput, MonthlyReview, money } from "./components.jsx";
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
    [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => {
      if (owner() !== base.owner) return onClose();
      const latest = capture();
      if (latest.stamp !== base.stamp || latest.day !== base.day)
        setBase(latest);
    };
    const events = [
      "flow-transaction-updated",
      "flow-planning-updated",
      "flow-cloud-ready",
      "flow-budgets-updated",
    ];
    events.forEach((e) => document.addEventListener(e, refresh));
    return () =>
      events.forEach((e) => document.removeEventListener(e, refresh));
  }, [base, onClose]);
  const planning = base.snapshot.flowPlanning || defaultFlowPlanning(),
    guide = flowBudgetGuide(planning);
  const [excluded, setExcluded] = useState(() => new Set(guide.excludedKeys)),
    [included, setIncluded] = useState(() => new Set(guide.includedKeys));
  const [edits, setEdits] = useState({}),
    [picks, setPicks] = useState({}),
    [purchaseCategory, setPurchaseCategory] = useState(null);
  const model = useMemo(
    () =>
      flowMonthlyBudgetModel(base.snapshot, month, base.day, {
        excludedKeys: [...excluded],
        includedKeys: [...included],
      }),
    [base, month, excluded, included],
  );
  const rows = model.rows.map((row) => ({
    ...row,
    value: Object.hasOwn(edits, row.category)
      ? edits[row.category]
      : asInput(row.suggestedCents ?? row.existingCents),
    picked: Object.hasOwn(picks, row.category)
      ? picks[row.category]
      : row.existingCents !== null ||
        (!row.uncategorized && row.suggestedCents > 0),
  }));
  const choices = rows
    .filter((r) => r.picked)
    .map((r) => ({ category: r.category, cents: parseMoney(r.value) }));
  const valid =
    choices.length > 0 && choices.every((c) => c.cents !== null && c.cents > 0);
  let preview = null,
    calculationError = "";
  if (valid)
    try {
      preview = flowMonthlyBudgetDraft(base.snapshot, month, choices, {
        excludedKeys: [...excluded],
        includedKeys: [...included],
      });
    } catch (e) {
      calculationError = e.message;
    }
  function next() {
    if (!valid || calculationError) {
      setError(
        calculationError || "Choose a category and enter a limit above zero.",
      );
      return;
    }
    setError("");
    setStep(1);
  }
  function save() {
    try {
      const result = flowMonthlyBudgetDraft(base.snapshot, month, choices, {
        excludedKeys: [...excluded],
        includedKeys: [...included],
      });
      saveWorkspace(result.snapshot, base);
      onClose();
    } catch (e) {
      setError(e.message);
    }
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
  const monthName = new Date(month + "-01T12:00:00").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  return (
    <Sheet
      title={
        purchaseCategory
          ? purchaseCategory + " purchases"
          : step === 0
            ? "Choose your categories"
            : "Your monthly budget"
      }
      onClose={onClose}
      resetKey={purchaseCategory || step}
    >
      {purchaseCategory ? (
        <>
          <div className="rb-body">
            <button
              type="button"
              className="inline-link"
              onClick={() => setPurchaseCategory(null)}
            >
              ‹ Back to categories
            </button>
            <p className="rb-subtitle">
              {prettyDate(model.from)}–{prettyDate(model.through)} · One-offs
              stay out of suggestions.
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
              type="button"
              className="save-button"
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
            aria-label={"Step " + (step + 1) + " of 2"}
          >
            {["Choose categories", "Save budget"].map((label, i) => (
              <span key={label} className={i <= step ? "is-active" : ""}>
                {label}
              </span>
            ))}
          </div>
          {step === 0 ? (
            <>
              <div className="rb-body">
                <p className="rb-eyebrow">{monthName}</p>
                <h3 className="rb-heading">Budget what matters to you.</h3>
                <p className="rb-subtitle">
                  Pick your categories. Adjust any suggested amount.
                </p>
                <div className="rb-history-period">
                  {model.complete
                    ? "Latest 30 days"
                    : model.stale
                      ? "Older history — choose your amounts"
                      : model.days +
                        " days of history — choose your amounts"}{" "}
                  · {prettyDate(model.from)}–{prettyDate(model.through)}
                </div>
                <div className="rb-builder-rows">
                  {rows.map((r) => (
                    <section
                      key={r.category}
                      className={
                        "rb-builder-row" + (!r.picked ? " rb-not-selected" : "")
                      }
                    >
                      <div className="rb-builder-row-head">
                        <label className="rb-pick">
                          <input
                            type="checkbox"
                            checked={r.picked}
                            onChange={(e) => {
                              setPicks({
                                ...picks,
                                [r.category]: e.target.checked,
                              });
                              setError("");
                            }}
                          />
                          <strong>{r.category}</strong>
                        </label>
                        <button
                          type="button"
                          className="inline-link"
                          onClick={() => setPurchaseCategory(r.category)}
                        >
                          See purchases ›
                        </button>
                      </div>
                      <p>
                        {r.uncategorized
                          ? "Optional · choose your own amount."
                          : r.canSuggest
                            ? "Suggested " +
                              money(r.suggestedCents) +
                              " · based on recent spending."
                            : r.existingCents !== null
                              ? "Your current monthly limit."
                              : "Choose your monthly limit."}
                      </p>
                      {r.picked && (
                        <MoneyInput
                          label={r.category + " monthly limit"}
                          value={r.value}
                          onChange={(v) => {
                            setEdits({ ...edits, [r.category]: v });
                            setError("");
                          }}
                          placeholder="Choose an amount"
                        />
                      )}
                    </section>
                  ))}
                </div>
                <p className="rb-footnote">
                  Only checked categories will have a limit for {monthName}.
                </p>
                {error && (
                  <p className="rb-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <footer className="rb-footer">
                <span>{choices.length} selected</span>
                <button type="button" className="save-button" onClick={next}>
                  Continue →
                </button>
              </footer>
            </>
          ) : (
            <MonthlyReview
              monthName={monthName}
              choices={choices}
              capacity={preview?.capacity}
              valid={valid && Boolean(preview)}
              error={error || calculationError}
              onBack={() => {
                setStep(0);
                setError("");
              }}
              onSave={save}
              onRefresh={() => {
                setBase(capture());
                setError("");
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
