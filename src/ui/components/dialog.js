/**
 * MD3 dialog wrapper around the native <dialog> element.
 *
 * - showConfirm({ headline, body, confirmLabel, cancelLabel, danger }) → Promise<boolean>
 * - showAlert({ headline, body, confirmLabel }) → Promise<void>
 * - showPrompt({ headline, body, defaultValue, placeholder }) → Promise<string|null>
 *
 * Replaces window.confirm / window.alert / window.prompt with focus-
 * trapped, keyboard-accessible, MD3-styled dialogs. Promises resolve
 * with the user's choice; cancel returns false / null. ESC and click-
 * on-backdrop close the dialog as cancel.
 */

function makeDialog() {
  const d = document.createElement("dialog");
  d.className = "md-dialog";
  return d;
}

function focusTrap(dialog) {
  const focusable = dialog.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function backdropToCancel(dialog, onCancel) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) onCancel();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    onCancel();
  });
}

function appendStandardLayout(dialog, { headline, body }) {
  if (headline) {
    const h = document.createElement("h2");
    h.className = "md-dialog__headline";
    h.textContent = headline;
    dialog.appendChild(h);
  }
  if (body != null) {
    const p = document.createElement("div");
    p.className = "md-dialog__body";
    if (body instanceof Node) p.appendChild(body);
    else p.textContent = String(body);
    dialog.appendChild(p);
  }
}

function makeButton(label, variant) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `md-button md-button--${variant}`;
  b.textContent = label;
  return b;
}

export function showConfirm({
  headline = "确认",
  body = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = makeDialog();
    appendStandardLayout(dialog, { headline, body });
    const actions = document.createElement("div");
    actions.className = "md-dialog__actions";
    const cancel = makeButton(cancelLabel, "text");
    const confirm = makeButton(confirmLabel, danger ? "filled md-button--danger" : "filled");
    actions.append(cancel, confirm);
    dialog.appendChild(actions);
    document.body.appendChild(dialog);

    const close = (value) => {
      try { dialog.close(); } catch (_) {}
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    backdropToCancel(dialog, () => close(false));
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    focusTrap(dialog);
    confirm.focus();
  });
}

export function showAlert({
  headline = "提示",
  body = "",
  confirmLabel = "知道了",
} = {}) {
  return new Promise((resolve) => {
    const dialog = makeDialog();
    appendStandardLayout(dialog, { headline, body });
    const actions = document.createElement("div");
    actions.className = "md-dialog__actions";
    const ok = makeButton(confirmLabel, "filled");
    actions.appendChild(ok);
    dialog.appendChild(actions);
    document.body.appendChild(dialog);

    const close = () => {
      try { dialog.close(); } catch (_) {}
      dialog.remove();
      resolve();
    };
    ok.addEventListener("click", close);
    backdropToCancel(dialog, close);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    focusTrap(dialog);
    ok.focus();
  });
}

export function showPrompt({
  headline = "请输入",
  body = "",
  defaultValue = "",
  placeholder = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  required = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = makeDialog();
    appendStandardLayout(dialog, { headline, body });

    const wrap = document.createElement("div");
    wrap.style.padding = "12px 24px 0";
    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.style.display = "block";
    input.style.width = "100%";
    input.style.padding = "12px 16px";
    input.style.border = "1px solid var(--md-sys-color-outline)";
    input.style.borderRadius = "var(--md-sys-shape-corner-extra-small)";
    input.style.background = "var(--md-sys-color-surface-container-highest)";
    input.style.color = "var(--md-sys-color-on-surface)";
    wrap.appendChild(input);
    dialog.appendChild(wrap);

    const actions = document.createElement("div");
    actions.className = "md-dialog__actions";
    const cancel = makeButton(cancelLabel, "text");
    const confirm = makeButton(confirmLabel, "filled");
    actions.append(cancel, confirm);
    dialog.appendChild(actions);
    document.body.appendChild(dialog);

    const close = (value) => {
      try { dialog.close(); } catch (_) {}
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => {
      const value = input.value.trim();
      if (required && !value) { input.focus(); return; }
      close(value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirm.click();
      }
    });
    backdropToCancel(dialog, () => close(null));
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    focusTrap(dialog);
    input.focus();
    input.select();
  });
}
