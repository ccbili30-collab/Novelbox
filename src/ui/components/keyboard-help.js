/**
 * Keyboard shortcut help dialog. Press `?` (Shift+/) anywhere outside
 * an input to open. Lists every shortcut the app actually supports,
 * grouped by area. M3-styled via .md-dialog primitives.
 */

const SHORTCUTS = [
  {
    group: "对话",
    items: [
      { keys: ["Ctrl", "Enter"], desc: "发送消息（也支持 ⌘+Enter）" },
      { keys: ["Enter"],          desc: "在输入框内换行" },
      { keys: ["Esc"],            desc: "关闭面板 / 收起 @ 选择器" },
      { keys: ["@"],              desc: "在圆桌模式下打开成员选择" },
    ],
  },
  {
    group: "界面",
    items: [
      { keys: ["?"], desc: "打开此帮助" },
      { keys: ["Tab"], desc: "在按钮 / 输入框之间移动焦点" },
      { keys: ["Shift", "Tab"], desc: "反向移动焦点" },
    ],
  },
  {
    group: "主题",
    items: [
      { keys: ["设置", "→", "外观"], desc: "切换浅色 / 深色 / 跟随系统，或选择种子色" },
    ],
  },
];

function renderKbd(label) {
  const k = document.createElement("kbd");
  k.textContent = label;
  k.className = "md-kbd";
  return k;
}

let _dialog = null;

export function isKeyboardHelpOpen() {
  return Boolean(_dialog && _dialog.open);
}

export function openKeyboardHelp() {
  if (_dialog?.open) return;
  const dialog = document.createElement("dialog");
  dialog.className = "md-dialog md-dialog--keyboard-help";

  const headline = document.createElement("h2");
  headline.className = "md-dialog__headline";
  headline.textContent = "键盘快捷键";
  dialog.appendChild(headline);

  const body = document.createElement("div");
  body.className = "md-dialog__body";
  for (const group of SHORTCUTS) {
    const h = document.createElement("h3");
    h.textContent = group.group;
    h.className = "md-kbd-group-title";
    body.appendChild(h);
    const dl = document.createElement("dl");
    dl.className = "md-kbd-list";
    for (const item of group.items) {
      const dt = document.createElement("dt");
      item.keys.forEach((key, idx) => {
        if (idx > 0) {
          const plus = document.createElement("span");
          plus.className = "md-kbd-plus";
          plus.textContent = "+";
          dt.appendChild(plus);
        }
        dt.appendChild(renderKbd(key));
      });
      const dd = document.createElement("dd");
      dd.textContent = item.desc;
      dl.append(dt, dd);
    }
    body.appendChild(dl);
  }
  dialog.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "md-dialog__actions";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "md-button md-button--filled";
  close.textContent = "知道了";
  close.addEventListener("click", () => {
    try { dialog.close(); } catch (_) {}
    dialog.remove();
    _dialog = null;
  });
  actions.appendChild(close);
  dialog.appendChild(actions);

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close.click();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close.click();
  });

  document.body.appendChild(dialog);
  _dialog = dialog;
  if (typeof dialog.showModal === "function") dialog.showModal();
  close.focus();
}

function isEditingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function bindKeyboardHelpShortcut() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key !== "?" && !(event.key === "/" && event.shiftKey)) return;
    if (isEditingTarget(document.activeElement)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    openKeyboardHelp();
  });
}
