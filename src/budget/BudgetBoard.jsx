import React, { useEffect, useState } from "react";
import {
  BudgetCard,
  BudgetSummary,
  MoneyInput,
  Sheet,
  money,
} from "./components.jsx";
import {
  capture,
  readWorkspace,
  owner,
  saveWorkspace,
  parseMoney,
} from "./workspace.js";
const events = [
  "flow-transaction-updated",
  "flow-transaction-view-refresh",
  "flow-planning-updated",
  "flow-cloud-ready",
  "flow-budgets-updated",
];
export function BudgetBoard({ openBuilder }) {
  const month = getSelectedMonth(),
    [snapshot, setSnapshot] = useState(readWorkspace),
    [editing, setEditing] = useState(null),
    [activity, setActivity] = useState(null),
    [notice, setNotice] = useState(""),
    [removing, setRemoving] = useState(null),
    [undo, setUndo] = useState(null);
  useEffect(() => {
    let previousOwner = owner();
    const refresh = () => {
      if (owner() !== previousOwner) {
        setEditing(null);
        setActivity(null);
        setRemoving(null);
        setUndo(null);
        setNotice("");
        previousOwner = owner();
      }
      setSnapshot(readWorkspace());
    };
    events.forEach((e) => document.addEventListener(e, refresh));
    window.addEventListener("storage", refresh);
    return () => {
      events.forEach((e) => document.removeEventListener(e, refresh));
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const budgets = snapshot.budgetsByMonth?.[month] || snapshot.budgets || [],
    p = snapshot.flowPlanning || defaultFlowPlanning();
  const measured = budgets.map((b) => ({
    budget: b,
    spentCents: Math.round(
      getBudgetSpending(b.category, snapshot.transactions, month) * 100,
    ),
  }));
  function remove(b) {
    try {
      const base = capture(),
        next = flowCopy(base.snapshot);
      next.budgetsByMonth[month] = (
        base.snapshot.budgetsByMonth?.[month] ||
        base.snapshot.budgets ||
        []
      ).filter((r) => r.category !== b.category);
      saveWorkspace(next, base);
      setUndo(b);
      setRemoving(null);
      setNotice("Monthly limit removed.");
    } catch (e) {
      setNotice(e.message);
    }
  }
  return (
    <>
      <header className="budget-header-actions">
        <button
          className="back-button"
          type="button"
          data-new-budget
          onClick={() =>
            setEditing({ base: capture(), category: "", value: "" })
          }
        >
          + Add category
        </button>
        <label className="sr-only" htmlFor="budget-month">
          Choose month
        </label>
        <input
          type="month"
          id="budget-month"
          className="month-button"
          aria-label="Choose month"
          value={month}
          onChange={(e) => {
            if (e.target.value)
              location.href =
                "budgets.html?view=categories&month=" + e.target.value;
          }}
        />
      </header>
      <section className="rb-monthly-intro">
        <div>
          <span className="rb-eyebrow">Monthly budget</span>
          <h3>Choose your monthly limits.</h3>
          <p>Start with recent spending. Adjust what you need.</p>
        </div>
        <button type="button" className="save-button" onClick={openBuilder}>
          Build my budget →
        </button>
      </section>
      <BudgetSummary
        limitCents={measured.reduce(
          (n, r) => n + Math.round(r.budget.limit * 100),
          0,
        )}
        spentCents={measured.reduce((n, r) => n + r.spentCents, 0)}
      />
      <section
        className="budget-page-card rb-monthly-categories"
        data-react-budget
      >
        <div className="section-top">
          <div>
            <p className="small-label">Monthly limits</p>
            <h3>Category budgets</h3>
          </div>
        </div>
        <div id="budget-page-list" className="rb-budget-grid">
          {measured.map(({ budget, spentCents }) => (
            <BudgetCard
              key={budget.category}
              budget={budget}
              spentCents={spentCents}
              onEdit={() =>
                setEditing({
                  base: capture(),
                  category: budget.category,
                  value: budget.limit.toFixed(2),
                })
              }
              onDelete={() => setRemoving(budget)}
              onActivity={() => setActivity(budget.category)}
            />
          ))}
        </div>
        {budgets.length === 0 && (
          <div className="rb-empty">
            <span aria-hidden="true">◒</span>
            <h3>Your first month starts here.</h3>
            <p>Build a starting budget or add a category.</p>
            <button type="button" className="save-button" onClick={openBuilder}>
              Build my budget
            </button>
          </div>
        )}
      </section>
      {notice && (
        <p role="status" className="rb-footnote">
          {notice}
          {undo && (
            <button
              type="button"
              className="inline-link"
              onClick={() => {
                try {
                  const base = capture();
                  if (
                    (
                      base.snapshot.budgetsByMonth?.[month] ||
                      base.snapshot.budgets ||
                      []
                    ).some((b) => b.category === undo.category)
                  )
                    throw new Error("This category already has a limit.");
                  saveWorkspace(
                    flowApplySuggestedBudgets(base.snapshot, month, [
                      {
                        category: undo.category,
                        cents: Math.round(undo.limit * 100),
                      },
                    ]),
                    base,
                  );
                  setUndo(null);
                  setNotice("Monthly limit restored.");
                } catch (e) {
                  setNotice(e.message);
                }
              }}
            >
              {" "}
              Undo
            </button>
          )}
        </p>
      )}
      {removing && (
        <Sheet
          title={"Remove " + removing.category + " budget?"}
          onClose={() => setRemoving(null)}
        >
          <div className="rb-body">
            <p>Your transactions stay. Only this month’s limit is removed.</p>
          </div>
          <footer className="rb-footer">
            <button
              type="button"
              className="back-button"
              onClick={() => setRemoving(null)}
            >
              Keep budget
            </button>
            <button
              type="button"
              className="save-button flow-danger"
              onClick={() => remove(removing)}
            >
              Remove budget
            </button>
          </footer>
        </Sheet>
      )}
      {editing && (
        <CategoryEditor
          value={editing}
          planning={p}
          onClose={() => setEditing(null)}
        />
      )}
      {activity && (
        <Sheet
          title={
            activity +
            " · " +
            new Date(month + "-01T12:00:00").toLocaleDateString("en-US", {
              month: "long",
            })
          }
          onClose={() => setActivity(null)}
        >
          <div className="rb-body rb-purchases">
            {categoryActivity(snapshot.transactions, activity, month).map(
              ({ transaction: t, cents, split }) => (
                <button
                  type="button"
                  className="rb-activity-row"
                  key={t.id}
                  onClick={() => window.FlowTransactionDetails?.open(t.id)}
                >
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.date}
                      {split ? " · Split" : ""}
                      {cents < 0 ? " · Refund" : ""}
                    </small>
                  </span>
                  <strong>
                    {cents < 0 ? "−" : ""}
                    {money(Math.abs(cents))} ›
                  </strong>
                </button>
              ),
            )}
            {categoryActivity(snapshot.transactions, activity, month).length ===
              0 && <p>No posted purchases in this category yet.</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
function CategoryEditor({ value, planning, onClose }) {
  const [category, setCategory] = useState(value.category),
    [amount, setAmount] = useState(value.value),
    [error, setError] = useState("");
  function submit(e) {
    e.preventDefault();
    try {
      const cents = parseMoney(amount);
      if (!category || !cents)
        throw new Error("Choose a category and a limit above zero.");
      const next = flowApplySuggestedBudgets(
        value.base.snapshot,
        getSelectedMonth(),
        [{ category, cents }],
      );
      saveWorkspace(next, value.base);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Sheet
      title={value.category ? "Edit " + value.category : "Add a category"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="rb-body">
          <label className="rb-field">
            Category
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={Boolean(value.category)}
              required
            >
              <option value="">Choose a category</option>
              {flowCategories(planning)
                .filter((c) => !["Income", "Salary"].includes(c))
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
          <MoneyInput
            label="Monthly limit"
            value={amount}
            onChange={setAmount}
            required
            min="0.01"
            autoFocus
          />
          {error && (
            <p className="rb-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="rb-footer">
          <button type="button" className="back-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="save-button">
            Save budget
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
