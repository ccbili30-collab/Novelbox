/**
 * Renders the history panel session list.
 *
 * Markup follows M3 list-item pattern: leading icon avatar, two-line
 * headline + supporting text, trailing icon-button row for actions.
 * Active session pulls primary-container tone per M3 selected state.
 */

const ICON_DEFAULT = "chat_bubble";
const ICON_ROUNDTABLE = "groups";

export function renderSessions(els, sessions, activeSessionId, query, helpers) {
  const { activePath, titleForSession, escapeHtml, formatTime } = helpers;
  const q = (query || "").trim().toLowerCase();
  const filtered = sessions
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((session) => !q || titleForSession(session).toLowerCase().includes(q));

  if (!filtered.length) {
    els.sessionList.innerHTML = renderEmptyState(q);
    return;
  }
  els.sessionList.innerHTML = filtered.map((session) => {
    const count = activePath(session).length;
    const isRoundtable = Boolean(session?.roundtable?.enabled);
    const icon = isRoundtable ? ICON_ROUNDTABLE : ICON_DEFAULT;
    const isActive = session.id === activeSessionId;
    const updated = session.updatedAt ? formatTime(session.updatedAt) : "刚刚";
    return `<article class="session-card ${isActive ? "is-active" : ""}" data-session-id="${session.id}">
      <button class="session-card__main" type="button" data-command="switch-session" data-session-id="${session.id}" aria-current="${isActive ? "true" : "false"}">
        <span class="session-card__avatar md-icon" aria-hidden="true">${icon}</span>
        <span class="session-card__copy">
          <strong class="session-card__title">${escapeHtml(titleForSession(session))}</strong>
          <span class="session-card__meta">
            <span class="session-card__count">${count} 条</span>
            <span class="session-card__sep" aria-hidden="true">·</span>
            <span class="session-card__time">${escapeHtml(updated)}</span>
            ${isRoundtable ? '<span class="md-badge session-card__pill">圆桌</span>' : ""}
          </span>
        </span>
        ${isActive ? '<span class="session-card__active-mark md-icon md-icon--sz-20" aria-hidden="true">check</span>' : ""}
      </button>
      <div class="session-card__actions">
        <button class="md-icon-button" type="button" data-command="rename-session" data-session-id="${session.id}" aria-label="重命名" title="重命名"><span class="md-icon md-icon--sz-20" aria-hidden="true">edit</span></button>
        <button class="md-icon-button" type="button" data-command="copy-session" data-session-id="${session.id}" aria-label="复制" title="复制"><span class="md-icon md-icon--sz-20" aria-hidden="true">content_copy</span></button>
        <button class="md-icon-button" type="button" data-command="export-session" data-session-id="${session.id}" aria-label="导出" title="导出"><span class="md-icon md-icon--sz-20" aria-hidden="true">file_download</span></button>
        <button class="md-icon-button md-icon-button--danger" type="button" data-command="delete-session" data-session-id="${session.id}" aria-label="删除" title="删除"><span class="md-icon md-icon--sz-20" aria-hidden="true">delete</span></button>
      </div>
    </article>`;
  }).join("");
}

function renderEmptyState(query) {
  if (query) {
    return `<div class="session-empty">
      <span class="md-icon md-icon--sz-40" aria-hidden="true">search_off</span>
      <strong>没有匹配的会话</strong>
      <span class="muted">换个关键词试试，或新建会话开始记录。</span>
    </div>`;
  }
  return `<div class="session-empty">
    <span class="md-icon md-icon--sz-40" aria-hidden="true">forum</span>
    <strong>还没有历史会话</strong>
    <span class="muted">点击上方“新建会话”开始第一个圆桌或对话。</span>
  </div>`;
}
