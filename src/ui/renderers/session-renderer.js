export function renderSessions(els, sessions, activeSessionId, query, helpers) {
  const { activePath, titleForSession, escapeHtml, formatTime } = helpers;
  const filtered = sessions
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((session) => !query || titleForSession(session).toLowerCase().includes(query));
  els.sessionList.innerHTML = filtered.map((session) => {
    const count = activePath(session).length;
    const isActive = session.id === activeSessionId;
    return `<article class="session-item ${isActive ? "active" : ""}" ${isActive ? `aria-current="true"` : ""}>
      <button class="session-main" type="button" data-command="switch-session" data-session-id="${session.id}">
        <span class="session-title-row">
          <strong>${escapeHtml(titleForSession(session))}</strong>
          ${isActive ? `<em class="session-current-chip">当前</em>` : ""}
        </span>
        <span class="session-meta">${count} 条 · ${formatTime(session.updatedAt)}</span>
      </button>
      <div class="session-actions">
        <button type="button" data-command="rename-session" data-session-id="${session.id}">重命名</button>
        <button type="button" data-command="copy-session" data-session-id="${session.id}">复制</button>
        <button type="button" data-command="export-session" data-session-id="${session.id}">导出</button>
        <button type="button" data-command="delete-session" data-session-id="${session.id}">删除</button>
      </div>
    </article>`;
  }).join("") || `<p class="muted">还没有历史会话。</p>`;
}
