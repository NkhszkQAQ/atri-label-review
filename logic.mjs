export const OPTIONS = [
  ['neutral','平静／没情绪'],['joy','开心／得意'],['anger','生气／不满'],
  ['sadness','难过／失落'],['fear','害怕／紧张'],['surprise','惊讶／意外'],
  ['disgust','厌恶／反感'],['curiosity','疑惑／好奇'],['embarrassment','害羞／难为情'],
  ['complex','复杂／说不清'],['uncertain','信息不够']
];
const keys = new Set(OPTIONS.map(x => x[0]));
const base = new Set(['neutral','joy','anger','sadness','fear','surprise','disgust']);
const exclusive = new Set(['neutral','complex','uncertain']);
export function toggleChoice(selected, key) {
  if (!keys.has(key)) throw new Error('未知选项');
  const set = new Set(selected);
  if (set.has(key)) set.delete(key);
  else if (exclusive.has(key)) { set.clear(); set.add(key); }
  else { for (const v of exclusive) set.delete(v); set.add(key); }
  return [...set];
}
export function toEmotion(selected) {
  return selected.length === 1 && base.has(selected[0]) ? selected[0] : null;
}
export function isReviewed(answer) {
  return !!answer && (answer.selected.length > 0 || answer.note.trim().length > 0);
}
export function validateAnswer(answer, ids) {
  if (!answer || typeof answer.id !== 'string' || !ids.has(answer.id) ||
      !Array.isArray(answer.selected) || answer.selected.some(x => !keys.has(x)) ||
      new Set(answer.selected).size !== answer.selected.length ||
      typeof answer.note !== 'string' || answer.note.length > 10000 ||
      typeof answer.updated_at !== 'string' || !Number.isFinite(Date.parse(answer.updated_at))) throw new Error('进度文件里有不合法的答案');
  if (answer.selected.length > 1 && answer.selected.some(x => exclusive.has(x))) throw new Error('答案选项互相冲突');
  return {id: answer.id, selected: [...answer.selected], note: answer.note,
    updated_at: answer.updated_at, emotion: toEmotion(answer.selected),
    status: !answer.selected.length && !answer.note.trim() ? 'unreviewed' : answer.selected.includes('uncertain') ? 'insufficient_context' :
      answer.selected.includes('complex') || answer.selected.length > 1 ? 'complex' : 'reviewed',
    origin: 'user'};
}
export function mergeAnswers(existing, imported, ids) {
  const result = new Map(existing); let count = 0;
  // Validate the entire import before mutating anything.
  const clean = imported.map(x => validateAnswer(x, ids));
  for (const answer of clean) {
    const old = result.get(answer.id);
    if (!old || Date.parse(answer.updated_at) > Date.parse(old.updated_at)) { result.set(answer.id, answer); count++; }
  }
  return {answers: result, count};
}
export function validateDataset(data) {
  if (!data || data.schema !== 'atri-review-dataset/v1' || typeof data.id !== 'string' ||
      !Array.isArray(data.cases) || !data.cases.length || data.cases.length > 20000) throw new Error('语料格式不正确');
  const ids = new Set();
  for (const row of data.cases) {
    if (typeof row.id !== 'string' || ids.has(row.id) || typeof row.target !== 'string' ||
        typeof row.stage !== 'string' || typeof row.overview !== 'string' || !Array.isArray(row.context) ||
        row.context.some(x => typeof x.speaker !== 'string' || typeof x.text !== 'string') ||
        !Array.isArray(row.after) || row.after.some(x => typeof x.speaker !== 'string' || typeof x.text !== 'string')) throw new Error('语料条目不完整或编号重复');
    ids.add(row.id);
  }
  return data;
}
