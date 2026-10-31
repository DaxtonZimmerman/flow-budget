import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import { MonthlyBuilder } from "./MonthlyBuilder.jsx";
import { BudgetBoard } from "./BudgetBoard.jsx";
import { owner } from "./workspace.js";
class BudgetBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="rb-error" role="alert">
          <p>Couldn’t open your budget. Your saved data stays protected.</p>
          <button
            type="button"
            className="back-button"
            onClick={() => location.reload()}
          >
            Try again
          </button>
          {this.props.onClose && (
            <button
              type="button"
              className="back-button"
              onClick={this.props.onClose}
            >
              Close
            </button>
          )}
        </section>
      );
    return this.props.children;
  }
}
let builderRoot = null,
  builderHost = null,
  invoker = null,
  builderOwner = "";
export function open() {
  if (builderRoot) return;
  if (!flowDemoMode && !window.FlowAuth?.authorized) return;
  invoker = document.activeElement;
  builderOwner = owner();
  builderHost = document.createElement("div");
  builderHost.id = "react-monthly-budget";
  document.body.append(builderHost);
  builderRoot = createRoot(builderHost);
  builderRoot.render(
    <BudgetBoundary onClose={close}>
      <MonthlyBuilder
        month={
          document.querySelector("#budget-month")?.value ||
          flowToday().slice(0, 7)
        }
        onClose={close}
      />
    </BudgetBoundary>,
  );
}
export function close() {
  const root = builderRoot,
    host = builderHost;
  builderRoot = null;
  builderHost = null;
  queueMicrotask(() => {
    root?.unmount();
    host?.remove();
    if (invoker?.isConnected && !document.querySelector("dialog[open]"))
      invoker.focus({ preventScroll: true });
  });
}
function mount() {
  const host = document.querySelector("#monthly-budget-board");
  if (host)
    createRoot(host).render(
      <BudgetBoundary>
        <BudgetBoard openBuilder={open} />
      </BudgetBoundary>,
    );
}
function checkOwner() {
  if (builderRoot && owner() !== builderOwner) close();
}
window.addEventListener("storage", checkOwner);
document.addEventListener("flow-auth-ready", checkOwner);
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
