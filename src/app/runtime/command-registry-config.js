/**
 * Command registry config — pure data describing every data-command
 * that the bottom of main.js used to wire inline. The registry
 * implementation itself lives in src/app/command-registry.js; this
 * module just produces the route map it consumes.
 *
 * Usage:
 *   const handleCommand = createCommandRegistry(buildCommandMap({
 *     showPanel, openSettingsPanel, openSettingsPage, ...
 *     // every handler the routes reference
 *   }));
 *
 * Any handler missing from `handlers` becomes a silent no-op so a
 * partially-wired runtime (e.g. a unit test) doesn't crash on click.
 */

function safe(fn) {
  if (typeof fn === "function") return fn;
  return () => {};
}

export function buildCommandMap(handlers = {}) {
  const h = handlers;
  const _ = (name) => safe(h[name]);

  // Data-only ahead. Ordered roughly by semantic group so future
  // teardown can pull a sub-section into a tighter feature module.
  return {
    /* === Navigation === */
    "open-history":          () => _("showPanel")("history"),
    "open-keyboard-help":    () => _("openKeyboardHelp")(),
    "open-settings":         () => _("openSettingsPanel")(),
    "settings-home":         () => _("openSettingsPage")("home"),
    "open-settings-page":    (target) => _("openSettingsPage")(target.dataset.settingsPage),
    "open-workspace":        () => _("showPanel")("workspace"),
    "open-novel":            () => _("showPanel")("novel"),
    "open-context":          () => _("showPanel")("context"),
    "open-search":           () => _("showPanel")("history"),
    "close-panels":          () => _("closePanels")(),

    /* === Creators === */
    "back-creators-list":         () => _("closeCreatorDetail")(),
    "open-creator-detail":        (target) => _("openCreatorDetail")(target.dataset.creatorId),
    "open-creator-config":        (target) => _("openAssistantConfig")(
      target.dataset.creatorId,
      { mode: target.dataset.creatorId === safe(h.getPrimaryCreatorId)() ? "creator" : "member" }
    ),
    "open-creator-private-session": (target) => _("openCreatorPrivateSession")(target.dataset.creatorId),
    "open-creator-roundtable":      (target) => _("openCreatorRoundtable")(target.dataset.sessionId),
    "remove-creator-from-roundtable": (target) => _("removeCreatorFromRoundtable")(target.dataset.sessionId, target.dataset.creatorId),
    "rename-creator-memory":        (target) => _("renameCreatorMemory")(target.dataset.creatorId),
    "query-creator-memory":         (target) => _("queryCreatorMemory")(target.dataset.creatorId),
    "clear-creator-memory-lookup":  (target) => _("clearCreatorMemoryLookup")(target.dataset.creatorId),
    "clear-creator-records":        (target) => _("clearCreatorRecords")(target.dataset.creatorId),
    "open-creator-record-detail":   (target) => _("openCreatorRecordDetail")(target.dataset.recordId),
    "open-creator-memory-detail":   (target) => _("openCreatorMemoryDetail")(target.dataset.creatorId, target.dataset.memoryId),
    "delete-creator-record":        (target) => _("deleteCreatorRecord")(target.dataset.recordId),
    "delete-creator-memory-snapshot": (target) => _("deleteCreatorMemorySnapshot")(target.dataset.creatorId, target.dataset.memoryId),
    "delete-creator-identity":      (target) => _("deleteCreatorIdentity")(target.dataset.creatorId),
    "export-creator-package":       (target) => _("exportCreatorPackage")(target.dataset.creatorId),
    "import-creator-package":       () => _("importCreatorPackage")(),
    "replace-current-creator-package": () => _("replaceCurrentCreatorPackage")(),

    /* === Backups === */
    "export-global-backup":   () => _("exportGlobalBackup")(),
    "import-global-backup":   () => _("importGlobalBackup")(),

    /* === Composer === */
    "open-model-config":      () => _("openComposerModelConfig")(),
    "composer-tool":          () => _("handleComposerTool")(),

    /* === Roundtable === */
    "open-roundtable":            () => _("toggleRoundtable")(),
    "toggle-roundtable":          () => _("toggleRoundtable")(),
    "toggle-roundtable-members":  () => _("toggleRoundtableMembers")(),
    "toggle-roundtable-materials": () => _("toggleRoundtableMaterials")(),
    "toggle-roundtable-session-import": () => _("toggleRoundtableSessionImport")(),
    "toggle-roundtable-context":  () => _("toggleRoundtableContextDock")(),
    "toggle-roundtable-paper":    () => _("toggleRoundtablePaperReveal")(),
    "roundtable-writer-settings": () => _("openAssistantConfig")("writer"),
    "roundtable-add-assistant":   () => _("createCustomRoundAssistant")(),
    "roundtable-import-personas": () => _("importRoundtablePersonas")(),
    "roundtable-export-personas": () => _("exportRoundtablePersonas")(),
    "roundtable-import-session-member": (target) => _("importRoundtableMemberFromSession")(target.dataset.sessionId, target.dataset.memberId),
    "send-assistant-private-chat": () => _("sendAssistantPrivateChat")(),
    "roundtable-toggle-primary-speaking": () => _("togglePrimaryRoundtableSpeaking")(),
    "roundtable-toggle-member":   (target) => _("toggleRoundtableMember")(target.dataset.memberId),
    "roundtable-member-up":       (target) => _("moveRoundtableMember")(target.dataset.memberId, -1),
    "roundtable-member-down":     (target) => _("moveRoundtableMember")(target.dataset.memberId, 1),
    "roundtable-edit-assistant":  (target) => _("openAssistantConfig")(target.dataset.memberId),
    "select-sealed-creator":      (target) => _("selectSealedCreator")(target.dataset.sealedId),
    "roundtable-cycle":           () => _("toggleRoundtableRound")(),
    "roundtable-start":           () => _("startRoundtableRound")(),
    "roundtable-resume":          () => _("resumeRoundtableRound")(),
    "roundtable-stop":            () => _("stopRoundtableGeneration")(),
    "insert-roundtable-mention":  (target) => _("insertRoundtableMention")(target.dataset.memberId),
    "jump-roundtable-paper":      () => _("jumpRoundtablePaperLatest")(),
    "roundtable-preview":         () => _("toggleRoundtable")(),

    /* === Sessions === */
    "new-session":            () => _("newSession")(),
    "switch-session":         (target) => _("switchSession")(target.dataset.sessionId),
    "rename-session":         (target) => _("renameSession")(target.dataset.sessionId),
    "copy-session":           (target) => _("copySession")(target.dataset.sessionId),
    "export-session":         (target) => _("exportSessionPackage")(target.dataset.sessionId),
    "import-session-package": () => _("importSessionPackage")(),
    "delete-session":         (target) => _("deleteSession")(target.dataset.sessionId),

    /* === API providers === */
    "fetch-models":           () => _("fetchModels")(),
    "select-provider":        (target) => _("switchApiProvider")(target.dataset.providerId),
    "add-provider":           () => _("addApiProvider")(),
    "rename-provider":        () => _("renameApiProvider")(),
    "delete-provider":        () => _("deleteApiProvider")(),
    "apply-global-model-config": () => _("applyGlobalModelConfigToAllAi")(),

    /* === Workspace + chat attachments === */
    "choose-workspace-files": () => _("chooseWorkspaceFiles")(),
    "clear-workspace-files":  () => _("clearWorkspaceFiles")(),
    "choose-chat-image":      () => _("chooseChatImage")(),
    "remove-chat-image":      (target) => _("removeChatImage")(target.dataset.attachmentId),
    "remove-workspace-file":  (target) => _("removeWorkspaceFile")(target.dataset.fileId),

    /* === Model pickers === */
    "toggle-model-picker":          () => _("toggleModelPicker")(),
    "select-model":                 (target) => _("selectModelFromPicker")(target.dataset.model),
    "toggle-settings-model-picker": () => _("toggleSettingsModelPicker")(),
    "select-settings-model":        (target) => _("selectSettingsModelFromPicker")(target.dataset.model),
    "toggle-assistant-model-picker": () => _("toggleAssistantModelPicker")(),
    "select-assistant-model":       (target) => _("selectAssistantModelFromPicker")(target.dataset.model),

    /* === Novel === */
    "save-novel":                () => _("saveNovel")(),
    "save-manuscript-version":   () => _("saveManuscriptVersion")(),
    "restore-manuscript-version": (target) => _("restoreManuscriptVersion")(target.dataset.versionId),
    "delete-manuscript-version":  (target) => _("deleteManuscriptVersion")(target.dataset.versionId),
    "import-body-file":          () => _("importBodyFile")(),
    "export-body-file":          () => _("exportBodyFile")(),
    "sync-body-from-ai":         () => _("syncBodyFromAssistant")(),
    "generate-novel":            (target) => _("generateNovelMaterial")(target.dataset.novelTarget),

    /* === Layout presets === */
    "layout-preset":          (target) => _("applyLayoutPreset")(target.dataset.preset),
    "layout-custom-preset":   (target) => _("applyCustomLayoutPreset")(target.dataset.presetId),
    "save-layout-preset":     () => _("saveLayoutPreset")(),
    "delete-layout-preset":   (target) => _("deleteLayoutPreset")(target.dataset.presetId),
    "layout-step":            (target) => _("stepLayoutValue")(target.dataset.layoutKey, Number(target.dataset.step) || 0),
    "copy-layout":            () => _("copyLayoutParams")(),
    "reset-layout":           () => _("resetLayoutParams")(),

    /* === Roundtable message actions === */
    "toggle-roundtable-menu":     (target) => _("toggleRoundtableMenu")(target.dataset.roundId),
    "copy-roundtable-message":    (target) => _("copyRoundtableMessage")(target.dataset.roundId),
    "send-roundtable-to-main":    (target) => _("sendRoundtableMessageToMain")(target.dataset.roundId),
    "delete-roundtable-message":  (target) => _("deleteRoundtableMessage")(target.dataset.roundId),
    "adopt-roundtable-message":   (target) => _("adoptRoundtableMessage")(target.dataset.roundId),
    "mark-roundtable-adopted":    (target) => _("markRoundtableDecision")(target.dataset.roundId, "adopted"),
    "mark-roundtable-ignored":    (target) => _("markRoundtableDecision")(target.dataset.roundId, "ignored"),
    "mark-roundtable-approved":   (target) => _("markRoundtableDecision")(target.dataset.roundId, "approved"),
    "mark-roundtable-revision":   (target) => _("markRoundtableDecision")(target.dataset.roundId, "revision"),
    "roundtable-write-adopted":   () => _("writeFromAdoptedRoundtableMessages")(),
    "undo-writer-sync":           (target) => _("undoWriterManuscriptSync")(target.dataset.roundId),
    "rewrite-writer-sync":        (target) => _("rewriteWriterManuscriptSync")(target.dataset.roundId),
    "locate-writer-segment":      (target) => _("locateWriterSegment")(target.dataset.roundId),
    "hide-writer-message":        (target) => _("hideWriterMessageKeepText")(target.dataset.roundId),
    "regen-roundtable-message":   (target) => _("regenerateRoundtableMessage")(target.dataset.roundId),

    /* === Chat message actions === */
    "toggle-menu":   (target) => _("handleToggleMenu")(target),
    "edit-user":     (target) => _("openEditor")(target.dataset.nodeId),
    "edit-ai":       (target) => _("openEditor")(target.dataset.nodeId),
    "copy-message":  (target) => _("copyMessageNodeText")(target.dataset.nodeId),
    "delete-message": (target) => _("deleteMessage")(target.dataset.nodeId),
    "resend-user":   (target) => _("resendUser")(target.dataset.nodeId),
    "regen-ai":      (target) => _("regenerateAssistant")(target.dataset.nodeId),
    "continue-ai":   (target) => _("continueFromAssistant")(target.dataset.nodeId),
    "prev-version":  (target) => _("switchVersion")(target.dataset.nodeId, -1),
    "next-version":  (target) => _("switchVersion")(target.dataset.nodeId, 1),
    "prev-branch":   (target) => _("switchSibling")(target.dataset.nodeId, -1),
    "next-branch":   (target) => _("switchSibling")(target.dataset.nodeId, 1),
  };
}
