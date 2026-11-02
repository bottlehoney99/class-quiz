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
    // 번호만 적혀 있고 나머지가 빈 줄(엑셀에서 미리 번호를 매겨 둔 줄)은 조용히 건너뛴다
    if (!text && !choices.some((c) => c) && !get(col.ans) && !get(col.exp)) return;
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

/* ---------- 캐릭터 ----------
   그림은 characters/<id>.webp (256×256, 배경 투명 원형).
   새 캐릭터를 넣으려면 그림 파일을 characters/ 폴더에 올리고 아래 목록에 한 줄 추가한다. */
RQ.CHARS = [
  { id: 'hellocat', name: '안녕냥' },
  { id: 'pilotcat', name: '조종사냥' },
  { id: 'carrot', name: '당근토끼' },
  { id: 'seedham', name: '씨앗햄찌' },
  { id: 'schoolpeng', name: '등교펭귄' },
  { id: 'bamboopanda', name: '대나무판다' },
  { id: 'bandanashiba', name: '두건시바' },
  { id: 'fluffysheep', name: '몽실양' },
  { id: 'captainotter', name: '선장수달' },
  { id: 'rawrdino', name: '크앙공룡' },
  { id: 'magiccat', name: '마법냥' },
  { id: 'spacekid', name: '우주꼬마' },
  { id: 'ninjacat', name: '닌자냥' },
  { id: 'angelpuff', name: '천사뭉치' },
  { id: 'mermaidseal', name: '인어물범' },
  { id: 'detectivedog', name: '명탐정멍' },
  { id: 'gamercat', name: '게이머냥' },
  { id: 'chefdog', name: '셰프멍' },
  { id: 'robotcat', name: '로봇냥' },
  { id: 'calico', name: '삼색이' },
  { id: 'shiba', name: '시바' },
  { id: 'rabbit', name: '토끼' },
  { id: 'panda', name: '판다' },
  { id: 'penguin', name: '펭귄' },
  { id: 'coolcat', name: '멋쟁이' },
  { id: 'unicorn', name: '유니콘' },
  { id: 'dino', name: '공룡' },
  { id: 'otter', name: '수달' },
  { id: 'hedgehog', name: '고슴도치' },
  { id: 'redpanda', name: '레서판다' },
  { id: 'ghost', name: '유령' },
  { id: 'robot', name: '로봇' },
  { id: 'astronaut', name: '우주인' },
  { id: 'wizard', name: '마법사' },
  { id: 'fairy', name: '요정' },
  { id: 'blossom', name: '벚꽃나무' },
  { id: 'volcano', name: '화산' },
  { id: 'whale', name: '고래' },
  { id: 'polarbear', name: '북극곰' },
  { id: 'sun', name: '해님' },
];
// 목록에 없는 이름이라도 형식만 맞으면 그대로 쓴다.
// (교사 화면과 학생 화면의 코드 버전이 달라도 학생이 고른 캐릭터가 바뀌지 않게)
RQ.validCharId = (id) => typeof id === 'string' && /^[a-z0-9_-]{1,24}$/.test(id);
RQ.charById = (id) => RQ.CHARS.find((c) => c.id === id) || (RQ.validCharId(id) ? { id, name: '캐릭터' } : RQ.CHARS[0]);
RQ.charSVG = (id, label = true) => {
  const c = RQ.charById(id);
  const alt = label ? `${RQ.esc(c.name)} 캐릭터` : '';
  const fallback = `characters/${RQ.CHARS[0].id}.webp`;
  return `<img src="characters/${c.id}.webp" alt="${alt}" width="256" height="256" draggable="false" decoding="async" onerror="this.onerror=null;this.src='${fallback}'"${label ? '' : ' aria-hidden="true"'}>`;
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
