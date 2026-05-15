/**
 * Generation control — abort + cancel coordination.
 *
 * Two pieces:
 *
 *   runStopHooks({ abortController, bridgeRequestId, streamRequestId,
 *                   hooks: { onAbort, onCancelBridge, onCancelStream } })
 *     Pure orchestration: calls each hook with whichever token is
 *     present, swallowing per-hook errors so a faulty cancel for the
 *     bridge can't prevent the stream from being cancelled too.
 *     Returns true iff at least one hook was invoked.
 *
 *   createGenerationControl()
 *     Stateful controller that owns the legacy {isGenerating,
 *     abortController, bridgeRequestId, streamRequestId,
 *     generatingNodeId} cluster as private state. main.js can adopt
 *     it incrementally; for the bridge phase the legacy let
 *     bindings stay and the controller is unused.
 */

export function runStopHooks({
  abortController = null,
  bridgeRequestId = null,
  streamRequestId = null,
  hooks = {},
} = {}) {
  let invoked = false;
  if (abortController) {
    try { hooks.onAbort?.(abortController); invoked = true; } catch (_) {}
  }
  if (bridgeRequestId) {
    try { hooks.onCancelBridge?.(bridgeRequestId); invoked = true; } catch (_) {}
  }
  if (streamRequestId) {
    try { hooks.onCancelStream?.(streamRequestId); invoked = true; } catch (_) {}
  }
  return invoked;
}

export function createGenerationControl() {
  const state = {
    active: false,
    abortController: null,
    bridgeRequestId: null,
    streamRequestId: null,
    nodeId: null,
  };

  function start({
    nodeId = null, abortController = null,
    bridgeRequestId = null, streamRequestId = null,
  } = {}) {
    state.active = true;
    state.nodeId = nodeId;
    state.abortController = abortController;
    state.bridgeRequestId = bridgeRequestId;
    state.streamRequestId = streamRequestId;
  }

  function reset() {
    state.active = false;
    state.abortController = null;
    state.bridgeRequestId = null;
    state.streamRequestId = null;
    state.nodeId = null;
  }

  function stop({ onAbort, onCancelBridge, onCancelStream, onAfter } = {}) {
    if (!state.active) return false;
    runStopHooks({
      abortController: state.abortController,
      bridgeRequestId: state.bridgeRequestId,
      streamRequestId: state.streamRequestId,
      hooks: { onAbort, onCancelBridge, onCancelStream },
    });
    reset();
    try { onAfter?.(); } catch (_) {}
    return true;
  }

  return {
    start, stop, reset,
    updateBridgeRequestId: (id) => { state.bridgeRequestId = id || null; },
    updateStreamRequestId: (id) => { state.streamRequestId = id || null; },
    setNodeId:             (id) => { state.nodeId = id || null; },
    setAbortController:    (ac) => { state.abortController = ac || null; },
    isActive:              () => state.active,
    isStreamingNode:       (nodeId) => state.active && state.nodeId === nodeId,
    get _state()           { return { ...state }; },
    get nodeId()           { return state.nodeId; },
    get abortController()  { return state.abortController; },
    get bridgeRequestId()  { return state.bridgeRequestId; },
    get streamRequestId()  { return state.streamRequestId; },
  };
}
