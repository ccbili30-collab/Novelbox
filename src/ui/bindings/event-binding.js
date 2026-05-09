export function bindCommandDelegation(doc, renderMenu, getActiveMenuNodeId, setActiveMenuNodeId, handleCommand) {
  doc.addEventListener("click", (event) => {
    const target = event.target.closest("[data-command]");
    if (!target) {
      if (getActiveMenuNodeId() && !event.target.closest(".message-menu")) {
        setActiveMenuNodeId(null);
        renderMenu();
      }
      return;
    }
    event.preventDefault();
    handleCommand(target.dataset.command, target);
  });
}
