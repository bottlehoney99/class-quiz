/* 학생 화면 (UTF-8) */
'use strict';
(() => {
  const { $, $$, esc } = RQ;
  const STORE = 'rq-student';

  // 탭마다 따로 기억한다(sessionStorage). 새로고침하면 그대로 이어지고,
  // 탭을 닫았다 다시 열어도 같은 이름으로 들어오면 교사 쪽에서 점수를 이어 준다.
  const box = window.sessionStorage;
  let saved = {};
  try { saved = JSON.parse(box.getItem(STORE) || '{}'); } catch (e) { saved = {}; }
  const params = new URLSearchParams(location.search);

  let room = (params.get('room') || '').replace(/\D/g, '').slice(0, 6);
  let cid = null;
  let name = '';
  let char = '';
  let link = null;
  let joined = false;     // 교사 쪽에 이름이 등록됐는지
  let pendingJoin = false;
  let pingT = null;
  let clockT = null;
  let cur = null;         // 마지막으로 받은 화면 정보
  let qKey = '';
  let qRecvAt = 0, qBase = 0, qRemain = 0;
  let myPick = -1;

  const show = (id) => { $$('.sheet').forEach((s) => { s.hidden = s.id !== id; }); window.scrollTo(0, 0); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const store = () => { try { box.setItem(STORE, JSON.stringify({ room, cid, name, char })); } catch (e) { /* 무시 */ } };

  /* ---------- 입장 ---------- */
  function initJoin(msg) {
    show('s-join');
    $('#in-room').value = room || '';
    $('#in-name').value = name || (saved.room === room ? saved.name || '' : '');
    $('#join-err').textContent = msg || '';
    (room ? $('#in-name') : $('#in-room')).focus();
  }

  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = $('#in-room').value.replace(/\D/g, '');
    if (r.length !== 6) { $('#join-err').textContent = '방 번호 6자리를 입력하세요.'; return; }
    const chk = RQ.checkName($('#in-name').value);
    if (!chk.ok) { $('#join-err').textContent = chk.msg; return; }
    if (r !== room || !cid) {
      room = r;
      cid = (saved.room === room && saved.cid) ? saved.cid : RQ.randomId();
    }
    name = chk.name;
    if (saved.room === room && saved.name === name && saved.char) char = saved.char;
    store();
    $('#join-err').textContent = '';
    $('#btn-join').disabled = true;
    $('#btn-join').textContent = '연결 중…';
    pendingJoin = true;
    connect();
  });

  function connect() {
    if (link && link.room === room) { if (link.open) link.send({ t: 'hello' }); return; }
    link = new RQ.ClientLink(room, cid, { onMsg, onStatus });
  }

  function onStatus(s) {
    const lost = s === 'lost' || (s === 'connecting' && joined);
    $('#netbar').hidden = !lost;
    if (s === 'open') {
      link.send({ t: 'hello' });
      clearInterval(pingT);
      pingT = setInterval(() => { if (link.open) link.send({ t: 'ping' }); }, 5000);
    }
    if (s === 'nohost' && !joined) {
      resetJoinBtn();
      initJoin('그 번호의 방을 찾지 못했어요. 방 번호를 다시 확인하세요.');
    }
  }
  function resetJoinBtn() { $('#btn-join').disabled = false; $('#btn-join').textContent = '다음'; }

  /* ---------- 캐릭터 ---------- */
  function initChar() {
    show('s-char');
    $('#char-who').textContent = name;
    const ul = $('#char-grid');
    ul.innerHTML = RQ.CHARS.map((c) => `<li><button type="button" data-id="${c.id}"><span class="char">${RQ.charSVG(c.id, false)}</span>${esc(c.name)}</button></li>`).join('');
    $$('button', ul).forEach((b) => b.addEventListener('click', () => chooseChar(b.dataset.id)));
  }
  $('#btn-random').addEventListener('click', () => chooseChar(RQ.CHARS[Math.floor(Math.random() * RQ.CHARS.length)].id));
  function chooseChar(id) {
    char = id;
    store();
    link.send({ t: 'join', name, char });
  }

  /* ---------- 받은 메시지 ---------- */
  function onMsg(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'welcome') {
      if (!m.open) { message('퀴즈가 이미 끝났어요.'); return; }
      if (pendingJoin || (saved.room === room && saved.name)) {
        if (!name) name = saved.name;
        pendingJoin = false;
        resetJoinBtn();
        // 다시 들어온 경우 고른 캐릭터로 바로 등록
        if (char) link.send({ t: 'join', name, char }); else initChar();
      } else {
        initJoin();
      }
    } else if (m.t === 'rejected') {
      joined = false;
      resetJoinBtn();
      initJoin(m.reason || '들어갈 수 없어요.');
    } else if (m.t === 'kicked') {
      joined = false;
      try { box.removeItem(STORE); } catch (e) { /* 무시 */ }
      message('선생님이 내보냈어요. 이름을 확인하고 다시 들어오세요.');
    } else if (m.t === 'state') {
      joined = true;
      pendingJoin = false;
      resetJoinBtn();
      if (m.me) { name = m.me.name; char = m.me.char; store(); }
      render(m);
    }
  }

  function message(text) {
    show('s-msg');
    $('#msg-text').textContent = text;
  }
  $('#btn-again').addEventListener('click', () => { location.href = location.pathname + (RQ.mode() === 'local' ? '?mode=local' : ''); });

  /* ---------- 화면 그리기 ---------- */
  function render(m) {
    cur = m;
    $$('.qtitle').forEach((el) => { el.textContent = m.title || ''; });
    if (m.phase === 'lobby') {
      wait('선생님이 시작할 때까지 기다려 주세요', '');
    } else if (m.phase === 'question') {
      if (m.answered) { renderQuestion(m); lockAnswer(m.myChoice); } else renderQuestion(m);
    } else if (m.phase === 'reveal') {
      renderResult(m);
    } else if (m.phase === 'leader') {
      wait(`지금 ${m.count}명 중 ${m.rank}등`, '다음 문제를 기다리는 중');
    } else if (m.phase === 'podium' || m.phase === 'results') {
      renderFinal(m);
    }
  }

  function wait(msg, sub) {
    clearInterval(clockT);
    show('s-wait');
    $('#wait-char').innerHTML = RQ.charSVG(cur.me.char);
    $('#wait-name').textContent = cur.me.name;
    $('#wait-msg').textContent = msg;
    $('#wait-sub').textContent = sub;
    $('#wait-score').textContent = cur.qi >= 0 ? RQ.fmt(cur.me.score) + '점' : '';
  }

  function renderQuestion(m) {
    const key = room + ':' + m.qi;
    qRecvAt = performance.now();
    qRemain = m.q.remainingMs;
    qBase = m.q.limitMs - m.q.remainingMs;   // 받은 시점까지 이미 지난 시간
    cur.limitMs = m.q.limitMs;
    if (key === qKey && !$('#s-q').hidden) { tickClock(); return; } // 시간 연장 등: 다시 그리지 않음
    qKey = key;
    myPick = -1;
    show('s-q');
    $('#q-char').innerHTML = RQ.charSVG(m.me.char);
    $('#q-name').textContent = m.me.name;
    $('#q-score').textContent = RQ.fmt(m.me.score) + '점';
    $('#q-no').textContent = m.qi + 1;
    $('#q-total').textContent = m.total;
    $('#q-tag').textContent = '문항 ' + (m.qi + 1);
    $('#q-text').textContent = m.q.text;
    const img = $('#q-img');
    const src = RQ.imgSrc(m.q.image);
    img.hidden = !src;
    if (src) img.src = src;
    $('#q-hint').textContent = '답을 누르면 바로 제출되고, 바꿀 수 없어요.';
    const box = $('#q-choices');
    box.classList.remove('locked');
    box.innerHTML = m.q.choices.map((c) => `<button type="button" class="opt c${c.n + 1}" data-n="${c.n}"><span class="bubble">${c.n + 1}</span><span>${esc(c.text)}</span></button>`).join('');
    $$('.opt', box).forEach((b) => b.addEventListener('click', () => pickAnswer(Number(b.dataset.n))));
    clearInterval(clockT);
    clockT = setInterval(tickClock, 200);
    tickClock();
  }
  function tickClock() {
    const remain = qRemain - (performance.now() - qRecvAt);
    const sec = Math.max(0, Math.ceil(remain / 1000));
    $('#q-clock').textContent = sec + '초';
    $('#q-clock').classList.toggle('low', sec <= 5);
    const frac = Math.max(0, Math.min(1, remain / (cur.limitMs || 1)));
    $('#q-bar').style.transform = `scaleX(${frac})`;
    if (remain <= 0) {
      clearInterval(clockT);
      if (myPick < 0) { $('#q-choices').classList.add('locked'); $$('.opt').forEach((b) => { b.disabled = true; }); $('#q-hint').textContent = '시간이 끝났어요.'; }
    }
  }
  function pickAnswer(n) {
    if (myPick >= 0) return;
    const elapsed = qBase + (performance.now() - qRecvAt);
    link.send({ t: 'answer', qi: cur.qi, choice: n, elapsed: Math.round(elapsed) });
    lockAnswer(n);
  }
  function lockAnswer(n) {
    myPick = n;
    const box = $('#q-choices');
    box.classList.add('locked');
    $$('.opt', box).forEach((b) => { b.disabled = true; b.classList.toggle('mine', Number(b.dataset.n) === n); });
    $('#q-hint').textContent = '제출했어요. 다른 친구들을 기다리는 중…';
  }

  function renderResult(m) {
    clearInterval(clockT);
    show('s-res');
    $('#r-no').textContent = m.qi + 1;
    $('#r-rank').textContent = `${m.count}명 중 ${m.rank}등`;
    const v = $('#r-verdict');
    const q = m.q;
    const right = q.choices.find((c) => c.n === m.correctIdx);
    if (m.skipped) {
      v.className = 'verdict no'; v.textContent = '건너뛴 문제';
      $('#r-gain').textContent = '';
    } else if (m.correct) {
      v.className = 'verdict ok'; v.innerHTML = '정답!<span class="stamp-o" aria-hidden="true"></span>';
      $('#r-gain').textContent = '+' + RQ.fmt(m.points) + '점';
    } else {
      v.className = 'verdict no'; v.textContent = m.myChoice < 0 ? '시간이 끝났어요' : '아쉬워요';
      $('#r-gain').textContent = '';
    }
    $('#r-answer').innerHTML = right ? `정답은 <span class="bubble c${right.n + 1}">${right.n + 1}</span> ${esc(right.text)}` : '';
    $('#r-explain').textContent = m.explain || '';
    $('#r-total').textContent = `지금까지 ${RQ.fmt(m.me.score)}점`;
  }

  function renderFinal(m) {
    clearInterval(clockT);
    show('s-final');
    $('#f-char').innerHTML = RQ.charSVG(m.me.char);
    $('#f-rank').textContent = `${m.count}명 중 ${m.rank}등`;
    $('#f-score').textContent = RQ.fmt(m.me.score) + '점';
    $('#f-top').innerHTML = (m.top3 || []).map((t, i) => `<li><span class="place">${i + 1}</span><span class="char">${RQ.charSVG(t.char)}</span><span>${esc(t.name)}</span><span class="sc num">${RQ.fmt(t.score)}</span></li>`).join('');
  }

  /* ---------- 시작 ---------- */
  if (room && saved.room === room && saved.cid && saved.name) {
    // 새로고침했거나 연결이 끊겼다가 다시 연 경우: 저장된 정보로 바로 다시 연결
    cid = saved.cid; name = saved.name; char = saved.char || '';
    show('s-wait');
    $('#wait-name').textContent = name;
    $('#wait-char').innerHTML = char ? RQ.charSVG(char) : '';
    $('#wait-msg').textContent = '다시 연결하는 중…';
    connect();
  } else {
    initJoin();
  }

  window.__rqStudent = { get state() { return cur; } };
})();
