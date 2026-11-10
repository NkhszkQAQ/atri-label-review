import {OPTIONS, toggleChoice, toEmotion, isReviewed, validateAnswer, mergeAnswers, validateDataset} from './logic.mjs';

const $ = id => document.getElementById(id);
let db, dataset, answers = new Map(), index = 0, selected = [], saveQueue = Promise.resolve(), change = 0;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const transaction = (stores, action) => new Promise((resolve, reject) => {
  const tx = db.transaction(stores, 'readwrite');
  tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('保存被中断'));
  try { action(tx); } catch (error) { tx.abort(); reject(error); }
});
const get = (store, key) => request(db.transaction(store).objectStore(store).get(key));
const putPref = (key, value) => transaction(['prefs'], tx => tx.objectStore('prefs').put({key, value}));

function announce(text, error = false) {
  $('notice').hidden = false; $('notice').textContent = text;
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}
function updateProgress() {
  const count = [...answers.values()].filter(isReviewed).length;
  $('progress-label').textContent = `已标 ${count} / ${dataset.cases.length}`;
  $('progress').max = dataset.cases.length; $('progress').value = count;
}
function showRows(container, rows) {
  container.replaceChildren();
  for (const row of rows) {
    const p = document.createElement('p'); p.className = 'utterance';
    if (!row.speaker) p.classList.add('narration');
    const speaker = document.createElement('span'); speaker.className = 'speaker'; speaker.textContent = row.speaker || '旁白';
    p.append(speaker, document.createTextNode(row.text)); container.append(p);
  }
}
function renderChoices() {
  for (const button of $('choices').children) {
    const active = selected.includes(button.dataset.key);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.check').textContent = active ? '✓' : '';
  }
}
function saveCurrent() {
  const id = dataset.cases[index].id;
  const position = index;
  const answer = validateAnswer({id, selected: [...selected], note: $('note').value,
    updated_at: new Date().toISOString()}, new Set(dataset.cases.map(x => x.id)));
  answers.set(id, answer);
  const seq = ++change; $('saved').textContent = '保存中…';
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await transaction(['answers', 'prefs'], tx => {
      tx.objectStore('answers').put({key: `${dataset.id}|${id}`, dataset: dataset.id, answer});
      tx.objectStore('prefs').put({key: `position:${dataset.id}`, value: position});
    });
    answers.set(id, answer); updateProgress();
    if (seq === change) $('saved').textContent = '已保存在本机';
  }).catch(error => { $('saved').textContent = '未保存'; announce('保存失败。请先导出进度，再检查浏览器存储：' + error.message, true); throw error; });
  return saveQueue;
}
function render() {
  const row = dataset.cases[index], answer = answers.get(row.id);
  selected = [...(answer?.selected || [])]; $('note').value = answer?.note || '';
  $('case-number').textContent = `第 ${index + 1} 条`;
  $('stage').textContent = row.stage; $('overview').textContent = row.overview;
  $('target').textContent = row.target;
  const recent = row.context.slice(-7);
  showRows($('recent-context'), recent);
  showRows($('full-context'), row.context.slice(0, Math.max(0, row.context.length - 7)));
  $('full-details').open = false; $('full-details').hidden = row.context.length <= 7;
  $('full-summary').textContent = `展开更早的前文（${Math.max(0, row.context.length - 7)} 条）`;
  showRows($('following'), row.after); $('following-details').open = false; $('following-details').hidden = !row.after.length;
  $('source').textContent = `${row.source.file} · 原文第 ${row.source.scene} 段 · ${row.id}`;
  $('jump').value = index + 1; $('jump').max = dataset.cases.length;
  $('previous').disabled = index === 0;
  $('saved').textContent = answer ? '已保存在本机' : '选择后自动保存';
  renderChoices(); updateProgress();
}
async function goTo(nextIndex) {
  try {
    await saveQueue;
    index = Math.max(0, Math.min(dataset.cases.length - 1, nextIndex));
    await putPref(`position:${dataset.id}`, index); render();
    window.scrollTo({top: 0, behavior: 'auto'});
  } catch { /* The saving error is already visible; stay on the current item. */ }
}
async function next() {
  try {
    await saveQueue;
    const mode = $('filter').value;
    const eligible = i => mode === 'all' || (mode === 'reviewed' ? isReviewed(answers.get(dataset.cases[i].id)) : !isReviewed(answers.get(dataset.cases[i].id)));
    let target = -1;
    for (let i = index + 1; i < dataset.cases.length; i++) if (eligible(i)) { target = i; break; }
    if (target < 0 && mode !== 'all') for (let i = 0; i < index; i++) if (eligible(i)) { target = i; break; }
    if (target < 0) { announce('这一组已经看完了。可以导出进度，或切换“查看”继续。'); return; }
    $('notice').hidden = true; await goTo(target);
  } catch { /* Keep unsaved input in place. */ }
}
async function loadDataset(data) {
  dataset = validateDataset(data);
  const all = await request(db.transaction('answers').objectStore('answers').getAll());
  answers = new Map(all.filter(x => x.dataset === data.id).map(x => [x.answer.id, x.answer]));
  const ids = new Set(data.cases.map(x => x.id));
  const seeded = mergeAnswers(answers, data.initial_answers || [], ids);
  if (seeded.count) {
    await transaction(['answers'], tx => {
      for (const answer of seeded.answers.values()) tx.objectStore('answers').put({key: `${data.id}|${answer.id}`, dataset: data.id, answer});
    });
    answers = seeded.answers;
  }
  const position = await get('prefs', `position:${data.id}`);
  const first = data.cases.findIndex(x => !isReviewed(answers.get(x.id)));
  index = Number.isInteger(position?.value) ? Math.max(0, Math.min(data.cases.length - 1, position.value)) : Math.max(0, first);
  $('loading').hidden = true; $('unlock').hidden = true; $('workspace').hidden = false; render();
}
function decodeKey(text) {
  const clean = text.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(clean)) throw new Error('访问码不完整，请重新打开专属链接。');
  return Uint8Array.from(atob(clean.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
}
async function unlock(text) {
  $('loading').hidden = false; $('unlock').hidden = true;
  const key = await crypto.subtle.importKey('raw', decodeKey(text), 'AES-GCM', false, ['decrypt']);
  const response = await fetch('./dataset.enc', {cache: 'no-store'});
  if (!response.ok) throw new Error('语料下载失败，请稍后再试。');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 8)) !== 'ATRIv001') throw new Error('语料文件版本不正确。');
  let plain;
  try { plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(8, 20)}, key, bytes.slice(20)); }
  catch { throw new Error('访问码不匹配，请使用聊天中的完整链接。'); }
  const data = validateDataset(JSON.parse(new TextDecoder().decode(plain)));
  await transaction(['datasets', 'prefs'], tx => {
    tx.objectStore('datasets').put(data); tx.objectStore('prefs').put({key: 'active', value: data.id});
  });
  history.replaceState(null, '', location.pathname + location.search);
  $('access-key').value = ''; await loadDataset(data);
}
function showUnlock(error) {
  $('loading').hidden = true; $('workspace').hidden = true; $('unlock').hidden = false;
  $('unlock-error').textContent = error?.message || '';
}
function downloadBackup() {
  const document = {schema: 'atri-human-labels/v1', dataset_id: dataset.id,
    exported_at: new Date().toISOString(), total_cases: dataset.cases.length,
    reviewed_count: [...answers.values()].filter(isReviewed).length,
    answers: [...answers.values()].map(x => ({...x, emotion: toEmotion(x.selected)}))};
  const blob = new Blob([JSON.stringify(document, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), link = window.document.createElement('a');
  link.href = url; link.download = `亚托莉标注进度-${new Date().toISOString().slice(0, 10)}.json`;
  window.document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  announce('已生成进度文件。请在浏览器的下载项目里保存到“文件”。');
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('文件太大，请选择导出的进度 JSON。');
  const data = JSON.parse(await file.text());
  if (data.schema !== 'atri-human-labels/v1' || data.dataset_id !== dataset.id || !Array.isArray(data.answers)) throw new Error('这不是本份语料的进度文件。');
  await saveQueue;
  const result = mergeAnswers(answers, data.answers, new Set(dataset.cases.map(x => x.id)));
  await transaction(['answers'], tx => {
    for (const answer of result.answers.values()) tx.objectStore('answers').put({key: `${dataset.id}|${answer.id}`, dataset: dataset.id, answer});
  });
  answers = result.answers; render(); announce(`已合并 ${result.count} 条更新，较新的本机答案会保留。`);
}
function updateThemeLabel() { $('theme').textContent = document.documentElement.dataset.theme === 'dark' ? '浅色' : '深色'; }
$('theme').addEventListener('click', () => { window.setReviewTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); updateThemeLabel(); });
updateThemeLabel();
for (const [key, label] of OPTIONS) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'choice';
  button.dataset.key = key; button.setAttribute('aria-pressed', 'false');
  const text = document.createElement('span'); text.textContent = label;
  const check = document.createElement('span'); check.className = 'check'; check.setAttribute('aria-hidden', 'true');
  button.append(text, check); button.addEventListener('click', () => {
    selected = toggleChoice(selected, key); renderChoices(); saveCurrent().catch(() => {});
  }); $('choices').append(button);
}
$('note').addEventListener('input', () => saveCurrent().catch(() => {}));
$('previous').addEventListener('click', () => goTo(index - 1)); $('next').addEventListener('click', next);
$('jump-form').addEventListener('submit', event => { event.preventDefault(); const n = Number($('jump').value); if (Number.isInteger(n) && n > 0 && n <= dataset.cases.length) goTo(n - 1); });
$('filter').addEventListener('change', async () => {
  try { await saveQueue; } catch { return; }
  const mode = $('filter').value;
  const n = dataset.cases.findIndex(x => mode === 'all' || (mode === 'reviewed' ? isReviewed(answers.get(x.id)) : !isReviewed(answers.get(x.id))));
  if (n < 0) announce('当前没有符合条件的条目。'); else goTo(n);
});
$('export').addEventListener('click', async () => { await saveQueue.catch(() => {}); downloadBackup(); });
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  try { await importBackup(event.target.files[0]); } catch (error) { announce(error.message, true); }
  event.target.value = '';
});
$('unlock-form').addEventListener('submit', async event => { event.preventDefault(); try { await unlock($('access-key').value); } catch (error) { showUnlock(error); } });

try {
  const opening = indexedDB.open('atri-emotion-review', 1);
  opening.onupgradeneeded = () => {
    const database = opening.result;
    database.createObjectStore('datasets', {keyPath: 'id'});
    database.createObjectStore('answers', {keyPath: 'key'});
    database.createObjectStore('prefs', {keyPath: 'key'});
  };
  db = await request(opening);
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (key) await unlock(key);
  else {
    const active = await get('prefs', 'active');
    const cached = active ? await get('datasets', active.value) : null;
    if (cached) await loadDataset(cached); else showUnlock();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
} catch (error) { showUnlock(error); }
