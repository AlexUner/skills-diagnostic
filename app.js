(() => {
  'use strict';

  const questions = window.QUESTIONS;
  const databaseURL = (window.APP_CONFIG?.databaseURL || '').replace(/\/$/, '');
  const token = (location.hash.match(/^#attempt=([a-f0-9]{48})$/) || [])[1];
  const preview = new URLSearchParams(location.search).has('preview');
  const storageKey = `skills-diagnostic:v1:${token || 'preview'}`;
  const pendingKey = `${storageKey}:pending`;
  const positionKey = `${storageKey}:position:v2`;
  const $ = (id) => document.getElementById(id);
  const objective = questions.filter((question) => !question.kind);
  const sections = [...new Set(questions.map((question) => question.section))];
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
    const editingId = ['text-answer', 'comment-answer'].includes(document.activeElement?.id) ? document.activeElement.id : null;
    const selection = editingId ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const localPending = Object.fromEntries([...pending].filter((id) => state.answers[id]).map((id) => [id, state.answers[id]]));
    state = { version: 1, answers: { ...remote.answers, ...localPending } };
    saveLocal();
    render();
    if (editingId) {
      const field = $(editingId);
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
    state.answers[id] = { value: '', comment: '', submitted: false, ...state.answers[id], ...answer, updatedAt: Date.now() };
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
    const checked = objective.filter((question) => completed(question) && /^\d+$/.test(state.answers[question.id].value) && Number(state.answers[question.id].value) < question.choices.length);
    const correct = checked.filter((question) => Number(state.answers[question.id].value) === question.correct).length;
    const manual = questions.filter((question) => completed(question) && (question.kind || !checked.includes(question))).length;
    const bySection = sections.map((section) => {
      const items = questions.filter((question) => question.section === section);
      const checkedItems = checked.filter((question) => question.section === section);
      return { section, done: items.filter(completed).length, total: items.length, correct: checkedItems.filter((question) => Number(state.answers[question.id].value) === question.correct).length, checked: checkedItems.length };
    });
    return { done, checked: checked.length, correct, manual, bySection };
  }

  function renderNav() {
    const stats = getStats();
    const sectionNav = $('section-nav');
    sectionNav.replaceChildren();
    sections.forEach((section) => {
      const item = stats.bySection.find((entry) => entry.section === section);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'section-item';
      button.setAttribute('aria-current', questions[current].section === section ? 'true' : 'false');
      button.innerHTML = `<span></span><strong></strong>`;
      button.firstElementChild.textContent = section;
      button.lastElementChild.textContent = `${item.done}/${item.total}`;
      button.addEventListener('click', () => goTo(questions.findIndex((question) => question.section === section && !completed(question)) >= 0 ? questions.findIndex((question) => question.section === section && !completed(question)) : questions.findIndex((question) => question.section === section)));
      sectionNav.append(button);
    });
    const nav = $('question-nav');
    nav.replaceChildren();
    questions.forEach((question, index) => {
      if (question.section !== questions[current].section) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `nav-item${completed(question) ? ' done' : ''}`;
      if (index === current) button.setAttribute('aria-current', 'step');
      button.textContent = completed(question) ? '✓' : String(index + 1).padStart(2, '0');
      button.title = `${index + 1}. ${question.title}`;
      button.setAttribute('aria-label', `${index + 1}. ${question.title}${completed(question) ? ', завершено' : ''}`);
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
        updateAnswer(question.id, { value: String(index), submitted: false }, false);
        document.querySelectorAll('.choice').forEach((item, itemIndex) => item.classList.toggle('selected', itemIndex === index));
        updateSubmitButton();
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
      updateSubmitButton();
    });
    const hint = document.createElement('p');
    hint.className = 'draft-hint';
    hint.textContent = answer?.submitted ? 'Ответ отправлен на проверку наставнику.' : 'Черновик сохраняется автоматически. Его можно изменить до отправки.';
    $('answer-area').append(label, textarea, hint);
  }

  function renderQuestion() {
    const question = questions[current];
    const answer = state.answers[question.id];
    $('question-section').textContent = question.section;
    $('question-position').textContent = `${current + 1} / ${questions.length}`;
    $('question-title').textContent = question.title;
    $('question-description').textContent = question.description;
    $('question-code').hidden = !question.code;
    $('question-code').firstElementChild.textContent = question.code || '';
    $('answer-area').replaceChildren();
    selectedChoice = !question.kind && /^\d+$/.test(answer?.value || '') && Number(answer.value) < question.choices.length ? Number(answer.value) : null;
    if (question.kind === 'text') renderText(question, answer);
    else renderChoices(question, answer);
    const comment = $('comment-answer');
    comment.value = answer?.comment || '';
    comment.oninput = () => {
      updateAnswer(question.id, { comment: comment.value }, false);
      updateSubmitButton();
    };
    $('comment-hint').textContent = answer?.submitted ? 'Комментарий можно дополнить после отправки. Изменения сохраняются автоматически.' : 'Комментарий сохраняется автоматически. Можно отправить его вместо ответа.';
    const feedback = $('feedback');
    feedback.hidden = !answer?.submitted;
    feedback.className = 'feedback';
    if (answer?.submitted && (question.kind === 'text' || answer.value === '')) {
      feedback.classList.add('manual');
      feedback.textContent = answer.value === '' ? 'Комментарий сохранен и передан на ручной разбор наставнику.' : 'Ответ сохранен. Наставник проверит его отдельно.';
    } else if (answer?.submitted) {
      const correct = Number(answer.value) === question.correct;
      feedback.classList.add(correct ? 'correct' : 'incorrect');
      feedback.textContent = `${correct ? 'Верно.' : 'Пока неверно.'} ${question.explanation}`;
    }
    $('prev-button').disabled = current === 0;
    $('next-button').textContent = current === questions.length - 1 ? 'К началу' : (answer?.submitted ? 'Следующее' : 'Пропустить');
    $('submit-button').hidden = Boolean(answer?.submitted);
    $('submit-button').textContent = 'Отправить';
    updateSubmitButton();
  }

  function updateSubmitButton() {
    const question = questions[current];
    if (completed(question)) return;
    const value = question.kind === 'text' ? $('text-answer')?.value.trim() : selectedChoice;
    $('submit-button').disabled = (value === '' || value === null) && !$('comment-answer').value.trim();
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
    $('manual-note').textContent = stats.manual ? `На ручном разборе: ${stats.manual}.` : 'Открытые ответы и комментарии без выбранного варианта проверит наставник.';
    const breakdown = $('score-breakdown');
    breakdown.replaceChildren();
    stats.bySection.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      const name = document.createElement('span');
      name.textContent = item.section;
      const score = document.createElement('strong');
      score.textContent = `${item.correct}/${item.checked}`;
      score.title = `${item.correct} верно из ${item.checked} автоматически проверенных`;
      row.append(name, score);
      breakdown.append(row);
    });
    $('finish').hidden = stats.done !== questions.length;
    if (stats.done === questions.length) $('finish-summary').textContent = `Автоматически проверено: ${stats.correct} верно из ${stats.checked}. На ручном разборе: ${stats.manual}.`;
    renderNav();
    renderQuestion();
  }

  function goTo(index) {
    current = index;
    localStorage.setItem(positionKey, questions[current].id);
    render();
    if (window.innerWidth < 761) $('question-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function submit() {
    const question = questions[current];
    if (completed(question)) return;
    const value = question.kind === 'text' ? $('text-answer').value.trim() : selectedChoice;
    const comment = $('comment-answer').value.trim();
    if ((value === '' || value === null) && !comment) return;
    updateAnswer(question.id, { value: value === null ? '' : String(value), comment, submitted: true });
  }

  function downloadAnswers() {
    const report = {
      title: 'Входная диагностика', exportedAt: new Date().toISOString(),
      summary: getStats(),
      answers: questions.map((question) => ({
        id: question.id, section: question.section, level: question.level, question: question.title,
        submitted: Boolean(state.answers[question.id]?.submitted),
        answer: question.kind === 'text' ? state.answers[question.id]?.value || '' : /^\d+$/.test(state.answers[question.id]?.value || '') ? question.choices[Number(state.answers[question.id].value)] : '',
        comment: state.answers[question.id]?.comment || '',
        correct: !completed(question) || question.kind || !/^\d+$/.test(state.answers[question.id]?.value || '') ? null : Number(state.answers[question.id].value) === question.correct,
        review: !completed(question) ? 'Не отправлен' : question.kind || !/^\d+$/.test(state.answers[question.id]?.value || '') ? 'На ручном разборе' : 'Проверено автоматически'
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
    const positionValue = localStorage.getItem(positionKey);
    const savedPosition = questions.findIndex((question) => question.id === positionValue);
    if (savedPosition >= 0) current = savedPosition;
    else current = Math.max(0, questions.findIndex((question) => !completed(question)));
    if (token && databaseURL) {
      try {
        const { data } = await fetchRemote();
        mergeRemote(data);
        if (positionValue === null) current = Math.max(0, questions.findIndex((question) => !completed(question)));
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
  $('download-progress-button').addEventListener('click', downloadAnswers);
  window.addEventListener('online', () => pending.size ? scheduleSync(0) : refreshRemote());
  window.addEventListener('focus', refreshRemote);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRemote(); });
  start();
})();
