import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

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
