import React, { useId, useLayoutEffect, useRef } from "react";
export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function MoneyInput({ label, value, onChange, ...props }) {
  return (
    <label className="rb-money-field">
      <span>{label}</span>
      <span className="rb-money-input">
        <span aria-hidden="true">$</span>
        <input
          aria-label={label}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      </span>
    </label>
  );
}
export function Sheet({
  title,
  children,
  onClose,
  className = "",
  resetKey = 0,
}) {
  const titleId = useId(),
    ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const d = ref.current;
    const closed = () => close.current();
    d.addEventListener("close", closed);
    d.showModal();
    return () => d.removeEventListener("close", closed);
  }, []);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.scrollTop = 0;
    dialog.querySelector("h2")?.focus({ preventScroll: true });
  }, [resetKey]);
  return (
    <dialog
      ref={ref}
      className={"rb-dialog transaction-details-dialog " + className}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            ref.current.close();
        }
      }}
    >
      <header className="rb-dialog-head">
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close"
          onClick={() => ref.current.close()}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function BudgetSummary({ limitCents, spentCents }) {
  const left = limitCents - spentCents;
  return (
    <section className="rb-summary" aria-label="Monthly budget totals">
      <div>
        <span>Total budget</span>
        <strong id="budget-total">{money(limitCents)}</strong>
      </div>
      <div>
        <span>Spent in budgets</span>
        <strong id="budget-spent">{money(spentCents)}</strong>
      </div>
      <div className={left < 0 ? "rb-over" : ""}>
        <span id="budget-remaining-label">
          {left < 0 ? "Over budget" : "Remaining"}
        </span>
        <strong id="budget-remaining">{money(Math.abs(left))}</strong>
      </div>
    </section>
  );
}
export function BudgetCard({
  budget,
  spentCents,
  onEdit,
  onDelete,
  onActivity,
}) {
  const limit = Math.round(budget.limit * 100),
    left = limit - spentCents;
  return (
    <article className="rb-budget-card">
      <div className="rb-card-top">
        <span
          className={"rb-symbol rb-symbol-" + budget.category.toLowerCase()}
          aria-hidden="true"
        >
          {{
            Food: "◒",
            Transport: "↗",
            Entertainment: "♫",
            Shopping: "▱",
            Bills: "≡",
          }[budget.category] || "○"}
        </span>
        <span className={left < 0 ? "rb-status rb-over" : "rb-status"}>
          {left < 0 ? "Over limit" : "Within limit"}
        </span>
      </div>
      <button type="button" className="rb-category-title" onClick={onActivity}>
        {budget.category}
        <span aria-hidden="true">›</span>
      </button>
      <p>
        {money(spentCents)} of {money(limit)}
      </p>
      <strong className="rb-card-amount">
        {money(Math.abs(left))}
        <small>{left < 0 ? "over limit" : "left"}</small>
      </strong>
      <progress
        max={Math.max(1, limit)}
        value={Math.min(limit, Math.max(0, spentCents))}
        aria-label={budget.category + " budget used"}
      />
      <footer>
        <button className="inline-link" type="button" onClick={onActivity}>
          See purchases
        </button>
        <div>
          <button className="inline-link" type="button" onClick={onEdit}>
            Edit
          </button>
          <button
            className="inline-link rb-delete"
            type="button"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </footer>
    </article>
  );
}
