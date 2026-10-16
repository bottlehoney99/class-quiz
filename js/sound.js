/* 교사 화면 배경음·효과음 (UTF-8)
   음원은 sounds/ 폴더에 있고 모두 CC0(저작권 포기) 음원이다. 출처는 sounds/CREDITS.md 참고.
   파일이 없으면 조용히 건너뛴다. */
'use strict';

const Sound = (() => {
  const DIR = 'sounds/';
  const FILES = {
    lobby: 'lobby.mp3',        // Happy Clappy Loop
    q1: 'question-1.mp3',      // Music loop variations 1단계
    q2: 'question-2.mp3',      // 2단계
    q3: 'question-3.mp3',      // 3단계
    timeup: 'timeup.mp3',      // Time runs out (남은 5초)
    reveal: 'reveal.mp3',      // Kenney 확인음 (정답 공개)
    join: 'join.mp3',          // Kenney 짧은 효과음 (학생 입장)
    step: 'step.mp3',          // Kenney 효과음 (시상대 3·2등 등장)
    fanfare: 'fanfare.mp3',    // Victory Fanfare Short (1등 등장)
  };
  const LOOPS = new Set(['lobby', 'q1', 'q2', 'q3']);
  const VOL = { music: 0.45, sfx: 0.8 };
  const KEY = 'rq-sound-muted';

  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* 무시 */ }

  const el = {};
  const missing = new Set();
  let current = null;   // 지금 흐르는 배경음 이름

  function get(name) {
    if (missing.has(name) || !FILES[name]) return null;
    if (!el[name]) {
      const a = new Audio(DIR + FILES[name]);
      a.preload = 'auto';
      a.loop = LOOPS.has(name);
      a.addEventListener('error', () => { missing.add(name); });
      el[name] = a;
    }
    return el[name];
  }

  function fadeTo(a, target, ms, done) {
    const start = a.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = start + (target - start) * k;
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
  }

  // 배경음 바꾸기. 같은 곡이면 그대로 둔다.
  function music(name, fadeMs = 600) {
    if (current === name) return;
    const prev = current ? el[current] : null;
    current = name;
    if (prev) fadeTo(prev, 0, fadeMs, () => { if (el[current] !== prev) prev.pause(); });
    if (!name) return;
    const a = get(name);
    if (!a) return;
    a.currentTime = 0;
    a.volume = 0;
    if (!muted) a.play().then(() => fadeTo(a, VOL.music, fadeMs)).catch(() => {});
  }

  function stopMusic(fadeMs = 400) { music(null, fadeMs); }

  // 배경음 소리를 잠깐 줄이기 (효과음이 잘 들리게)
  function duck(on) {
    const a = current && el[current];
    if (!a || muted) return;
    fadeTo(a, on ? VOL.music * 0.3 : VOL.music, 250);
  }

  function sfx(name) {
    if (muted) return;
    const a = get(name);
    if (!a) return;
    const b = a.cloneNode();
    b.volume = VOL.sfx;
    b.play().catch(() => {});
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch (e) { /* 무시 */ }
    const a = current && el[current];
    if (a) {
      if (m) a.pause();
      else { a.volume = VOL.music; a.play().catch(() => {}); }
    }
    Object.keys(el).forEach((k) => { if (!LOOPS.has(k) && m) el[k].pause(); });
    renderButton();
  }

  // 화면 왼쪽 아래 음소거 버튼
  let btn = null;
  function renderButton() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
    btn.title = muted ? '소리 켜기' : '소리 끄기';
    btn.innerHTML = muted
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg><span>소리 꺼짐</span>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg><span>소리 켜짐</span>';
  }
  function mountButton() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sound-btn';
    btn.addEventListener('click', () => setMuted(!muted));
    document.body.appendChild(btn);
    renderButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton); else mountButton();

  // 미리 받아 두기: 교사가 처음 버튼을 누를 때 한꺼번에
  function preload() { Object.keys(FILES).forEach(get); }

  return { music, stopMusic, sfx, duck, preload, get muted() { return muted; } };
})();

window.Sound = Sound;
