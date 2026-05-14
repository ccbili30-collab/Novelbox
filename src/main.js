import { clean } from "./utils/text.js";
import { uid } from "./utils/id.js";

const chatList = document.querySelector("#chatList");
const composer = document.querySelector("#composer");
const input = document.querySelector("#messageInput");
const roundToggle = document.querySelector("#roundToggle");

const messages = [
  {
    id: uid("msg"),
    role: "assistant",
    name: "主创",
    content: "我建议把这一章的核心问题压成一句：主角不是被审判，而是在找回被夺走的记忆。",
  },
  {
    id: uid("msg"),
    role: "council",
    name: "设定师",
    content: "诅咒规则可以更具体：每次说出真相，就会失去一个与亲人有关的声音。",
  },
];

function renderMessage(message) {
  const mine = message.role === "user";
  return `
    <article class="message ${mine ? "mine" : ""}">
      <div class="speaker">${mine ? "我" : message.name}</div>
      <div class="bubble">${escapeHtml(message.content)}</div>
    </article>
  `;
}

function render() {
  chatList.innerHTML = messages.map(renderMessage).join("");
  chatList.scrollTop = chatList.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMessage(message) {
  messages.push({ id: uid("msg"), ...message });
  render();
}

composer?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = clean(input?.value);
  if (!text) return;
  input.value = "";
  addMessage({ role: "user", name: "我", content: text });
  window.setTimeout(() => {
    addMessage({
      role: "assistant",
      name: "主创",
      content:
        "圆桌模式已经在 APK 体验版中开放。公开源码保留模块边界，生产圆桌调度和创作者记忆核心仍在私有版本里继续迭代。",
    });
  }, 260);
});

roundToggle?.addEventListener("click", () => {
  document.body.classList.toggle("roundtable-preview-on");
  roundToggle.classList.toggle("active");
});

input?.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
});

render();
