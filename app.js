(() => {
  'use strict';

  const questions = window.QUESTIONS;
  const databaseURL = (window.APP_CONFIG?.databaseURL || '').replace(/\/$/, '');
  const token = (location.hash.match(/^#attempt=([a-f0-9]{48})$/) || [])[1];
  const preview = new URLSearchParams(location.search).has('preview');
  const storageKey = `zina-diagnostic:v1:${token || 'preview'}`;
  const pendingKey = `${storageKey}:pending`;
  const positionKey = `${storageKey}:position`;
  const $ = (id) => document.getElementById(id);
  const objective = questions.filter((question) => !question.kind);
  let state = { version: 1, answers: {} };
  let pending = new Set();
  let current = 0;
  let selectedChoice = null;
  let syncTimer = null;
  let syncing = false;

  function status(message, kind) {
    $('save-status').dataset.state = kind;
    $('save-status').lastElementChild.textContent = message;
  }

  function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    localStorage.setItem(pendingKey, JSON.stringify([...pending]));
  }

  function restoreLocal() {
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey));
      if (cached?.version === 1 && cached.answers && typeof cached.answers === 'object') state = cached;
      pending = new Set(JSON.parse(localStorage.getItem(pendingKey) || '[]'));
    } catch {
      state = { version: 1, answers: {} };
      pending = new Set();
    }
  }

  function remotePath() {
    return `${databaseURL}/attempts/${token}.json`;
  }

  async function fetchRemote(withETag = false) {
    const response = await fetch(remotePath(), {
      headers: withETag ? { 'X-Firebase-ETag': 'true' } : {},
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.version !== 1) throw new Error('ATTEMPT_NOT_FOUND');
    return { data: { version: 1, answers: data.answers && typeof data.answers === 'object' ? data.answers : {} }, etag: response.headers.get('ETag') };
  }

  function mergeRemote(remote) {
    const editing = document.activeElement?.id === 'text-answer';
    const selection = editing ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const localPending = Object.fromEntries([...pending].filter((id) => state.answers[id]).map((id) => [id, state.answers[id]]));
    state = { version: 1, answers: { ...remote.answers, ...localPending } };
    saveLocal();
    render();
    if (editing) {
      const field = $('text-answer');
      field?.focus({ preventScroll: true });
      field?.setSelectionRange(...selection);
    }
  }

  async function refreshRemote() {
    if (!databaseURL || !token || syncing) return;
    try {
      const { data } = await fetchRemote();
      mergeRemote(data);
      if (pending.size) scheduleSync(0);
      else status('Сохранено в облаке', 'saved');
    } catch {
      status('Локально, ждет связи', 'local');
    }
  }

  function scheduleSync(delay = 700) {
    if (!databaseURL || !token) {
      status('Режим просмотра: локально', 'local');
      return;
    }
    status('Синхронизация', 'syncing');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay);
  }

  async function sync() {
    if (syncing || !pending.size) return;
    syncing = true;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = Object.fromEntries([...pending].filter((id) => state.answers[id]).map((id) => [id, structuredClone(state.answers[id])]));
        const { data, etag } = await fetchRemote(true);
        if (!etag) throw new Error('ETAG_UNAVAILABLE');
        const merged = { version: 1, answers: { ...data.answers, ...snapshot } };
        const response = await fetch(remotePath(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': etag },
          body: JSON.stringify(merged)
        });
        if (response.status === 412) continue;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        for (const [id, sent] of Object.entries(snapshot)) {
          if (JSON.stringify(state.answers[id]) === JSON.stringify(sent)) pending.delete(id);
        }
        mergeRemote(merged);
        if (!pending.size) status('Сохранено в облаке', 'saved');
        else status('Синхронизация', 'syncing');
        return;
      }
      throw new Error('CONFLICT');
    } catch {
      status('Локально, ждет синхронизации', 'error');
    } finally {
      syncing = false;
      saveLocal();
      if (pending.size && navigator.onLine) syncTimer = setTimeout(sync, 5000);
    }
  }

  function updateAnswer(id, answer, rerender = true) {
    state.answers[id] = { ...answer, updatedAt: Date.now() };
    pending.add(id);
    saveLocal();
    if (rerender) render();
    scheduleSync();
  }

  function completed(question) {
    return Boolean(state.answers[question.id]?.submitted);
  }

  function getStats() {
    const done = questions.filter(completed).length;
    const checked = objective.filter(completed);
    const correct = checked.filter((question) => Number(state.answers[question.id].value) === question.correct).length;
    const manual = questions.filter((question) => question.kind && completed(question)).length;
    return { done, checked: checked.length, correct, manual };
  }

  function renderNav() {
    const nav = $('question-nav');
    nav.replaceChildren();
    let lastTopic = '';
    questions.forEach((question, index) => {
      if (question.topic !== lastTopic) {
        const label = document.createElement('div');
        label.className = 'topic-label';
        label.textContent = question.topic;
        nav.append(label);
        lastTopic = question.topic;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `nav-item${completed(question) ? ' done' : ''}`;
      if (index === current) button.setAttribute('aria-current', 'step');
      const number = document.createElement('span');
      number.className = 'nav-index';
      number.textContent = completed(question) ? '✓' : String(index + 1).padStart(2, '0');
      const title = document.createElement('span');
      title.textContent = question.title;
      button.append(number, title);
      button.addEventListener('click', () => goTo(index));
      nav.append(button);
    });
  }

  function renderChoices(question, answer) {
    const list = document.createElement('div');
    list.className = 'choice-list';
    question.choices.forEach((choice, index) => {
      const label = document.createElement('label');
      label.className = `choice${selectedChoice === index ? ' selected' : ''}${answer?.submitted ? ' locked' : ''}`;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'answer';
      input.value = String(index);
      input.checked = selectedChoice === index;
      input.disabled = Boolean(answer?.submitted);
      input.addEventListener('change', () => {
        selectedChoice = index;
        document.querySelectorAll('.choice').forEach((item, itemIndex) => item.classList.toggle('selected', itemIndex === index));
        $('submit-button').disabled = false;
      });
      const text = document.createElement('span');
      text.textContent = choice;
      label.append(input, text);
      list.append(label);
    });
    $('answer-area').append(list);
  }

  function renderText(question, answer) {
    const label = document.createElement('label');
    label.className = 'answer-label';
    label.htmlFor = 'text-answer';
    label.textContent = 'Ваш ответ';
    const textarea = document.createElement('textarea');
    textarea.id = 'text-answer';
    textarea.className = 'text-answer';
    textarea.maxLength = 4000;
    textarea.placeholder = question.placeholder;
    textarea.value = answer?.value || '';
    textarea.disabled = Boolean(answer?.submitted);
    textarea.addEventListener('input', () => {
      updateAnswer(question.id, { value: textarea.value, submitted: false }, false);
      $('submit-button').disabled = !textarea.value.trim();
    });
    const hint = document.createElement('p');
    hint.className = 'draft-hint';
    hint.textContent = answer?.submitted ? 'Ответ отправлен на проверку наставнику.' : 'Черновик сохраняется автоматически. Его можно изменить до отправки.';
    $('answer-area').append(label, textarea, hint);
  }

  function renderQuestion() {
    const question = questions[current];
    const answer = state.answers[question.id];
    $('question-topic').textContent = question.topic;
    $('question-position').textContent = `${current + 1} / ${questions.length}`;
    $('question-title').textContent = question.title;
    $('question-description').textContent = question.description;
    $('question-code').hidden = !question.code;
    $('question-code').firstElementChild.textContent = question.code || '';
    $('answer-area').replaceChildren();
    selectedChoice = answer?.submitted && !question.kind ? Number(answer.value) : null;
    if (question.kind === 'text') renderText(question, answer);
    else renderChoices(question, answer);
    const feedback = $('feedback');
    feedback.hidden = !answer?.submitted;
    feedback.className = 'feedback';
    if (answer?.submitted && question.kind === 'text') {
      feedback.classList.add('manual');
      feedback.textContent = 'Ответ сохранен. Наставник проверит его отдельно.';
    } else if (answer?.submitted) {
      const correct = Number(answer.value) === question.correct;
      feedback.classList.add(correct ? 'correct' : 'incorrect');
      feedback.textContent = `${correct ? 'Верно.' : 'Пока неверно.'} ${question.explanation}`;
    }
    $('prev-button').disabled = current === 0;
    $('next-button').textContent = current === questions.length - 1 ? 'К началу' : (answer?.submitted ? 'Следующее' : 'Пропустить');
    $('submit-button').hidden = Boolean(answer?.submitted);
    $('submit-button').textContent = question.kind === 'text' ? 'Отправить ответ' : 'Ответить';
    $('submit-button').disabled = question.kind === 'text' ? !answer?.value?.trim() : selectedChoice === null;
  }

  function render() {
    const stats = getStats();
    $('progress-count').textContent = `${stats.done} из ${questions.length}`;
    $('remaining').textContent = `${questions.length - stats.done} осталось`;
    $('progress').setAttribute('aria-valuenow', String(stats.done));
    $('progress').setAttribute('aria-valuemax', String(questions.length));
    $('progress-fill').style.width = `${stats.done / questions.length * 100}%`;
    $('score-value').textContent = String(stats.correct);
    $('score-answered').textContent = String(stats.checked);
    $('manual-note').textContent = stats.manual ? `${stats.manual} практических ответа ждут проверки наставника.` : 'Практические ответы проверит наставник.';
    $('finish').hidden = stats.done !== questions.length;
    if (stats.done === questions.length) $('finish-summary').textContent = `Автоматическая часть: ${stats.correct} из ${objective.length}. Практические ответы (${stats.manual}) проверит наставник.`;
    renderNav();
    renderQuestion();
  }

  function goTo(index) {
    current = index;
    localStorage.setItem(positionKey, String(current));
    render();
    if (window.innerWidth < 761) $('question-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function submit() {
    const question = questions[current];
    if (completed(question)) return;
    const value = question.kind === 'text' ? $('text-answer').value.trim() : selectedChoice;
    if (value === '' || value === null) return;
    updateAnswer(question.id, { value: String(value), submitted: true });
  }

  function downloadAnswers() {
    const report = {
      title: 'Входная диагностика', exportedAt: new Date().toISOString(),
      summary: getStats(),
      answers: questions.map((question) => ({
        topic: question.topic, question: question.title,
        answer: question.kind === 'text' ? state.answers[question.id]?.value : question.choices[Number(state.answers[question.id]?.value)],
        correct: question.kind === 'text' ? null : Number(state.answers[question.id]?.value) === question.correct,
        review: question.kind === 'text' ? 'Проверяется наставником' : 'Проверено автоматически'
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagnostika-otvety.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function start() {
    if (!preview && (!token || !databaseURL)) {
      $('gate').hidden = false;
      $('gate-message').textContent = !token ? 'Для входа нужна персональная ссылка с кодом.' : 'Облачное сохранение пока не настроено. Попросите наставника завершить настройку.';
      status('Нет доступа к попытке', 'error');
      return;
    }
    restoreLocal();
    const savedPosition = Number(localStorage.getItem(positionKey));
    if (Number.isInteger(savedPosition) && savedPosition >= 0 && savedPosition < questions.length) current = savedPosition;
    else current = Math.max(0, questions.findIndex((question) => !completed(question)));
    if (token && databaseURL) {
      try {
        const { data } = await fetchRemote();
        mergeRemote(data);
        status(pending.size ? 'Синхронизация' : 'Сохранено в облаке', pending.size ? 'syncing' : 'saved');
        if (pending.size) scheduleSync(0);
      } catch (error) {
        if (!localStorage.getItem(storageKey)) {
          $('gate').hidden = false;
          $('gate-message').textContent = error.message === 'ATTEMPT_NOT_FOUND' || error.message === 'HTTP 401' || error.message === 'HTTP 403' ? 'Попытка по этой ссылке не найдена. Проверьте персональную ссылку.' : 'Не удалось загрузить попытку. Проверьте соединение и обновите страницу.';
          status('Не удалось открыть попытку', 'error');
          return;
        }
        status('Локально, ждет связи', 'local');
      }
    } else status('Режим просмотра: локально', 'local');
    $('app').hidden = false;
    render();
  }

  $('prev-button').addEventListener('click', () => goTo(current - 1));
  $('next-button').addEventListener('click', () => goTo(current === questions.length - 1 ? 0 : current + 1));
  $('submit-button').addEventListener('click', submit);
  $('download-button').addEventListener('click', downloadAnswers);
  window.addEventListener('online', () => pending.size ? scheduleSync(0) : refreshRemote());
  window.addEventListener('focus', refreshRemote);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRemote(); });
  start();
})();
