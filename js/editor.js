/* 퀴즈 편집기 (UTF-8) */
'use strict';
(() => {
  const { $, $$, esc } = RQ;
  const DRAFT = 'rq-editor-draft';
  const TIMES = [10, 20, 30, 45, 60, 90];
  const ICON = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };

  const blank = (ox) => (ox
    ? { text: '', choices: ['O', 'X'], answer: 0, time: 10, explain: '', image: '', ox: true }
    : { text: '', choices: ['', '', '', ''], answer: 0, time: 20, explain: '', image: '' });

  let quiz = { title: '', questions: [blank()] };
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d && Array.isArray(d.questions) && d.questions.length) quiz = d;
  } catch (e) { /* 무시 */ }

  let saveT;
  const autosave = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify(quiz)); } catch (e) { /* 무시 */ } }, 300); };

  /* ---------- 그리기 ---------- */
  function render() {
    $('#quiz-title').value = quiz.title || '';
    const ol = $('#qs');
    ol.innerHTML = quiz.questions.map((q, i) => {
      const n = q.ox ? 2 : 4;
      const opts = Array.from({ length: n }, (_, k) => `
        <div class="opt-row">
          <input type="radio" name="ans-${i}" id="ans-${i}-${k}" value="${k}" ${q.answer === k ? 'checked' : ''}>
          <label class="bubble c${k + 1}" for="ans-${i}-${k}" title="정답으로 표시">${k + 1}</label>
          <label class="sr" for="opt-${i}-${k}">${k + 1}번 선택지</label>
          <input class="opt-in" id="opt-${i}-${k}" data-k="${k}" value="${esc(q.choices[k] || '')}" placeholder="${k < 2 ? '선택지' : '선택지 (비워도 됨)'}" ${q.ox ? 'readonly' : ''}>
        </div>`).join('');
      return `<li class="q" data-i="${i}">
        <span class="q-no num">${i + 1}</span>
        <div class="q-body">
          <label class="sr" for="qt-${i}">${i + 1}번 문제</label>
          <textarea class="q-text" id="qt-${i}" rows="2" placeholder="${q.ox ? 'O/X로 답할 문장을 쓰세요' : '문제를 쓰세요'}">${esc(q.text)}</textarea>
          <div class="opts">${opts}</div>
          <div class="meta">
            <label>제한 시간<select class="time">${TIMES.map((t) => `<option value="${t}" ${q.time === t ? 'selected' : ''}>${t}초</option>`).join('')}</select></label>
            <label class="exp">해설 (정답 공개 때 보임)<input class="exp-in" value="${esc(q.explain || '')}" placeholder="한두 줄"></label>
            <label class="img">그림 파일 이름 또는 주소<input class="img-in" value="${esc(q.image || '')}" placeholder="예: leaf.png"></label>
            <span class="q-tools">
              <button class="icon-btn up" type="button" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="icon-btn down" type="button" aria-label="아래로" ${i === quiz.questions.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="icon-btn copy" type="button" aria-label="복사">${ICON.copy}</button>
              <button class="icon-btn del" type="button" aria-label="삭제">${ICON.del}</button>
            </span>
          </div>
        </div>
      </li>`;
    }).join('');

    $$('.q', ol).forEach((li) => {
      const i = Number(li.dataset.i);
      const q = quiz.questions[i];
      $('.q-text', li).addEventListener('input', (e) => { q.text = RQ.nfc(e.target.value); autosave(); });
      $$('.opt-in', li).forEach((inp) => inp.addEventListener('input', (e) => { q.choices[Number(inp.dataset.k)] = RQ.nfc(e.target.value); autosave(); }));
      $$('input[type=radio]', li).forEach((r) => r.addEventListener('change', () => { q.answer = Number(r.value); autosave(); }));
      $('.time', li).addEventListener('change', (e) => { q.time = Number(e.target.value); autosave(); });
      $('.exp-in', li).addEventListener('input', (e) => { q.explain = RQ.nfc(e.target.value); autosave(); });
      $('.img-in', li).addEventListener('input', (e) => { q.image = RQ.nfc(e.target.value.trim()); autosave(); });
      $('.up', li).addEventListener('click', () => move(i, -1));
      $('.down', li).addEventListener('click', () => move(i, 1));
      $('.copy', li).addEventListener('click', () => { quiz.questions.splice(i + 1, 0, JSON.parse(JSON.stringify(q))); render(); autosave(); });
      $('.del', li).addEventListener('click', () => {
        if ((q.text || q.choices.some((c) => c)) && !confirm(`${i + 1}번 문제를 지울까요?`)) return;
        quiz.questions.splice(i, 1);
        if (!quiz.questions.length) quiz.questions.push(blank());
        render(); autosave();
      });
    });
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= quiz.questions.length) return;
    [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]];
    render(); autosave();
  }

  $('#quiz-title').addEventListener('input', (e) => { quiz.title = RQ.nfc(e.target.value); autosave(); });
  $('#btn-add').addEventListener('click', () => { quiz.questions.push(blank()); render(); autosave(); focusLast(); });
  $('#btn-add-ox').addEventListener('click', () => { quiz.questions.push(blank(true)); render(); autosave(); focusLast(); });
  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('지금 쓰고 있는 퀴즈를 모두 지울까요?')) return;
    quiz = { title: '', questions: [blank()] };
    render(); autosave();
  });
  const focusLast = () => { const t = $$('.q-text'); if (t.length) t[t.length - 1].focus(); };

  /* ---------- 검사·정리 ---------- */
  function clean() {
    const errors = [];
    const questions = [];
    quiz.questions.forEach((q, i) => {
      const text = (q.text || '').trim();
      const choices = q.choices.map((c) => (c || '').trim());
      while (choices.length > 2 && !choices[choices.length - 1]) choices.pop();
      if (!text && !choices.some((c) => c)) return; // 완전히 빈 문제는 건너뜀
      if (!text) { errors.push(`${i + 1}번: 문제가 비어 있습니다.`); return; }
      if (choices.length < 2 || choices.some((c) => !c)) { errors.push(`${i + 1}번: 선택지는 1번부터 빈칸 없이 2개 이상 써야 합니다.`); return; }
      if (q.answer >= choices.length) { errors.push(`${i + 1}번: 정답으로 표시한 선택지가 비어 있습니다.`); return; }
      questions.push({ text, choices, answer: q.answer, time: q.time || 20, explain: (q.explain || '').trim(), image: (q.image || '').trim() });
    });
    if (!questions.length && !errors.length) errors.push('문제를 하나 이상 쓰세요.');
    return { quiz: { title: (quiz.title || '').trim() || '이름 없는 퀴즈', questions }, errors };
  }
  function check() {
    const out = clean();
    if (out.errors.length) { alert('고칠 곳이 있습니다.\n\n' + out.errors.join('\n')); return null; }
    return out.quiz;
  }

  $('#btn-save').addEventListener('click', () => {
    const q = check();
    if (!q) return;
    RQ.download(RQ.safeName(q.title) + '.csv', RQ.toCSV(RQ.quizToRows(q)));
  });
  $('#btn-play').addEventListener('click', () => {
    const q = check();
    if (!q) return;
    localStorage.setItem('rq-editor-quiz', JSON.stringify(q));
    location.href = 'host.html?from=editor' + (RQ.mode() === 'local' ? '&mode=local' : '');
  });

  /* ---------- CSV 불러오기 ---------- */
  $('#file-in').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const out = RQ.quizFromRows(RQ.parseCSV(RQ.decodeBytes(await f.arrayBuffer())), f.name.replace(/\.csv$/i, ''));
    if (!out.quiz) { alert(out.errors.join('\n')); return; }
    if (out.errors.length) alert('일부 줄은 읽지 못했습니다.\n\n' + out.errors.join('\n'));
    const hasWork = quiz.questions.some((q) => q.text);
    if (hasWork && !confirm('지금 쓰고 있는 퀴즈를 불러온 파일로 바꿀까요?')) return;
    quiz = {
      title: out.quiz.title,
      questions: out.quiz.questions.map((q) => {
        const ox = q.choices.length === 2 && q.choices[0] === 'O' && q.choices[1] === 'X';
        const choices = ox ? q.choices : q.choices.concat(['', '', '', '']).slice(0, 4);
        return { ...q, choices, ox };
      }),
    };
    render(); autosave();
    RQ.toast(`${quiz.questions.length}문항을 불러왔습니다.`);
  });

  /* ---------- 붙여넣기 ---------- */
  $('#btn-paste-open').addEventListener('click', () => { $('#paste').hidden = false; $('#paste-in').focus(); });
  $('#btn-paste-close').addEventListener('click', () => { $('#paste').hidden = true; });
  $('#btn-paste').addEventListener('click', () => {
    const { list, errors } = parsePaste($('#paste-in').value);
    $('#paste-err').textContent = errors.join('\n');
    if (!list.length) return;
    // 처음 상태의 빈 문제 하나는 지우고 붙인다
    if (quiz.questions.length === 1 && !quiz.questions[0].text && !quiz.questions[0].choices.some((c) => c && c !== 'O' && c !== 'X')) quiz.questions = [];
    quiz.questions.push(...list);
    render(); autosave();
    if (!errors.length) { $('#paste-in').value = ''; $('#paste').hidden = true; }
    RQ.toast(`${list.length}문항을 추가했습니다.`);
  });

  function parsePaste(text) {
    const list = [], errors = [];
    const blocks = RQ.nfc(text).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
    blocks.forEach((lines, bi) => {
      const head = lines[0].replace(/^(Q\s*)?\d+\s*[.)번]\s*/i, '');
      const q = { text: head, choices: [], answer: -1, time: 20, explain: '', image: '' };
      lines.slice(1).forEach((l) => {
        let m;
        if ((m = l.match(/^해설\s*[:：]\s*(.*)$/))) { q.explain = m[1]; return; }
        if ((m = l.match(/^시간\s*[:：]\s*(\d+)/))) { const t = Number(m[1]); q.time = t >= 5 && t <= 240 ? t : 20; return; }
        if ((m = l.match(/^그림\s*[:：]\s*(.*)$/))) { q.image = m[1].trim(); return; }
        let star = false;
        let c = l;
        if (/^\*/.test(c)) { star = true; c = c.replace(/^\*\s*/, ''); }
        c = c.replace(/^([①②③④]|[1-4]\s*[.)]|[-•·])\s*/, '');
        if (/^\*/.test(c)) { star = true; c = c.replace(/^\*\s*/, ''); }
        if (/\(정답\)\s*$/.test(c)) { star = true; c = c.replace(/\s*\(정답\)\s*$/, ''); }
        if (star) q.answer = q.choices.length;
        q.choices.push(c);
      });
      const label = `${bi + 1}번째 덩어리(${head.slice(0, 12)}…)`;
      if (q.choices.length < 2 || q.choices.length > 4) { errors.push(`${label}: 선택지는 2~4개여야 합니다.`); return; }
      if (q.answer < 0) { errors.push(`${label}: 정답 앞에 * 표시가 없습니다.`); return; }
      const ox = q.choices.length === 2 && /^(O|○)$/i.test(q.choices[0]) && /^(X|×)$/i.test(q.choices[1]);
      if (ox) { q.choices = ['O', 'X']; q.ox = true; if (q.time === 20 && !lines.some((l) => /^시간/.test(l))) q.time = 10; } else q.choices = q.choices.concat(['', '', '', '']).slice(0, 4);
      list.push(q);
    });
    return { list, errors };
  }

  /* ---------- 미리보기 ---------- */
  let pv = 0, pvList = [];
  $('#btn-preview').addEventListener('click', () => {
    const out = clean();
    pvList = out.quiz.questions;
    if (!pvList.length) { alert(out.errors.join('\n') || '미리 볼 문제가 없습니다.'); return; }
    pv = 0;
    drawPv();
    $('#preview').hidden = false;
    $('#pv-close').focus();
  });
  function drawPv() {
    const q = pvList[pv];
    $('#pv-no').textContent = pv + 1;
    $('#pv-total').textContent = pvList.length;
    $('#pv-text').textContent = q.text;
    const img = $('#pv-img');
    const src = RQ.imgSrc(q.image);
    img.hidden = !src;
    if (src) img.src = src;
    $('#pv-choices').innerHTML = q.choices.map((c, i) => `<div class="pv-opt c${i + 1} ${i === q.answer ? 'ans' : ''}"><span class="bubble">${i + 1}</span><span>${esc(c)}</span></div>`).join('');
    $('#pv-prev').disabled = pv === 0;
    $('#pv-next').disabled = pv === pvList.length - 1;
  }
  $('#pv-prev').addEventListener('click', () => { if (pv > 0) { pv--; drawPv(); } });
  $('#pv-next').addEventListener('click', () => { if (pv < pvList.length - 1) { pv++; drawPv(); } });
  $('#pv-close').addEventListener('click', () => { $('#preview').hidden = true; });
  $('#preview').addEventListener('click', (e) => { if (e.target.id === 'preview') $('#preview').hidden = true; });
  $('#preview').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#preview').hidden = true; });

  render();
})();
