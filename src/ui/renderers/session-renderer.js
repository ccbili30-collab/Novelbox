export function renderSessions(els, sessions, activeSessionId, query, helpers) {
  const { activePath, titleForSession, escapeHtml, formatTime } = helpers;
  const filtered = sessions
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((session) => !query || titleForSession(session).toLowerCase().includes(query));
  els.sessionList.innerHTML = filtered.map((session) => {
    const count = activePath(session).length;
    return `<article class="session-item ${session.id === activeSessionId ? "active" : ""}">
      <button class="session-main" type="button" data-command="switch-session" data-session-id="${session.id}">
        <strong>${escapeHtml(titleForSession(session))}</strong>
        <span>${count} 条 · ${formatTime(session.updatedAt)}</span>
      </button>
      <div class="session-actions">
        <button type="button" data-command="copy-session" data-session-id="${session.id}">复制</button>
        <button type="button" data-command="delete-session" data-session-id="${session.id}">删除</button>
      </div>
    </article>`;
  }).join("") || `<p class="muted">还没有历史会话。</p>`;
}
