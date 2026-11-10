import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleChoice, toEmotion, isReviewed, validateAnswer, mergeAnswers, validateDataset} from '../logic.mjs';
const ids = new Set(['case-1', 'case-2']);
const answer = (id, selected, note = '', time = '2026-11-10T14:00:00Z') => ({id, selected, note, updated_at: time});
test('平静与复杂选项不会和明确情绪意外混合', () => {
  assert.deepEqual(toggleChoice(['joy', 'sadness'], 'neutral'), ['neutral']);
  assert.deepEqual(toggleChoice(['neutral'], 'curiosity'), ['curiosity']);
  assert.deepEqual(toggleChoice(['joy'], 'sadness'), ['joy', 'sadness']);
  assert.deepEqual(toggleChoice(['joy'], 'joy'), []);
});
test('复杂、多选、疑惑不被强行映射成单一七类标签', () => {
  assert.equal(toEmotion(['joy']), 'joy');
  assert.equal(toEmotion(['neutral']), 'neutral');
  for (const selected of [[], ['joy', 'sadness'], ['complex'], ['curiosity'], ['embarrassment'], ['uncertain']]) assert.equal(toEmotion(selected), null);
});
test('已复核未知与未作答分别保存，清空答案不会被计作完成', () => {
  assert.equal(isReviewed(validateAnswer(answer('case-1', []), ids)), false);
  assert.equal(validateAnswer(answer('case-1', []), ids).status, 'unreviewed');
  assert.equal(isReviewed(validateAnswer(answer('case-1', ['uncertain']), ids)), true);
  assert.equal(isReviewed(validateAnswer(answer('case-1', [], '复杂，无法单分'), ids)), true);
});
test('导入旧备份不会覆盖较新的答案或复活已清空的答案', () => {
  const newer = validateAnswer(answer('case-1', [], '', '2026-11-11T00:00:00Z'), ids);
  const existing = new Map([['case-1', newer]]);
  const result = mergeAnswers(existing, [answer('case-1', ['joy']), answer('case-2', ['neutral'])], ids);
  assert.equal(result.count, 1); assert.deepEqual(result.answers.get('case-1').selected, []);
});
test('非法备份会整批拒绝，不部分写入、不接受未知样本', () => {
  const existing = new Map();
  assert.throws(() => mergeAnswers(existing, [answer('case-1', ['joy']), answer('unknown', ['sadness'])], ids));
  assert.equal(existing.size, 0);
  assert.throws(() => validateAnswer(answer('case-1', ['neutral', 'joy']), ids));
  assert.throws(() => validateAnswer(answer('case-1', ['made-up']), ids));
});
test('语料编号重复会拒绝，以免标注串题', () => {
  const row = {id:'case-1',target:'测试台词',stage:'测试阶段',overview:'测试背景',context:[],after:[]};
  assert.throws(() => validateDataset({schema:'atri-review-dataset/v1',id:'test',cases:[row,row]}));
  assert.equal(validateDataset({schema:'atri-review-dataset/v1',id:'test',cases:[row]}).cases.length,1);
});
