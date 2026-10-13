/* 복습 퀴즈 공통 모듈 (UTF-8) */
'use strict';

const RQ = {};

RQ.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
RQ.$ = (sel, root = document) => root.querySelector(sel);
RQ.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
RQ.nfc = (s) => String(s ?? '').normalize('NFC');

RQ.toast = (msg, ms = 2600) => {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(RQ._toastT);
  RQ._toastT = setTimeout(() => { el.hidden = true; }, ms);
};

RQ.randomId = (n = 12) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
};

RQ.fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

/* ---------- 점수 ---------- */
// 맞히면 1000점에서 시작해 제한 시간 끝에 500점까지 줄어든다. 틀리면 0점.
RQ.points = (correct, elapsedMs, limitMs) => {
  if (!correct) return 0;
  const t = Math.min(Math.max(elapsedMs, 0), limitMs);
  return Math.round(1000 * (1 - (t / limitMs) / 2));
};

/* ---------- CSV ---------- */
RQ.decodeBytes = (buf) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch (e) {
    // 엑셀에서 그냥 'CSV'로 저장하면 CP949(EUC-KR)로 저장된다
    return new TextDecoder('euc-kr').decode(buf);
  }
};

RQ.parseCSV = (text) => {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  text = String(text).replace(/^﻿/, '');
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
};

RQ.toCSV = (rows) => '﻿' + rows.map((r) => r.map((v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(',')).join('\r\n') + '\r\n';

RQ.QUIZ_HEADER = ['번호', '문제', '선택지1', '선택지2', '선택지3', '선택지4', '정답', '제한시간', '해설', '그림'];

RQ.quizFromRows = (rows, title) => {
  const errors = [];
  if (!rows.length) return { quiz: null, errors: ['파일이 비어 있습니다.'] };
  const head = rows[0].map((h) => RQ.nfc(h).replace(/\s/g, ''));
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const col = {
    text: idx(['문제', '질문']),
    c1: idx(['선택지1', '보기1', '1']),
    c2: idx(['선택지2', '보기2', '2']),
    c3: idx(['선택지3', '보기3', '3']),
    c4: idx(['선택지4', '보기4', '4']),
    ans: idx(['정답', '답']),
    time: idx(['제한시간', '시간', '제한시간(초)']),
    exp: idx(['해설', '설명']),
    img: idx(['그림', '이미지', '사진']),
  };
  if (col.text < 0 || col.c1 < 0 || col.c2 < 0 || col.ans < 0) {
    return { quiz: null, errors: ['첫 줄에 "문제, 선택지1, 선택지2, 정답" 열 이름이 있어야 합니다.'] };
  }
  const questions = [];
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (c) => (c >= 0 ? RQ.nfc(r[c] ?? '').trim() : '');
    const text = get(col.text);
    const choices = [get(col.c1), get(col.c2), get(col.c3), get(col.c4)];
    while (choices.length > 2 && !choices[choices.length - 1]) choices.pop();
    if (!text) { errors.push(`${line}번째 줄: 문제가 비어 있습니다.`); return; }
    if (choices.some((c) => !c)) { errors.push(`${line}번째 줄: 비어 있는 선택지가 중간에 있습니다.`); return; }
    const ansRaw = get(col.ans).replace(/[^0-9OoXx○×]/g, '');
    let answer = parseInt(ansRaw, 10) - 1;
    if (Number.isNaN(answer)) {
      // O/X로 적은 경우
      const ox = ansRaw.toUpperCase();
      if (ox === 'O' || ox === '○') answer = choices.findIndex((c) => /^(O|○|맞다|참)$/i.test(c));
      if (ox === 'X' || ox === '×') answer = choices.findIndex((c) => /^(X|×|틀리다|거짓)$/i.test(c));
    }
    if (!(answer >= 0 && answer < choices.length)) { errors.push(`${line}번째 줄: 정답 번호가 선택지 범위를 벗어났습니다.`); return; }
    let time = parseInt(get(col.time), 10);
    if (!(time >= 5 && time <= 240)) time = 20;
    questions.push({ text, choices, answer, time, explain: get(col.exp), image: get(col.img) });
  });
  if (!questions.length && !errors.length) errors.push('문제가 한 개도 없습니다.');
  return { quiz: questions.length ? { title: RQ.nfc(title || '이름 없는 퀴즈'), questions } : null, errors };
};

RQ.quizToRows = (quiz) => [RQ.QUIZ_HEADER].concat(quiz.questions.map((q, i) => [
  i + 1, q.text, q.choices[0] || '', q.choices[1] || '', q.choices[2] || '', q.choices[3] || '',
  q.answer + 1, q.time, q.explain || '', q.image || '',
]));

RQ.download = (filename, text, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = RQ.nfc(filename);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

// 그림 칸: 인터넷 주소면 그대로, 파일 이름만 있으면 quizzes/images/ 폴더에서 찾는다
RQ.imgSrc = (img) => {
  const s = String(img || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(javascript|data|vbscript):/i.test(s)) return '';
  return s.includes('/') ? s.replace(/^\/+/, '') : 'quizzes/images/' + encodeURIComponent(RQ.nfc(s));
};

RQ.safeName =(s) => RQ.nfc(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 60) || '퀴즈';

RQ.today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- 이름 검사 ---------- */
RQ.BAD_WORDS = ['씨발', '시발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '새끼', '좆', '존나', '썅', '지랄', '니애미', '느금', '섹스', '야동', 'fuck', 'shit', 'bitch', 'sex'];
RQ.checkName = (raw) => {
  const name = RQ.nfc(raw).replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, msg: '이름을 입력하세요.' };
  if ([...name].length > 12) return { ok: false, msg: '이름은 12자까지 쓸 수 있어요.' };
  const flat = name.toLowerCase().replace(/[\s\d._\-~!@#$%^&*()]/g, '');
  if (RQ.BAD_WORDS.some((w) => flat.includes(w))) return { ok: false, msg: '쓸 수 없는 말이 들어 있어요.' };
  return { ok: true, name };
};

/* ---------- 캐릭터 ---------- */
const INK = '#1C1B19';
RQ.CHARS = [
  { id: 'bear', name: '곰', svg: `<circle cx="28" cy="34" r="16" fill="#8E5A35"/><circle cx="92" cy="34" r="16" fill="#8E5A35"/><circle cx="28" cy="34" r="8" fill="#D9B48C"/><circle cx="92" cy="34" r="8" fill="#D9B48C"/><circle cx="60" cy="68" r="42" fill="#A86B3F"/><ellipse cx="60" cy="84" rx="20" ry="15" fill="#EAD2B0"/><circle cx="45" cy="62" r="5" fill="${INK}"/><circle cx="75" cy="62" r="5" fill="${INK}"/><ellipse cx="60" cy="77" rx="7" ry="5" fill="${INK}"/>` },
  { id: 'chick', name: '병아리', svg: `<path d="M52 22 C54 12 60 10 62 18 C64 10 72 12 68 24" fill="none" stroke="#E3AC2E" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="68" r="44" fill="#F3C53A"/><circle cx="44" cy="60" r="5.5" fill="${INK}"/><circle cx="76" cy="60" r="5.5" fill="${INK}"/><path d="M51 72 L69 72 L60 84 Z" fill="#E07A2E"/><circle cx="34" cy="76" r="7" fill="#EE9A86"/><circle cx="86" cy="76" r="7" fill="#EE9A86"/>` },
  { id: 'rabbit', name: '토끼', svg: `<ellipse cx="45" cy="30" rx="11" ry="27" fill="#FBF8F1" stroke="${INK}" stroke-width="3"/><ellipse cx="75" cy="30" rx="11" ry="27" fill="#FBF8F1" stroke="${INK}" stroke-width="3"/><ellipse cx="45" cy="32" rx="5" ry="17" fill="#EFA7A0"/><ellipse cx="75" cy="32" rx="5" ry="17" fill="#EFA7A0"/><circle cx="60" cy="76" r="36" fill="#FBF8F1" stroke="${INK}" stroke-width="3"/><circle cx="47" cy="72" r="4.5" fill="${INK}"/><circle cx="73" cy="72" r="4.5" fill="${INK}"/><ellipse cx="60" cy="84" rx="5" ry="3.5" fill="#E07A7A"/>` },
  { id: 'cat', name: '고양이', svg: `<path d="M24 50 L30 14 L54 34 Z" fill="#E39A52"/><path d="M96 50 L90 14 L66 34 Z" fill="#E39A52"/><path d="M31 40 L33 24 L45 34 Z" fill="#F4C9A0"/><path d="M89 40 L87 24 L75 34 Z" fill="#F4C9A0"/><circle cx="60" cy="70" r="40" fill="#E9A15A"/><path d="M48 34 L52 46 M60 32 L60 46 M72 34 L68 46" stroke="#C47A3A" stroke-width="4" stroke-linecap="round"/><circle cx="46" cy="66" r="5" fill="${INK}"/><circle cx="74" cy="66" r="5" fill="${INK}"/><path d="M55 78 L65 78 L60 84 Z" fill="#D9636A"/><path d="M30 80 L14 76 M30 86 L14 88 M90 80 L106 76 M90 86 L106 88" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>` },
  { id: 'dog', name: '강아지', svg: `<circle cx="60" cy="66" r="40" fill="#E6CFA6"/><ellipse cx="22" cy="62" rx="13" ry="28" fill="#8A5A3A" transform="rotate(14 22 62)"/><ellipse cx="98" cy="62" rx="13" ry="28" fill="#8A5A3A" transform="rotate(-14 98 62)"/><ellipse cx="74" cy="56" rx="12" ry="10" fill="#C9A273"/><circle cx="46" cy="58" r="5" fill="${INK}"/><circle cx="74" cy="58" r="5" fill="${INK}"/><ellipse cx="60" cy="76" rx="9" ry="6.5" fill="${INK}"/><path d="M60 82 L60 90 M52 92 Q60 98 68 92" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { id: 'penguin', name: '펭귄', svg: `<ellipse cx="60" cy="66" rx="42" ry="46" fill="#2F3A48"/><path d="M60 40 C 34 40, 30 64, 34 80 C 40 100, 80 100, 86 80 C 90 64, 86 40, 60 40 Z" fill="#FBF8F1"/><circle cx="48" cy="62" r="5" fill="${INK}"/><circle cx="72" cy="62" r="5" fill="${INK}"/><path d="M52 70 L68 70 L60 80 Z" fill="#E3AC2E"/><circle cx="40" cy="76" r="5" fill="#EE9A86"/><circle cx="80" cy="76" r="5" fill="#EE9A86"/>` },
  { id: 'fox', name: '여우', svg: `<path d="M20 52 L28 12 L54 36 Z" fill="#D9692F"/><path d="M100 52 L92 12 L66 36 Z" fill="#D9692F"/><path d="M28 42 L31 24 L44 36 Z" fill="${INK}"/><path d="M92 42 L89 24 L76 36 Z" fill="${INK}"/><circle cx="60" cy="66" r="40" fill="#E07A35"/><path d="M22 70 C 34 74, 48 84, 60 100 C 72 84, 86 74, 98 70 C 92 96, 76 106, 60 106 C 44 106, 28 96, 22 70 Z" fill="#FBF8F1"/><circle cx="46" cy="62" r="5" fill="${INK}"/><circle cx="74" cy="62" r="5" fill="${INK}"/><ellipse cx="60" cy="86" rx="6" ry="4.5" fill="${INK}"/>` },
  { id: 'frog', name: '개구리', svg: `<circle cx="36" cy="40" r="17" fill="#6FA85A"/><circle cx="84" cy="40" r="17" fill="#6FA85A"/><circle cx="36" cy="40" r="10" fill="#FBF8F1"/><circle cx="84" cy="40" r="10" fill="#FBF8F1"/><circle cx="37" cy="41" r="5" fill="${INK}"/><circle cx="83" cy="41" r="5" fill="${INK}"/><ellipse cx="60" cy="74" rx="46" ry="34" fill="#7DB866"/><path d="M38 78 Q60 96 82 78" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="32" cy="74" r="6" fill="#EE9A86"/><circle cx="88" cy="74" r="6" fill="#EE9A86"/>` },
  { id: 'pig', name: '돼지', svg: `<path d="M26 44 L30 18 L50 34 Z" fill="#E78C99"/><path d="M94 44 L90 18 L70 34 Z" fill="#E78C99"/><circle cx="60" cy="66" r="42" fill="#F2A7B0"/><ellipse cx="60" cy="76" rx="16" ry="12" fill="#E78C99"/><ellipse cx="54" cy="76" rx="3.5" ry="5" fill="${INK}"/><ellipse cx="66" cy="76" rx="3.5" ry="5" fill="${INK}"/><circle cx="44" cy="56" r="5" fill="${INK}"/><circle cx="76" cy="56" r="5" fill="${INK}"/>` },
  { id: 'panda', name: '판다', svg: `<circle cx="28" cy="34" r="15" fill="${INK}"/><circle cx="92" cy="34" r="15" fill="${INK}"/><circle cx="60" cy="68" r="42" fill="#FBF8F1" stroke="${INK}" stroke-width="3"/><ellipse cx="44" cy="64" rx="10" ry="13" fill="${INK}" transform="rotate(25 44 64)"/><ellipse cx="76" cy="64" rx="10" ry="13" fill="${INK}" transform="rotate(-25 76 64)"/><circle cx="45" cy="62" r="3.5" fill="#FBF8F1"/><circle cx="75" cy="62" r="3.5" fill="#FBF8F1"/><ellipse cx="60" cy="80" rx="6" ry="4.5" fill="${INK}"/><path d="M52 90 Q60 96 68 90" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  { id: 'owl', name: '부엉이', svg: `<path d="M24 34 L34 14 L44 32 Z" fill="#6E4F35"/><path d="M96 34 L86 14 L76 32 Z" fill="#6E4F35"/><ellipse cx="60" cy="68" rx="42" ry="44" fill="#8C6A4A"/><ellipse cx="60" cy="88" rx="24" ry="20" fill="#D9C2A0"/><circle cx="42" cy="56" r="15" fill="#FBF8F1"/><circle cx="78" cy="56" r="15" fill="#FBF8F1"/><circle cx="42" cy="57" r="7" fill="${INK}"/><circle cx="78" cy="57" r="7" fill="${INK}"/><path d="M54 70 L66 70 L60 80 Z" fill="#E3AC2E"/>` },
  { id: 'whale', name: '고래', svg: `<path d="M60 24 L60 12 M60 24 C 52 16, 46 14, 40 16 M60 24 C 68 16, 74 14, 80 16" stroke="#7DB8E0" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="60" cy="70" rx="48" ry="40" fill="#4F7FB0"/><path d="M18 80 C 30 104, 90 104, 102 80 C 86 92, 34 92, 18 80 Z" fill="#DCE9F2"/><circle cx="42" cy="64" r="5" fill="${INK}"/><circle cx="78" cy="64" r="5" fill="${INK}"/><path d="M50 78 Q60 86 70 78" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="34" cy="74" r="5" fill="#EE9A86"/><circle cx="86" cy="74" r="5" fill="#EE9A86"/>` },
];
RQ.charById = (id) => RQ.CHARS.find((c) => c.id === id) || RQ.CHARS[0];
RQ.charSVG = (id, label = true) => {
  const c = RQ.charById(id);
  const a = label ? `role="img" aria-label="${RQ.esc(c.name)} 캐릭터"` : 'aria-hidden="true"';
  return `<svg viewBox="0 0 120 120" ${a} xmlns="http://www.w3.org/2000/svg">${c.svg}</svg>`;
};

/* ---------- 통신 ----------
   p2p   : PeerJS(WebRTC)로 교사 브라우저와 학생 브라우저가 직접 연결
   local : 같은 브라우저의 탭끼리 BroadcastChannel로 연결 (시험용, 주소 끝에 ?mode=local)
*/
RQ.mode = () => (new URLSearchParams(location.search).get('mode') === 'local' ? 'local' : 'p2p');
RQ.PEER_PREFIX = 'bokseup-quiz-room-';

RQ.HostLink = class {
  constructor(room, handlers) {
    this.room = room;
    this.h = handlers; // { onMsg(cid, msg), onReady(), onError(text), onClose(cid) }
    this.conns = new Map(); // cid -> conn
    this.mode = RQ.mode();
    this.closed = false;
    if (this.mode === 'local') this._local(); else this._p2p(0);
  }
  _local() {
    this.ch = new BroadcastChannel('rq-' + this.room);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== 'host' || typeof m.from !== 'string') return;
      this.conns.set(m.from, 'local');
      this.h.onMsg(m.from, m.data);
    };
    setTimeout(() => this.h.onReady(), 0);
  }
  _p2p(attempt) {
    if (typeof Peer === 'undefined') { this.h.onError('연결 라이브러리를 불러오지 못했습니다.'); return; }
    this.peer = new Peer(RQ.PEER_PREFIX + this.room, { debug: 0 });
    this.peer.on('open', () => this.h.onReady());
    this.peer.on('connection', (conn) => {
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        if (typeof d.cid === 'string' && d.cid.length < 40) {
          conn._cid = d.cid;
          const old = this.conns.get(d.cid);
          if (old && old !== conn) { try { old.close(); } catch (e) { /* 무시 */ } }
          this.conns.set(d.cid, conn);
        }
        if (conn._cid) this.h.onMsg(conn._cid, d);
      });
      conn.on('close', () => {
        if (conn._cid && this.conns.get(conn._cid) === conn) { this.conns.delete(conn._cid); this.h.onClose && this.h.onClose(conn._cid); }
      });
      conn.on('error', () => {});
    });
    this.peer.on('disconnected', () => { if (!this.closed) setTimeout(() => { try { this.peer.reconnect(); } catch (e) { /* 무시 */ } }, 1500); });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 6) {
        // 새로고침 직후에는 같은 방 번호가 잠시 남아 있을 수 있다
        this.peer.destroy();
        setTimeout(() => this._p2p(attempt + 1), 2500);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.h.onError('연결 중계 서버에 접속하지 못했습니다. 인터넷 연결이나 학교망 차단을 확인하세요.');
      } else if (err.type === 'unavailable-id') {
        this.h.onError('같은 방 번호가 이미 쓰이고 있습니다. 다른 탭에서 열려 있는지 확인하세요.');
      }
    });
  }
  send(cid, msg) {
    if (this.mode === 'local') { this.ch.postMessage({ to: cid, from: 'host', data: msg }); return; }
    const c = this.conns.get(cid);
    if (c && c.open) { try { c.send(msg); } catch (e) { /* 무시 */ } }
  }
  close() {
    this.closed = true;
    if (this.ch) this.ch.close();
    if (this.peer) this.peer.destroy();
  }
};

RQ.ClientLink = class {
  constructor(room, cid, handlers) {
    this.room = room;
    this.cid = cid;
    this.h = handlers; // { onMsg(msg), onStatus('connecting'|'open'|'lost'|'nohost') }
    this.mode = RQ.mode();
    this.open = false;
    this.fails = 0;
    if (this.mode === 'local') {
      this.ch = new BroadcastChannel('rq-' + room);
      this.ch.onmessage = (e) => { const m = e.data; if (m && m.to === this.cid) this.h.onMsg(m.data); };
      this.open = true;
      setTimeout(() => this.h.onStatus('open'), 0);
    } else {
      this._peer();
    }
  }
  _peer() {
    this.h.onStatus('connecting');
    this.peer = new Peer({ debug: 0 });
    this.peer.on('open', () => this._connect());
    this.peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.fails++;
        this.h.onStatus(this.fails >= 2 ? 'nohost' : 'connecting');
        setTimeout(() => this._connect(), 2500);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.h.onStatus('lost');
        setTimeout(() => { try { this.peer.destroy(); } catch (e) { /* 무시 */ } this._peer(); }, 3000);
      }
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* 무시 */ } });
  }
  _connect() {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* 무시 */ } }
    const conn = this.peer.connect(RQ.PEER_PREFIX + this.room, { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      this.open = true; this.fails = 0;
      this.h.onStatus('open');
    });
    conn.on('data', (d) => this.h.onMsg(d));
    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.open = false;
      this.h.onStatus('lost');
      setTimeout(() => { if (this.conn === conn) this._connect(); }, 2000);
    });
    conn.on('error', () => {});
  }
  send(msg) {
    msg.cid = this.cid;
    if (this.mode === 'local') { this.ch.postMessage({ to: 'host', from: this.cid, data: msg }); return; }
    if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (e) { /* 무시 */ } }
  }
};

window.RQ = RQ;
