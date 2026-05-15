import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";
import { createCreatorMemoryEntry } from "../creator/creator-memory-model.js";

export function createCouncilParticipationRecord(input = {}) {
  return {
    id: clean(input.id) || uid("council_record"),
    councilId: clean(input.councilId),
    sessionId: clean(input.sessionId),
    roundtableMessageId: clean(input.roundtableMessageId),
    topic: clean(input.topic),
    speakerName: clean(input.speakerName),
    content: clean(input.content),
    roleState: clean(input.roleState || "participant"),
    createdAt: Number(input.createdAt) || Date.now(),
  };
}

export function normalizeCouncilParticipationRecords(records = []) {
  return Array.isArray(records)
    ? records
      .map(createCouncilParticipationRecord)
      .filter((record) => record.councilId && record.sessionId && record.content)
    : [];
}

export function appendCouncilParticipationRecord(records, input, limit = 200) {
  const record = createCouncilParticipationRecord(input);
  if (!record.councilId || !record.sessionId || !record.content) {
    return {
      records: normalizeCouncilParticipationRecords(records),
      record: null,
    };
  }
  const nextRecords = [...normalizeCouncilParticipationRecords(records), record].slice(-Math.max(1, Number(limit) || 200));
  return { records: nextRecords, record };
}

export function getCouncilParticipationRecords(records, councilId, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 40);
  const sessionId = clean(options.sessionId);
  return normalizeCouncilParticipationRecords(records)
    .filter((record) => record.councilId === councilId)
    .filter((record) => !sessionId || record.sessionId === sessionId)
    .slice(-limit);
}

export function createCreatorParticipationRecord(input = {}) {
  return {
    id: clean(input.id) || uid("creator_record"),
    creatorId: clean(input.creatorId || input.councilId),
    sessionId: clean(input.sessionId),
    roundtableMessageId: clean(input.roundtableMessageId),
    displayName: clean(input.displayName || input.speakerName),
    topic: clean(input.topic),
    summary: clean(input.summary || input.content),
    content: clean(input.content || input.summary),
    roleState: clean(input.roleState || "participant"),
    deleted: Boolean(input.deleted),
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Number(input.createdAt) || Date.now(),
  };
}

export function normalizeCreatorParticipationRecords(records = []) {
  return Array.isArray(records)
    ? records
      .map(createCreatorParticipationRecord)
      .filter((record) => record.creatorId && record.sessionId && (record.summary || record.content))
    : [];
}

export function appendCreatorParticipationRecord(records, input, limit = 500) {
  const record = createCreatorParticipationRecord(input);
  if (!record.creatorId || !record.sessionId || (!record.summary && !record.content)) {
    return {
      records: normalizeCreatorParticipationRecords(records),
      record: null,
    };
  }
  const nextRecords = [...normalizeCreatorParticipationRecords(records), record].slice(-Math.max(1, Number(limit) || 500));
  return { records: nextRecords, record };
}

export function getCreatorParticipationRecords(records, creatorId, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 80);
  const sessionId = clean(options.sessionId);
  const creatorIds = new Set([
    creatorId,
    ...(Array.isArray(options.aliases) ? options.aliases : []),
  ].map(clean).filter(Boolean));
  return normalizeCreatorParticipationRecords(records)
    .filter((record) => !record.deleted)
    .filter((record) => creatorIds.has(record.creatorId))
    .filter((record) => !sessionId || record.sessionId === sessionId)
    .slice(-limit);
}

export function createMemoryFromParticipationRecord(record = {}, input = {}) {
  const normalized = createCreatorParticipationRecord(record);
  const text = clean(input.text || normalized.summary || normalized.content);
  if (!normalized.creatorId || !normalized.sessionId || !text) return null;
  const topic = clean(normalized.topic);
  return createCreatorMemoryEntry({
    id: clean(input.id) || `memory_${normalized.id}`,
    creatorId: normalized.creatorId,
    scope: "roundtable",
    sourceSessionId: normalized.sessionId,
    sourceRoundtableId: clean(input.sourceRoundtableId || normalized.sessionId),
    sourceRecordId: normalized.id,
    type: clean(input.type) || (/决定|确认|采用|通过|采纳/.test(text) ? "decision" : "summary"),
    text: topic ? `话题：${topic}；${text}` : text,
    keywords: input.keywords,
    importance: Number(input.importance) || 3,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  });
}
