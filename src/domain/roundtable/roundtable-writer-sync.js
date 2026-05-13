import { clean } from "../../utils/text.js";

export function createWriterSyncSegment(previousBody, text) {
  const previous = clean(previousBody);
  const content = clean(text);
  const separator = previous ? "\n\n" : "";
  const segment = `${separator}${content}`;
  return {
    body: `${previous}${segment}`,
    segment,
    start: previous.length,
    end: previous.length + segment.length,
    content,
  };
}

export function createWriterSyncMetadata(segment, now = Date.now()) {
  return {
    active: true,
    start: segment.start,
    end: segment.end,
    segment: segment.segment,
    content: segment.content,
    updatedAt: now,
  };
}

export function appendWriterSync(previousBody, text) {
  const segment = createWriterSyncSegment(previousBody, text);
  return {
    body: segment.body,
    manuscriptSync: createWriterSyncMetadata(segment),
  };
}

export function replaceWriterSyncedSegment(body, sync, messageContent, nextText) {
  const sourceBody = body || "";
  const content = clean(nextText);
  if (!content) return { ok: false };
  if (sync?.active && Number.isFinite(sync.start) && Number.isFinite(sync.end)) {
    const currentSegment = sourceBody.slice(sync.start, sync.end);
    if (currentSegment === sync.segment) {
      const replacement = `${sync.start > 0 ? "\n\n" : ""}${content}`;
      return {
        ok: true,
        body: `${sourceBody.slice(0, sync.start)}${replacement}${sourceBody.slice(sync.end)}`,
        manuscriptSync: {
          active: true,
          start: sync.start,
          end: sync.start + replacement.length,
          segment: replacement,
          content,
          updatedAt: Date.now(),
        },
      };
    }
  }
  const oldContent = clean(sync?.content || messageContent);
  const trimmedBody = clean(sourceBody);
  if (!oldContent || !trimmedBody.endsWith(oldContent)) return { ok: false };
  const previousBody = clean(trimmedBody.slice(0, -oldContent.length));
  const fallback = createWriterSyncSegment(previousBody, content);
  return {
    ok: true,
    body: fallback.body,
    manuscriptSync: createWriterSyncMetadata(fallback),
  };
}

export function removeWriterSyncedSegment(body, sync, messageContent) {
  const sourceBody = body || "";
  if (sync?.active && Number.isFinite(sync.start) && Number.isFinite(sync.end)) {
    const currentSegment = sourceBody.slice(sync.start, sync.end);
    if (currentSegment === sync.segment) {
      return {
        ok: true,
        body: clean(`${sourceBody.slice(0, sync.start)}${sourceBody.slice(sync.end)}`),
        manuscriptSync: { ...sync, active: false, removedAt: Date.now() },
      };
    }
  }
  const content = clean(sync?.content || messageContent);
  const trimmedBody = clean(sourceBody);
  if (content && trimmedBody.endsWith(content)) {
    return {
      ok: true,
      body: clean(trimmedBody.slice(0, -content.length)),
      manuscriptSync: {
        ...(sync || {}),
        active: false,
        content,
        removedAt: Date.now(),
      },
    };
  }
  return { ok: false };
}

export function locateWriterSyncStart(body, sync) {
  const sourceBody = body || "";
  if (!sync?.active) return -1;
  return Number.isFinite(sync.start) ? sync.start : sourceBody.indexOf(sync.segment || sync.content || "");
}

export function isWriterProseMessage(message) {
  return message?.speakerId === "writer" || message?.messageType === "writer_prose";
}

export function buildWriterManuscriptSegments(messages, body) {
  const sourceBody = body || "";
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => isWriterProseMessage(message) && message.manuscriptSync?.active)
    .map((message) => {
      const sync = message.manuscriptSync;
      const start = locateWriterSyncStart(sourceBody, sync);
      const end = Number.isFinite(sync.end) ? sync.end : start + clean(sync.segment || sync.content).length;
      const stillLinked = start >= 0 && end > start && sourceBody.slice(start, end) === sync.segment;
      return {
        message,
        start,
        end,
        stillLinked,
        content: clean(sync.content || message.content),
      };
    })
    .filter((segment) => segment.content);
}
