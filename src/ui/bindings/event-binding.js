export function bindCommandDelegation(doc, renderMenu, getActiveMenuNodeId, setActiveMenuNodeId, handleCommand) {
  doc.addEventListener("click", (event) => {
    if (event.target.closest("[data-command-skip]")) return;
    const target = event.target.closest("[data-command]");
    if (!target) {
      if (getActiveMenuNodeId() && !event.target.closest(".message-menu")) {
        setActiveMenuNodeId(null);
        renderMenu();
      }
      return;
    }
    event.preventDefault();
    handleCommand(target.dataset.command, target, event);
  });
}
