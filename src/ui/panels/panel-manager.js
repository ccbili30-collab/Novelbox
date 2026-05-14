export function createPanelManager(els, hooks = {}) {
  let activePanel = null;

  function showPanel(name) {
    activePanel = name;
    els.backdrop.hidden = false;
    els.historyPanel.hidden = name !== "history";
    els.settingsPanel.hidden = name !== "settings";
    els.novelPanel.hidden = name !== "novel";
    els.contextPanel.hidden = name !== "context";
    if (els.workspacePanel) els.workspacePanel.hidden = name !== "workspace";
    if (els.roundtablePanel) els.roundtablePanel.hidden = name !== "roundtable";
    hooks.onShow?.(name);
  }

  function closePanels() {
    activePanel = null;
    els.backdrop.hidden = true;
    els.historyPanel.hidden = true;
    els.settingsPanel.hidden = true;
    els.novelPanel.hidden = true;
    els.contextPanel.hidden = true;
    if (els.workspacePanel) els.workspacePanel.hidden = true;
    if (els.roundtablePanel) els.roundtablePanel.hidden = true;
    hooks.onClose?.();
  }

  function getActivePanel() {
    return activePanel;
  }

  return { showPanel, closePanels, getActivePanel };
}
