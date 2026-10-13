/* 교사 진행 화면 (UTF-8) */
'use strict';
(() => {
  const { $, $$, esc } = RQ;
  const KEY = 'rq-host-session';
  const RECENT = 'rq-recent';
  const GRACE = 600;          // 시간이 끝난 뒤 늦게 도착하는 답을 기다리는 시간(ms)
  const OFFLINE_MS = 12000;   // 이 시간 동안 소식이 없으면 접속 끊김으로 본다

  let S = null;               // 진행 중인 퀴즈 상태 (localStorage에 계속 저장)
  let link = null;
  let picked = null;
  let dirHandle = null;
  let tickT = null;
  let autoRevealT = null;
  let podiumT = [];

  const now = () => Date.now();
  const show = (id) => { $$('.sheet').forEach((s) => { s.hidden = s.id !== id; }); window.scrollTo(0, 0); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const N = () => S.quiz.questions.length;
  const players = () => Object.values(S.players);
  const online = () => players().filter((p) => p.connected);

  /* ---------- 저장 ---------- */
  let saveT;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 공간 부족 */ } }, 120);
  };

  /* ---------- 1. 퀴즈 고르기 ---------- */
  async function initSetup() {
    show('s-setup');
    const items = [];
    try {
      const ed = JSON.parse(localStorage.getItem('rq-editor-quiz') || 'null');
      if (ed && ed.questions && ed.questions.length) items.push({ label: ed.title, sub: '편집기에서 넘어온 퀴즈', load: async () => ed, editor: true });
    } catch (e) { /* 무시 */ }
    try {
      const res = await fetch('quizzes/index.json', { cache: 'no-store' });
      const list = (await res.json()).quizzes || [];
      list.forEach((it) => items.push({
        label: it.title, sub: '저장소',
        load: async () => {
          const r = await fetch('quizzes/' + encodeURIComponent(RQ.nfc(it.file)), { cache: 'no-store' });
          if (!r.ok) throw new Error('파일을 찾지 못했습니다: ' + it.file);
          const out = RQ.quizFromRows(RQ.parseCSV(RQ.decodeBytes(await r.arrayBuffer())), it.title);
          if (out.errors.length) out.quiz && (out.quiz._errors = out.errors);
          if (!out.quiz) throw new Error(out.errors.join(' '));
          return out.quiz;
        },
      }));
    } catch (e) { /* 저장소 목록이 없으면 건너뛴다 */ }
    try {
      (JSON.parse(localStorage.getItem(RECENT) || '[]')).forEach((q) => items.push({ label: q.title, sub: '최근 사용', load: async () => q }));
    } catch (e) { /* 무시 */ }

    const ul = $('#quiz-list');
    ul.innerHTML = items.length ? '' : '<li class="empty">아직 퀴즈가 없습니다. CSV를 불러오거나 편집기에서 만드세요.</li>';
    items.forEach((it) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" aria-pressed="false"><span>${esc(it.label)}</span><span class="small">${esc(it.sub)}</span></button>`;
      li.firstChild.addEventListener('click', async () => {
        $$('#quiz-list button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        li.firstChild.setAttribute('aria-pressed', 'true');
        try { pick(await it.load()); } catch (e) { pick(null, [e.message]); }
      });
      ul.appendChild(li);
    });
    if (new URLSearchParams(location.search).get('from') === 'editor') {
      const b = $('#quiz-list button'); if (b && items[0] && items[0].editor) b.click();
    }
    if (!('showDirectoryPicker' in window)) {
      $('#btn-folder').disabled = true;
      $('#folder-status').textContent = '이 브라우저는 폴더 저장을 지원하지 않습니다. 끝난 뒤 내려받기로 저장합니다.';
    }
    checkResume();
  }

  function pick(quiz, errors) {
    picked = quiz;
    const box = $('#picked');
    errors = errors || (quiz && quiz._errors) || [];
    if (!quiz) {
      box.innerHTML = `<p class="err">${errors.map(esc).join('<br>')}</p>`;
      $('#btn-open').disabled = true;
      return;
    }
    box.innerHTML = `<h3>${esc(quiz.title)}</h3><span class="small">${quiz.questions.length}문항</span>
      <ol>${quiz.questions.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ol>
      ${errors.length ? `<p class="err">읽지 못한 줄이 있습니다.<br>${errors.map(esc).join('<br>')}</p>` : ''}`;
    $('#btn-open').disabled = false;
  }

  $('#file-quiz').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $$('#quiz-list button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const out = RQ.quizFromRows(RQ.parseCSV(RQ.decodeBytes(await f.arrayBuffer())), f.name.replace(/\.csv$/i, ''));
    if (out.quiz) out.quiz._errors = out.errors;
    pick(out.quiz, out.errors);
    e.target.value = '';
  });

  $('#btn-folder').addEventListener('click', async () => {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'rq-results' });
      $('#folder-status').textContent = `"${dirHandle.name}" 폴더에 정답을 공개할 때마다 저장합니다.`;
    } catch (e) { /* 취소 */ }
  });

  $('#btn-open').addEventListener('click', () => {
    if (!picked) return;
    const quiz = { title: picked.title, questions: picked.questions };
    saveRecent(quiz);
    S = {
      v: 1,
      room: String(100000 + Math.floor(Math.random() * 900000)),
      quiz,
      settings: {
        className: RQ.nfc($('#class-name').value.trim()),
        leader: $('#opt-leader').checked,
      },
      date: RQ.today(),
      created: now(),
      phase: 'lobby',
      qi: -1,
      qStart: 0,
      limitMs: 0,
      skipped: [],
      players: {},
      banned: [],
    };
    persist();
    openLink();
    enterLobby();
  });

  function saveRecent(quiz) {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT) || '[]').filter((q) => q.title !== quiz.title);
      list.unshift({ title: quiz.title, questions: quiz.questions });
      localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 5)));
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 이어서 진행 ---------- */
  function checkResume() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 무시 */ }
    if (!saved || saved.phase === 'results' || now() - saved.created > 12 * 3600 * 1000) return;
    const where = { lobby: '대기실', question: `${saved.qi + 1}번 문제`, reveal: `${saved.qi + 1}번 정답 공개`, leader: `${saved.qi + 1}번 뒤 순위`, podium: '시상대' }[saved.phase] || '진행 중';
    $('#resume-title').textContent = saved.quiz.title;
    $('#resume-where').textContent = where;
    $('#resume').hidden = false;
    $('#btn-resume').onclick = () => {
      S = saved;
      players().forEach((p) => { p.connected = false; });
      $('#resume').hidden = true;
      openLink();
      if (S.phase === 'lobby') enterLobby();
      else if (S.phase === 'question') { renderQuestion(); show('s-question'); startTick(); }
      else if (S.phase === 'reveal') { renderReveal(); show('s-reveal'); }
      else if (S.phase === 'leader') { renderLeader(); show('s-leader'); }
      else if (S.phase === 'podium') podium();
      RQ.toast('학생들 화면이 자동으로 다시 연결됩니다.');
    };
    $('#btn-discard').onclick = () => { localStorage.removeItem(KEY); $('#resume').hidden = true; };
  }

  /* ---------- 연결 ---------- */
  function openLink() {
    if (link) link.close();
    link = new RQ.HostLink(S.room, {
      onReady: () => { $('#link-status').textContent = RQ.mode() === 'local' ? '시험 모드(같은 브라우저 탭끼리만 연결됩니다)' : '학생 접속을 기다리는 중'; },
      onError: (t) => { $('#link-status').textContent = t; RQ.toast(t, 6000); },
      onMsg,
      onClose: (cid) => { const p = S && S.players[cid]; if (p) { p.connected = false; refreshCounts(); } },
    });
  }

  function onMsg(cid, m) {
    if (!S || !m || typeof m.t !== 'string') return;
    if (S.banned.includes(cid)) { link.send(cid, { t: 'kicked' }); return; }
    const p = S.players[cid];
    if (p) { p.lastSeen = now(); if (!p.connected) { p.connected = true; refreshCounts(); } }
    if (m.t === 'hello') {
      if (p) sendState(cid);
      else link.send(cid, { t: 'welcome', title: S.quiz.title, open: !['podium', 'results'].includes(S.phase) });
    } else if (m.t === 'join') {
      join(cid, m);
    } else if (m.t === 'answer') {
      answer(cid, m);
    }
  }

  function join(cid, m) {
    if (['podium', 'results'].includes(S.phase)) { link.send(cid, { t: 'rejected', reason: '퀴즈가 이미 끝났어요.' }); return; }
    const chk = RQ.checkName(m.name);
    if (!chk.ok) { link.send(cid, { t: 'rejected', reason: chk.msg }); return; }
    const char = RQ.CHARS.some((c) => c.id === m.char) ? m.char : RQ.CHARS[Math.floor(Math.random() * RQ.CHARS.length)].id;
    if (S.players[cid]) { S.players[cid].char = char; sendState(cid); renderPlayers(); persist(); return; }

    // 같은 이름으로 다시 들어오면 원래 점수를 이어 준다
    const same = players().find((p) => p.baseName === chk.name && (!p.connected || now() - p.lastSeen > OFFLINE_MS));
    if (same) {
      delete S.players[same.cid];
      same.cid = cid; same.connected = true; same.lastSeen = now(); same.char = char;
      S.players[cid] = same;
      afterJoin(cid);
      return;
    }
    let name = chk.name, k = 2;
    const taken = new Set(players().map((p) => p.name));
    while (taken.has(name)) name = `${chk.name}(${k++})`;
    S.players[cid] = { cid, name, baseName: chk.name, char, score: 0, connected: true, lastSeen: now(), answers: {}, perms: {} };
    afterJoin(cid);
  }
  function afterJoin(cid) {
    renderPlayers(); refreshCounts(); persist(); sendState(cid);
  }

  function answer(cid, m) {
    const p = S.players[cid];
    if (!p) return;
    if (S.phase !== 'question' || m.qi !== S.qi || p.answers[S.qi]) { sendState(cid); return; }
    const q = S.quiz.questions[S.qi];
    const choice = Number(m.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;
    const hostElapsed = now() - S.qStart;
    if (hostElapsed > S.limitMs + GRACE) { sendState(cid); return; }
    let elapsed = Number(m.elapsed);
    if (!Number.isFinite(elapsed)) elapsed = hostElapsed;
    // 학생 컴퓨터가 문제를 받은 시각 기준으로 잰 시간. 교사 쪽 경과 시간보다 길 수는 없다.
    elapsed = Math.max(0, Math.min(elapsed, hostElapsed, S.limitMs));
    const correct = choice === q.answer;
    const pts = RQ.points(correct, elapsed, S.limitMs);
    p.answers[S.qi] = { choice, correct, elapsed: Math.round(elapsed), points: pts };
    p.score += pts;
    refreshCounts(); persist(); sendState(cid);
    const act = online();
    if (act.length && act.every((x) => x.answers[S.qi])) {
      clearTimeout(autoRevealT);
      autoRevealT = setTimeout(() => { if (S.phase === 'question') reveal(); }, 700);
    }
  }

  function kick(cid) {
    const p = S.players[cid];
    if (!p) return;
    if (!confirm(`${p.name} 학생을 내보낼까요?`)) return;
    S.banned.push(cid);
    delete S.players[cid];
    link.send(cid, { t: 'kicked' });
    renderPlayers(); refreshCounts(); persist();
  }

  // 연결 확인: 학생 화면은 5초마다 신호를 보낸다
  setInterval(() => {
    if (!S) return;
    let changed = false;
    players().forEach((p) => { if (p.connected && now() - p.lastSeen > OFFLINE_MS) { p.connected = false; changed = true; } });
    if (changed) refreshCounts();
  }, 3000);

  /* ---------- 학생에게 보내는 화면 정보 ---------- */
  function ranked() {
    const asked = [];
    for (let i = 0; i <= Math.min(S.qi, N() - 1); i++) if (!S.skipped.includes(i)) asked.push(i);
    return players().map((p) => {
      let time = 0, right = 0;
      asked.forEach((i) => {
        const a = p.answers[i];
        if (a) { time += a.elapsed; if (a.correct) right++; } else time += S.quiz.questions[i].time * 1000;
      });
      return { p, time, right, asked: asked.length };
    }).sort((a, b) => b.p.score - a.p.score || a.time - b.time || a.p.name.localeCompare(b.p.name, 'ko'));
  }
  function rankOf(cid) { return ranked().findIndex((r) => r.p.cid === cid) + 1; }

  function permFor(p, qi) {
    if (!p.perms) p.perms = {};
    if (!p.perms[qi]) {
      const n = S.quiz.questions[qi].choices.length;
      const a = Array.from({ length: n }, (_, i) => i);
      // 학생 화면도 교사 화면과 같은 순서로 보여 준다
      p.perms[qi] = a;
    }
    return p.perms[qi];
  }

  function sendState(cid) {
    const p = S.players[cid];
    if (!p || !link) return;
    const v = { t: 'state', phase: S.phase, title: S.quiz.title, qi: S.qi, total: N(), me: { name: p.name, char: p.char, score: p.score } };
    if (S.phase === 'question' || S.phase === 'reveal') {
      const q = S.quiz.questions[S.qi];
      const perm = permFor(p, S.qi);
      v.q = { text: q.text, image: q.image, choices: perm.map((i) => ({ n: i, text: q.choices[i] })) };
      const a = p.answers[S.qi];
      v.myChoice = a ? a.choice : -1;
      if (S.phase === 'question') {
        v.q.limitMs = S.limitMs;
        v.q.remainingMs = Math.max(0, S.limitMs - (now() - S.qStart));
        v.answered = !!a;
      } else {
        v.correctIdx = q.answer;
        v.correct = !!(a && a.correct);
        v.points = a ? a.points : 0;
        v.explain = q.explain || '';
        v.skipped = S.skipped.includes(S.qi);
      }
    }
    if (['reveal', 'leader', 'podium', 'results'].includes(S.phase)) {
      v.rank = rankOf(cid);
      v.count = players().length;
    }
    if (S.phase === 'podium' || S.phase === 'results') {
      v.top3 = ranked().slice(0, 3).map((r) => ({ name: r.p.name, char: r.p.char, score: r.p.score }));
    }
    link.send(cid, v);
  }
  const broadcast = () => online().forEach((p) => sendState(p.cid));

  /* ---------- 2. 대기실 ---------- */
  function joinUrl() {
    const base = location.href.split(/[?#]/)[0].replace(/host\.html$/, '');
    return base + '?room=' + S.room + (RQ.mode() === 'local' ? '&mode=local' : '');
  }
  function enterLobby() {
    S.phase = 'lobby';
    $$('.qtitle').forEach((el) => { el.textContent = S.quiz.title; });
    const url = joinUrl();
    $('#join-url').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    $('#room-code').textContent = S.room;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { $('#qr').hidden = true; }
    renderPlayers();
    show('s-lobby');
    persist();
  }
  function renderPlayers() {
    if (!S) return;
    const ul = $('#player-grid');
    const list = players().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    ul.innerHTML = list.map((p) => `<li><button type="button" data-cid="${esc(p.cid)}" class="${p.connected ? '' : 'off'}" title="내보내기">
      <span class="char">${RQ.charSVG(p.char)}</span><span>${esc(p.name)}</span></button></li>`).join('');
    $$('button', ul).forEach((b) => b.addEventListener('click', () => kick(b.dataset.cid)));
    $('#player-count').textContent = list.length;
    $('#btn-start').disabled = list.length === 0;
  }
  $('#btn-start').addEventListener('click', () => { S.qi = -1; nextQuestion(); });

  function refreshCounts() {
    if (!S) return;
    if (S.phase === 'lobby') renderPlayers();
    if (S.phase === 'question') {
      const done = players().filter((p) => p.answers[S.qi]).length;
      const total = Math.max(online().length, done);
      $('#q-answered').textContent = done;
      $('#q-players').textContent = '/ ' + total;
    }
  }

  /* ---------- 3. 문제 ---------- */
  function nextQuestion() {
    clearTimeout(autoRevealT);
    S.qi++;
    if (S.qi >= N()) { S.qi = N() - 1; podium(); return; }
    const q = S.quiz.questions[S.qi];
    S.phase = 'question';
    S.limitMs = q.time * 1000;
    S.qStart = now();
    players().forEach((p) => permFor(p, S.qi));
    renderQuestion();
    show('s-question');
    broadcast();
    persist();
    startTick();
  }
  function renderQuestion() {
    const q = S.quiz.questions[S.qi];
    $$('.qtitle').forEach((el) => { el.textContent = S.quiz.title; });
    $('#q-no').textContent = pad2(S.qi + 1);
    $('#q-total').textContent = '/ ' + pad2(N());
    $('#q-text').textContent = q.text;
    const img = $('#q-img');
    const src = RQ.imgSrc(q.image);
    img.hidden = !src;
    if (src) img.src = src;
    $('#q-choices').innerHTML = q.choices.map((c, i) => `<div class="choice c${i + 1}"><span class="bubble">${i + 1}</span><span>${esc(c)}</span></div>`).join('');
    refreshCounts();
    drawTime();
  }
  function drawTime() {
    const remain = S.limitMs - (now() - S.qStart);
    const sec = Math.max(0, Math.ceil(remain / 1000));
    $('#q-time').textContent = sec;
    const frac = Math.max(0, Math.min(1, remain / S.limitMs));
    $('#ring-fg').style.strokeDashoffset = String(169.65 * (1 - frac));
    $('.ring').classList.toggle('low', sec <= 5);
    return remain;
  }
  function startTick() {
    clearInterval(tickT);
    tickT = setInterval(() => {
      if (!S || S.phase !== 'question') { clearInterval(tickT); return; }
      if (drawTime() <= -300) reveal();
    }, 200);
  }
  $('#btn-extend').addEventListener('click', () => { S.limitMs += 10000; drawTime(); broadcast(); persist(); });
  $('#btn-reveal').addEventListener('click', () => reveal());
  $('#btn-skip').addEventListener('click', () => {
    if (!confirm('이 문제를 건너뛸까요? 이 문제에서 받은 점수는 모두 취소됩니다.')) return;
    undoQuestion(S.qi);
    S.skipped.push(S.qi);
    clearInterval(tickT);
    nextQuestion();
  });
  $('#btn-end').addEventListener('click', () => {
    if (!confirm('여기서 퀴즈를 끝내고 시상대로 갈까요? 지금 문제는 점수에 넣지 않습니다.')) return;
    undoQuestion(S.qi);
    S.skipped.push(S.qi);
    clearInterval(tickT);
    podium();
  });
  function undoQuestion(qi) {
    players().forEach((p) => { const a = p.answers[qi]; if (a) { p.score -= a.points; delete p.answers[qi]; } });
  }

  /* ---------- 4. 정답 공개 ---------- */
  function reveal() {
    if (S.phase !== 'question') return;
    clearInterval(tickT);
    clearTimeout(autoRevealT);
    S.phase = 'reveal';
    renderReveal();
    show('s-reveal');
    broadcast();
    persist();
    saveFiles();
  }
  function renderReveal() {
    const q = S.quiz.questions[S.qi];
    const counts = q.choices.map(() => 0);
    let answered = 0;
    players().forEach((p) => { const a = p.answers[S.qi]; if (a) { counts[a.choice]++; answered++; } });
    $('#r-no').textContent = pad2(S.qi + 1);
    $('#r-total').textContent = '/ ' + pad2(N());
    $('#r-text').textContent = q.text;
    const right = counts[q.answer];
    $('#r-rate').textContent = answered ? `정답률 ${Math.round((right / players().length) * 100)}% (${right}/${players().length}명)` : '아무도 답하지 않았습니다';
    const ol = $('#r-bars');
    ol.innerHTML = q.choices.map((c, i) => `<li class="c${i + 1} ${i === q.answer ? 'right' : 'wrong'}">
      ${i === q.answer ? '<span class="stamp-o" aria-hidden="true"></span>' : ''}
      <span class="lab"><span class="bubble">${i + 1}</span><span>${esc(c)}</span></span>
      <span class="track"><span class="fill" style="display:block" data-w="${answered ? (counts[i] / answered) * 100 : 0}"></span></span>
      <span class="cnt num">${counts[i]}</span></li>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.fill', ol).forEach((f) => { f.style.width = f.dataset.w + '%'; })));
    const ex = q.explain && q.explain.trim();
    $('#r-explain').hidden = !ex;
    $('#r-explain-text').textContent = ex || '';
    $('#btn-next').textContent = S.qi >= N() - 1 ? '시상대로' : (S.settings.leader ? '순위 보기' : '다음 문제');
  }
  $('#btn-next').addEventListener('click', () => {
    if (S.qi >= N() - 1) podium();
    else if (S.settings.leader) leader();
    else nextQuestion();
  });

  /* ---------- 5. 중간 순위 ---------- */
  function leader() {
    S.phase = 'leader';
    renderLeader();
    show('s-leader');
    broadcast();
    persist();
  }
  function renderLeader() {
    const r = ranked();
    $('#l-sub').textContent = `${S.qi + 1}번 문제까지 · ${r.length}명`;
    const top = r.slice(0, 5);
    $('#l-list').innerHTML = top.map((x, i) => {
      const a = x.p.answers[S.qi];
      return `<li><span class="rank num">${i + 1}</span><span class="char">${RQ.charSVG(x.p.char)}</span><span>${esc(x.p.name)}</span>
        <span class="gain num">${a && a.points ? '+' + RQ.fmt(a.points) : ''}</span><span class="score num">${RQ.fmt(x.p.score)}</span></li>`;
    }).join('') + (r.length > 5 ? `<li class="me-more">나머지 ${r.length - 5}명은 각자 화면에서 자기 순위를 볼 수 있어요.</li>` : '');
  }
  $('#btn-next2').addEventListener('click', () => nextQuestion());

  /* ---------- 6. 시상대 ---------- */
  function podium() {
    clearInterval(tickT);
    podiumT.forEach(clearTimeout); podiumT = [];
    S.phase = 'podium';
    const r = ranked();
    const asked = S.qi + 1 - S.skipped.filter((i) => i <= S.qi).length;
    $('#p-sub').textContent = `${S.quiz.title} · 참여 ${r.length}명 · ${asked}문항`;
    const slot = (place, cls) => {
      const x = r[place - 1];
      if (!x) return `<div class="step p${place} empty"><div class="char"></div><div class="block"></div></div>`;
      return `<div class="step p${place} ${cls}"><div class="char">${RQ.charSVG(x.p.char)}</div>
        <div class="block"><span class="place">${place}</span><span class="pname">${esc(x.p.name)}</span><span class="pscore num">${RQ.fmt(x.p.score)}점</span></div></div>`;
    };
    $('#podium').innerHTML = slot(2, 'c1') + slot(1, 'c2') + slot(3, 'c3');
    $('#p-rest').textContent = r.length > 3 ? `4등부터는 각자 화면에서 확인할 수 있어요.` : '';
    $('#btn-results').hidden = true;
    $('#confetti').innerHTML = '';
    show('s-podium');
    broadcast();
    persist();
    saveFiles();
    const showStep = (p) => { const el = $(`#podium .p${p}`); if (el) el.classList.add('show'); };
    podiumT.push(setTimeout(() => showStep(3), 700));
    podiumT.push(setTimeout(() => showStep(2), 3200));
    podiumT.push(setTimeout(() => { showStep(1); confetti(); }, 5900));
    podiumT.push(setTimeout(() => { $('#btn-results').hidden = false; }, 7600));
  }
  function confetti() {
    const box = $('#confetti');
    const colors = ['#C8473D', '#22427A', '#E3AC2E', '#2E6E48', '#1C1B19'];
    let html = '';
    for (let i = 0; i < 90; i++) {
      const w = 6 + Math.random() * 10, h = Math.random() < 0.3 ? w : 5 + Math.random() * 3;
      html += `<i style="left:${Math.random() * 100}%;width:${w}px;height:${h}px;background:${colors[i % colors.length]};${h === w ? 'border-radius:50%;' : ''}animation-duration:${2.6 + Math.random() * 2.8}s;animation-delay:${Math.random() * 1.4}s"></i>`;
    }
    box.innerHTML = html;
  }
  $('#btn-results').addEventListener('click', () => results());

  /* ---------- 7. 결과 ---------- */
  function results() {
    S.phase = 'results';
    renderResults();
    show('s-results');
    broadcast();
    persist();
    saveFiles();
  }
  function itemStats() {
    return S.quiz.questions.map((q, i) => {
      const asked = i <= S.qi && !S.skipped.includes(i);
      const counts = q.choices.map(() => 0);
      let answered = 0;
      players().forEach((p) => { const a = p.answers[i]; if (a) { counts[a.choice]++; answered++; } });
      const total = players().length;
      return { i, q, asked, counts, answered, total, right: counts[q.answer], rate: total ? counts[q.answer] / total : 0 };
    });
  }
  function renderResults() {
    $$('.qtitle').forEach((el) => { el.textContent = S.quiz.title; });
    const st = itemStats();
    $('#t-items').innerHTML = '<thead><tr><th>번호</th><th>문제</th><th>정답률</th><th>많이 고른 오답</th></tr></thead><tbody>' +
      st.map((s) => {
        if (!s.asked) return `<tr><td class="n">${s.i + 1}</td><td class="q">${esc(s.q.text)}</td><td colspan="2" class="small">${S.skipped.includes(s.i) ? '건너뜀' : '내지 않음'}</td></tr>`;
        const pct = Math.round(s.rate * 100);
        let wi = -1;
        s.counts.forEach((c, k) => { if (k !== s.q.answer && c > 0 && (wi < 0 || c > s.counts[wi])) wi = k; });
        return `<tr><td class="n">${s.i + 1}</td><td class="q">${esc(s.q.text)}</td>
          <td><span class="rate ${pct < 50 ? 'low' : ''}"><span class="track"><span class="fill" style="display:block;width:${pct}%"></span></span><span class="n">${pct}%</span></span></td>
          <td>${wi >= 0 ? `${wi + 1}번 ${esc(s.q.choices[wi])} (${s.counts[wi]}명)` : '<span class="small">없음</span>'}</td></tr>`;
      }).join('') + '</tbody>';
    const r = ranked();
    $('#t-students').innerHTML = '<thead><tr><th>순위</th><th>이름</th><th class="n">점수</th><th class="n">정답</th><th>틀린 문항</th></tr></thead><tbody>' +
      r.map((x, k) => {
        const wrong = [];
        st.forEach((s) => { if (s.asked) { const a = x.p.answers[s.i]; if (!a || !a.correct) wrong.push(s.i + 1); } });
        return `<tr><td class="n">${k + 1}</td><td>${esc(x.p.name)}</td><td class="n">${RQ.fmt(x.p.score)}</td><td class="n">${x.right}/${x.asked}</td><td>${wrong.join(', ') || '-'}</td></tr>`;
      }).join('') + '</tbody>';
  }

  /* ---------- 결과 CSV ---------- */
  function fileBase() {
    return [S.date, S.settings.className, S.quiz.title].filter(Boolean).map(RQ.safeName).join('_');
  }
  function answersCSV() {
    const rows = [['날짜', '반', '퀴즈', '문항번호', '문제', '이름', '캐릭터', '고른 답 번호', '고른 답', '정답 여부', '응답 시간(초)', '점수']];
    S.quiz.questions.forEach((q, i) => {
      if (i > S.qi || S.skipped.includes(i)) return;
      players().forEach((p) => {
        const a = p.answers[i];
        rows.push([S.date, S.settings.className, S.quiz.title, i + 1, q.text, p.name, RQ.charById(p.char).name,
          a ? a.choice + 1 : '', a ? q.choices[a.choice] : '무응답', a ? (a.correct ? 'O' : 'X') : 'X',
          a ? (a.elapsed / 1000).toFixed(2) : '', a ? a.points : 0]);
      });
    });
    return RQ.toCSV(rows);
  }
  function rankCSV() {
    const rows = [['순위', '이름', '캐릭터', '총점', '정답 수', '푼 문항 수', '응답 시간 합계(초)']];
    ranked().forEach((x, k) => rows.push([k + 1, x.p.name, RQ.charById(x.p.char).name, x.p.score, x.right, x.asked, (x.time / 1000).toFixed(2)]));
    return RQ.toCSV(rows);
  }
  function itemsCSV() {
    const rows = [['문항번호', '문제', '정답 번호', '정답', '참여 학생 수', '정답 수', '정답률(%)', '1번 고름', '2번 고름', '3번 고름', '4번 고름', '무응답', '비고']];
    itemStats().forEach((s) => {
      if (!s.asked) { rows.push([s.i + 1, s.q.text, s.q.answer + 1, s.q.choices[s.q.answer], '', '', '', '', '', '', '', '', S.skipped.includes(s.i) ? '건너뜀' : '내지 않음']); return; }
      rows.push([s.i + 1, s.q.text, s.q.answer + 1, s.q.choices[s.q.answer], s.total, s.right, Math.round(s.rate * 100),
        s.counts[0] ?? '', s.counts[1] ?? '', s.q.choices.length > 2 ? s.counts[2] : '', s.q.choices.length > 3 ? s.counts[3] : '', s.total - s.answered, '']);
    });
    return RQ.toCSV(rows);
  }
  const FILES = () => [
    [fileBase() + '_응답.csv', answersCSV],
    [fileBase() + '_순위.csv', rankCSV],
    [fileBase() + '_문항별.csv', itemsCSV],
  ];
  async function saveFiles() {
    const note = $('#saved-note');
    if (!dirHandle) { note.textContent = '결과 저장 폴더를 지정하지 않았습니다. 위의 CSV 버튼으로 내려받으세요.'; return; }
    try {
      if (dirHandle.queryPermission && (await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('권한 없음');
      }
      for (const [name, make] of FILES()) {
        const fh = await dirHandle.getFileHandle(RQ.nfc(name), { create: true });
        const w = await fh.createWritable();
        await w.write(new Blob([make()], { type: 'text/csv;charset=utf-8' }));
        await w.close();
      }
      note.textContent = `"${dirHandle.name}" 폴더에 결과 파일 3개를 저장했습니다.`;
    } catch (e) {
      note.textContent = '폴더에 저장하지 못했습니다. 위의 CSV 버튼으로 내려받으세요.';
    }
  }
  $('#dl-answers').addEventListener('click', () => RQ.download(FILES()[0][0], answersCSV()));
  $('#dl-rank').addEventListener('click', () => RQ.download(FILES()[1][0], rankCSV()));
  $('#dl-items').addEventListener('click', () => RQ.download(FILES()[2][0], itemsCSV()));
  $('#btn-new').addEventListener('click', () => {
    if (!confirm('이 퀴즈를 닫고 새 퀴즈를 고를까요? 결과 CSV를 내려받았는지 확인하세요.')) return;
    if (link) link.close();
    link = null;
    localStorage.removeItem(KEY);
    S = null;
    picked = null;
    $('#picked').innerHTML = '<p class="small">왼쪽에서 퀴즈를 고르세요.</p>';
    $('#btn-open').disabled = true;
    initSetup();
  });

  window.addEventListener('beforeunload', (e) => {
    if (S && S.phase !== 'results') { e.preventDefault(); e.returnValue = ''; }
  });

  // 시험용 내부 확인 창구
  window.__rqHost = { get state() { return S; }, reveal: () => reveal(), next: () => $('#btn-next').click() };

  initSetup();
})();
