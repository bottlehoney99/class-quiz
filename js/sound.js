/* 교사 화면 배경음·효과음 (UTF-8)
   1) sounds/ 폴더에 음원 파일(CC0)이 있으면 그 파일을 튼다. 출처는 sounds/CREDITS.md.
   2) 파일이 없으면 브라우저가 직접 음을 만들어 대신 낸다(Web Audio).
      코드로 만든 소리라 저작권 문제가 없다. */
'use strict';

const Sound = (() => {
  const DIR = 'sounds/';
  const FILES = {
    lobby: 'lobby.mp3',        // Happy Clappy Loop
    q1: 'question-1.mp3',      // Music loop variations 1단계
    q2: 'question-2.mp3',      // 2단계
    q3: 'question-3.mp3',      // 3단계
    timeup: 'timeup.mp3',      // Time runs out (남은 5초)
    reveal: 'reveal.mp3',      // 정답 공개
    join: 'join.mp3',          // 학생 입장
    step: 'step.mp3',          // 시상대 3·2등 등장
    fanfare: 'fanfare.mp3',    // 시상대 1등 등장
  };
  const LOOPS = new Set(['lobby', 'q1', 'q2', 'q3']);
  const VOL = { music: 0.45, sfx: 0.8 };
  const KEY = 'rq-sound-muted';

  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* 무시 */ }

  /* ---------- 파일이 있는지 확인 ---------- */
  const has = {};
  let checked = null;
  function check() {
    if (!checked) {
      checked = Promise.all(Object.keys(FILES).map((k) =>
        fetch(DIR + FILES[k], { method: 'HEAD', cache: 'no-store' })
          .then((r) => { has[k] = r.ok && !/text\/html/.test(r.headers.get('content-type') || ''); })
          .catch(() => { has[k] = false; })));
    }
    return checked;
  }

  /* ---------- 파일 재생 ---------- */
  const el = {};
  function fileEl(name) {
    if (!el[name]) {
      const a = new Audio(DIR + FILES[name]);
      a.preload = 'auto';
      a.loop = LOOPS.has(name);
      el[name] = a;
    }
    return el[name];
  }
  function fadeTo(a, target, ms, done) {
    const start = a.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / Math.max(ms, 1));
      a.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
  }

  /* ---------- 직접 만드는 소리 (Web Audio) ---------- */
  let ac = null, master, musicBus, sfxBus, noiseBuf;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = VOL.sfx; sfxBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  // 브라우저는 사용자가 한 번 누른 뒤에야 소리를 허락한다
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (ac && ac.state === 'suspended') ac.resume(); }, { capture: true }));

  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 -> 주파수
  function tone(bus, note, t, dur, type = 'triangle', vol = 0.3, glideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz(note), t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(hz(glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hat(bus, t, vol = 0.08, dur = 0.05) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(bus, t, vol = 0.5) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25);
  }
  function clap(bus, t, vol = 0.18) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.15);
  }

  // 16분음표 단위 악보. 각 칸은 [음, 길이(칸 수)] 또는 null
  const _ = null;
  const SONGS = {
    // 대기실: 밝은 장조, 박수
    lobby: {
      bpm: 116, bars: 4,
      lead: [
        [72, 2], _, [76, 2], _, [79, 2], _, [76, 2], _, [81, 3], _, _, [79, 1], [76, 2], _, [72, 2], _,
        [74, 2], _, [77, 2], _, [81, 2], _, [77, 2], _, [79, 4], _, _, _, _, _, _, _,
        [72, 2], _, [76, 2], _, [79, 2], _, [84, 2], _, [83, 2], _, [81, 2], _, [79, 2], _, [77, 2], _,
        [76, 2], _, [74, 2], _, [72, 2], _, [74, 2], _, [72, 6], _, _, _, _, _, _, _,
      ],
      bass: [48, 48, 53, 55],    // 마디마다 근음
      drums: { kick: [0, 8], clap: [4, 12], hat: [2, 6, 10, 14] },
    },
    // 문제 1단계: 차분한 박자
    q1: {
      bpm: 96, bars: 2,
      lead: [
        [67, 1], _, _, _, [70, 1], _, _, _, [72, 1], _, _, _, [70, 1], _, _, _,
        [67, 1], _, _, _, [70, 1], _, _, _, [74, 1], _, _, _, [72, 1], _, _, _,
      ],
      bass: [43, 41],
      drums: { kick: [0, 8], hat: [4, 12] },
    },
    // 2단계: 조금 빠르게
    q2: {
      bpm: 112, bars: 2,
      lead: [
        [67, 1], _, [70, 1], _, [72, 1], _, [70, 1], _, [67, 1], _, [70, 1], _, [74, 1], _, [72, 1], _,
        [67, 1], _, [70, 1], _, [72, 1], _, [75, 1], _, [74, 1], _, [72, 1], _, [70, 1], _, [72, 1], _,
      ],
      bass: [43, 41],
      drums: { kick: [0, 6, 8], hat: [2, 4, 6, 10, 12, 14] },
    },
    // 3단계: 서두르는 느낌
    q3: {
      bpm: 132, bars: 2,
      lead: [
        [67, 1], [70, 1], [72, 1], [70, 1], [67, 1], [70, 1], [72, 1], [74, 1], [75, 1], [74, 1], [72, 1], [70, 1], [72, 1], [70, 1], [67, 1], [70, 1],
        [67, 1], [70, 1], [72, 1], [70, 1], [67, 1], [70, 1], [74, 1], [75, 1], [77, 1], [75, 1], [74, 1], [72, 1], [74, 1], [72, 1], [70, 1], [72, 1],
      ],
      bass: [43, 44],
      drums: { kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], clap: [4, 12] },
    },
  };

  let seq = null;   // 지금 돌아가는 악보 재생기
  function startSynth(name) {
    if (!audio()) return;
    const song = SONGS[name];
    const steps = song.bars * 16;
    const dt = 60 / song.bpm / 4;
    const me = { name, idx: 0, next: ac.currentTime + 0.08, timer: null };
    const play = (i, t) => {
      const st = i % 16, bar = Math.floor(i / 16) % song.bars;
      const n = song.lead[i % song.lead.length];
      if (n) tone(musicBus, n[0], t, n[1] * dt * 0.95, 'triangle', 0.22);
      if (st % 4 === 0) tone(musicBus, song.bass[bar], t, dt * 3.2, 'sine', 0.35);
      if (song.drums.kick && song.drums.kick.includes(st)) kick(musicBus, t, 0.45);
      if (song.drums.clap && song.drums.clap.includes(st)) clap(musicBus, t);
      if (song.drums.hat && song.drums.hat.includes(st)) hat(musicBus, t);
    };
    me.timer = setInterval(() => {
      while (me.next < ac.currentTime + 0.25) {
        play(me.idx, me.next);
        me.idx = (me.idx + 1) % steps;
        me.next += dt;
      }
    }, 50);
    seq = me;
  }
  function stopSynth() { if (seq) { clearInterval(seq.timer); seq = null; } }
  function musicBusTo(v, ms) {
    if (!ac) return;
    const t = ac.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(v, t + ms / 1000);
  }

  const SFX = {
    join(t) { tone(sfxBus, 79, t, 0.12, 'sine', 0.35, 91); tone(sfxBus, 91, t + 0.06, 0.1, 'sine', 0.2); },
    reveal(t) { tone(sfxBus, 76, t, 0.5, 'triangle', 0.35); tone(sfxBus, 83, t + 0.12, 0.7, 'triangle', 0.35); hat(sfxBus, t, 0.05, 0.3); },
    step(t) { kick(sfxBus, t, 0.6); tone(sfxBus, 60, t, 0.35, 'square', 0.12); tone(sfxBus, 67, t, 0.35, 'square', 0.1); },
    timeup(t) {   // 남은 5초: 1초마다 삑, 마지막은 길게
      for (let i = 0; i < 5; i++) tone(sfxBus, i < 4 ? 81 : 88, t + i, i < 4 ? 0.12 : 0.5, 'square', 0.12);
    },
    fanfare(t) {
      const arp = [60, 64, 67, 72];
      arp.forEach((n, i) => tone(sfxBus, n, t + i * 0.12, 0.2, 'square', 0.14));
      [72, 76, 79].forEach((n) => tone(sfxBus, n, t + 0.5, 1.4, 'sawtooth', 0.08));
      [72, 76, 79, 84].forEach((n) => tone(sfxBus, n, t + 0.5, 1.4, 'triangle', 0.12));
      kick(sfxBus, t + 0.5, 0.6); clap(sfxBus, t + 0.5, 0.25); hat(sfxBus, t + 0.5, 0.1, 0.6);
    },
  };

  /* ---------- 바깥에서 쓰는 기능 ---------- */
  let current = null;   // 지금 틀어야 할 배경음 이름
  let playing = null;   // { name, kind: 'file'|'synth' }
  let musicLevel = VOL.music;

  function stopPlaying(fadeMs) {
    const p = playing;
    playing = null;
    if (!p) return;
    if (p.kind === 'file') { const a = el[p.name]; fadeTo(a, 0, fadeMs, () => { if (!playing || playing.name !== p.name) a.pause(); }); }
    else { musicBusTo(0, fadeMs); const s = seq; setTimeout(() => { if (seq === s) stopSynth(); }, fadeMs + 30); }
  }

  function music(name, fadeMs = 600) {
    if (current === name) return;
    current = name;
    stopPlaying(fadeMs);
    if (!name) return;
    check().then(() => {
      if (current !== name || muted) return;
      musicLevel = VOL.music;
      if (has[name]) {
        const a = fileEl(name);
        a.currentTime = 0; a.volume = 0;
        a.play().then(() => fadeTo(a, musicLevel, fadeMs)).catch(() => {});
        playing = { name, kind: 'file' };
      } else if (SONGS[name]) {
        stopSynth();
        if (!audio()) return;
        startSynth(name);
        musicBusTo(musicLevel, fadeMs);
        playing = { name, kind: 'synth' };
      }
    });
  }
  function stopMusic(fadeMs = 400) { music(null, fadeMs); }

  function duck(on) {
    musicLevel = on ? VOL.music * 0.3 : VOL.music;
    if (!playing || muted) return;
    if (playing.kind === 'file') fadeTo(el[playing.name], musicLevel, 250);
    else musicBusTo(musicLevel, 250);
  }

  function sfx(name) {
    if (muted) return;
    check().then(() => {
      if (muted) return;
      if (has[name]) {
        const b = fileEl(name).cloneNode();
        b.volume = VOL.sfx;
        b.play().catch(() => {});
      } else if (SFX[name] && audio()) {
        SFX[name](ac.currentTime + 0.02);
      }
    });
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.05);
    if (m) {
      Object.values(el).forEach((a) => a.pause());
      stopSynth();
      playing = null;
    } else if (current) {
      const name = current; current = null; music(name, 300);
    }
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

  // 교사가 '방 만들기'를 누를 때 불린다: 파일 확인과 소리 장치 준비
  function preload() {
    audio();
    check().then(() => Object.keys(FILES).forEach((k) => { if (has[k]) fileEl(k); }));
  }

  return {
    music, stopMusic, sfx, duck, preload,
    get muted() { return muted; },
    get state() { return { current, playing, has: { ...has }, ctx: ac && ac.state }; },
  };
})();

window.Sound = Sound;
