/*
 * Persona 5 theme motion: calling-card lettering, jittery menu selector,
 * slash page wipes, the "take your treasure" splash on a correct flag and
 * synthesized sound effects (muted until the player opts in).
 *
 * Every effect is optional: without GSAP, or with prefers-reduced-motion,
 * the page stays fully usable and only the decoration is skipped.
 */
(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const liteQuery = window.matchMedia("(max-width: 767.98px), (pointer: coarse)");
  const still = () => reduceQuery.matches;
  const lite = () => liteQuery.matches;
  const gsap = () => window.gsap;
  const assets = window.P5_ASSETS || "/themes/persona5/static/";
  const MASCOTS = ["laptop", "megaphone", "guide", "gamer", "crown", "money", "trophy", "think"];

  const store = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
    session(key, value) {
      try {
        if (value === undefined) return window.sessionStorage.getItem(key);
        if (value === null) window.sessionStorage.removeItem(key);
        else window.sessionStorage.setItem(key, value);
      } catch (e) { return null; }
      return null;
    },
  };

  /* ------------------------------------------------------------ sound --- */
  // WebAudio synth voiced after the game's UI (crisp cursor ticks, metallic
  // confirms, slashes and a victory sting), so the theme ships no audio.
  // Off by default. Any name listed in static/sfx/manifest.json is played from
  // that file instead, so real recordings can be dropped in without code changes.
  const Sound = {
    on: store.get("p5-sound") === "on",
    volume: (() => {
      const v = parseInt(store.get("p5-volume"), 10);
      return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 80;
    })(),
    ctx: null,
    master: null,
    files: null,
    buffers: {},
    last: {},

    ensure() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this.ctx = new Ctx();
        // Every voice runs through one gain node so the volume slider scales them all.
        this.master = this.ctx.createGain();
        this.master.gain.value = this.level();
        this.master.connect(this.ctx.destination);
        this.loadFiles();
      }
      // Browsers refuse to start audio before the first click/keypress; asking anyway only
      // logs warnings. unlock() resumes it on that first gesture instead.
      const ua = navigator.userActivation;
      if (this.ctx.state === "suspended" && (!ua || ua.hasBeenActive)) this.ctx.resume();
      return this.ctx;
    },

    unlock() {
      const wake = () => {
        if (this.audible()) this.ensure();
        if (this.ctx && this.ctx.state === "running") {
          ["pointerdown", "keydown", "touchend"].forEach(t => doc.removeEventListener(t, wake, true));
        }
      };
      ["pointerdown", "keydown", "touchend"].forEach(t => doc.addEventListener(t, wake, true));
    },

    // Decoding needs no user gesture with an offline context, so tracks can be ready
    // before the player ever clicks; the decoded buffers play in the live context later.
    decoder() {
      if (this.ctx) return this.ctx;
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!this._offline && Offline) this._offline = new Offline(2, 1, 44100);
      return this._offline;
    },

    loadFiles() {
      if (this.files || !this.decoder()) return;
      this.files = {};
      // no-cache: theme statics are cached for an hour, and a stale (empty) manifest
      // would silently hide newly added tracks.
      fetch(assets + "sfx/manifest.json", { credentials: "same-origin", cache: "no-cache" })
        .then(r => (r.ok ? r.json() : {}))
        .then(map => {
          // A name maps to one file or a list; a list plays a random entry each time.
          Object.keys(map || {}).forEach(name => {
            this.files[name] = true;
            [].concat(map[name]).forEach(file => {
              fetch(assets + "sfx/" + file)
                .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
                .then(data => this.decoder().decodeAudioData(data))
                .then(buffer => { (this.buffers[name] = this.buffers[name] || []).push(buffer); })
                .catch(() => {});
            });
          });
        })
        .catch(() => {});
    },

    sample(name, vol) {
      const list = this.buffers[name];
      if (!list || !list.length) return null;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.buffer = list[Math.floor(Math.random() * list.length)];
      src.connect(gain).connect(this.master);
      src.start();
      return { src, gain };
    },

    // Longer music (the flag-success soundtrack): one at a time, faded out on demand.
    playTrack(name) {
      if (!this.audible() || !this.ensure()) return false;
      this.stopTrack(0.05);
      this.track = this.sample(name, 0.75);
      if (this.track) this.track.src.onended = () => { this.track = null; };
      return !!this.track;
    },

    stopTrack(fade) {
      const t = this.track;
      if (!t) return;
      this.track = null;
      const now = this.ctx.currentTime;
      const f = fade === undefined ? 0.4 : fade;
      t.gain.gain.setTargetAtTime(0, now, f / 4);
      t.src.stop(now + f);
    },

    tone(freq, dur, opts) {
      const o = Object.assign({ type: "square", vol: 0.05, to: null, at: 0, attack: 0.002 }, opts);
      const ctx = this.ctx;
      const t = ctx.currentTime + o.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type;
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(o.vol, t + o.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, opts) {
      const o = Object.assign({ vol: 0.1, from: 800, to: 3000, q: 0.8, at: 0, type: "bandpass" }, opts);
      const ctx = this.ctx;
      const t = ctx.currentTime + o.at;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buffer;
      filter.type = o.type;
      filter.Q.value = o.q;
      filter.frequency.setValueAtTime(o.from, t);
      filter.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      gain.gain.setValueAtTime(o.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t);
    },

    // Rapid-fire sounds (cursor, typing) are throttled so they never smear.
    gap: { move: 0.035, hover: 0.05, type: 0.03, tab: 0.05 },

    // Perceptual curve: the slider's 50% sounds like half as loud, not barely quieter.
    level() {
      return this.on ? Math.pow(this.volume / 100, 1.7) : 0;
    },

    audible() {
      return this.on && this.volume > 0;
    },

    play(name) {
      if (!this.audible() || !this.ensure()) return;
      const now = this.ctx.currentTime;
      if (this.gap[name] && now - (this.last[name] || 0) < this.gap[name]) return;
      this.last[name] = now;
      if (this.sample(name, 0.8)) return;
      const n = (d, o) => this.noise(d, o);
      const t = (f, d, o) => this.tone(f, d, o);
      switch (name) {
        case "move": // cursor tick: a click of noise plus a falling glint
          n(0.025, { vol: 0.09, from: 5200, to: 3800, q: 1.4 });
          t(2300, 0.045, { type: "sine", vol: 0.035, to: 1700 });
          break;
        case "hover": // lighter tick for cards
          n(0.018, { vol: 0.05, from: 6000, to: 4500, q: 2 });
          t(1500, 0.03, { type: "triangle", vol: 0.025 });
          break;
        case "select": // confirm: two bright steps with a metallic shimmer
          t(880, 0.07, { vol: 0.04 });
          t(1320, 0.12, { vol: 0.04, at: 0.05 });
          n(0.16, { vol: 0.05, from: 7000, to: 10000, q: 3, at: 0.04 });
          break;
        case "back":
          t(620, 0.1, { vol: 0.04, to: 300 });
          n(0.05, { vol: 0.04, from: 1800, to: 900 });
          break;
        case "open": // menu / dialogue opens: swoosh up + clack
          n(0.2, { vol: 0.1, from: 400, to: 5000, q: 0.7 });
          t(330, 0.16, { type: "triangle", vol: 0.07, to: 660, at: 0.02 });
          n(0.03, { vol: 0.12, from: 3000, to: 2500, q: 2, at: 0.17 });
          break;
        case "close":
          n(0.16, { vol: 0.08, from: 4000, to: 500, q: 0.7 });
          t(500, 0.12, { type: "triangle", vol: 0.05, to: 250 });
          break;
        case "tab":
          t(1900, 0.03, { type: "triangle", vol: 0.04 });
          n(0.02, { vol: 0.05, from: 4500, to: 4000, q: 2 });
          break;
        case "type": // dialogue-box text blip
          t(2600 + Math.random() * 500, 0.022, { type: "square", vol: 0.012 });
          n(0.012, { vol: 0.03, from: 7000, to: 6000, q: 1, type: "highpass" });
          break;
        case "toggle":
          t(520, 0.06, { vol: 0.04 });
          t(780, 0.09, { vol: 0.04, at: 0.06 });
          break;
        case "wipe": // slash across the screen
          n(0.3, { vol: 0.13, from: 600, to: 6500, q: 0.6 });
          t(180, 0.12, { type: "sawtooth", vol: 0.03, to: 90 });
          break;
        case "splash":
          n(0.55, { vol: 0.2, from: 4500, to: 250, q: 0.6 });
          t(130, 0.45, { type: "sawtooth", vol: 0.08, to: 55 });
          break;
        case "hit":
          t(90, 0.35, { type: "triangle", vol: 0.35, to: 40 });
          n(0.18, { vol: 0.15, from: 2500, to: 600, q: 0.4 });
          t(1320, 0.18, { vol: 0.03, at: 0.05 });
          t(1760, 0.3, { vol: 0.03, at: 0.12 });
          break;
        case "stinger": { // victory arpeggio that lands on a held chord
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => t(f, 0.16, { vol: 0.035, at: i * 0.07 }));
          [523.25, 783.99, 1046.5, 1318.5].forEach(f => t(f, 0.9, { type: "triangle", vol: 0.03, at: 0.3, attack: 0.02 }));
          n(0.5, { vol: 0.04, from: 8000, to: 12000, q: 4, at: 0.3 });
          break;
        }
        case "dismiss":
          n(0.22, { vol: 0.14, from: 7000, to: 700, q: 0.6 });
          t(1568, 0.25, { type: "triangle", vol: 0.04 });
          break;
        case "miss":
          t(240, 0.12, { type: "sawtooth", vol: 0.06, to: 150 });
          t(180, 0.18, { type: "sawtooth", vol: 0.06, to: 90, at: 0.12 });
          break;
      }
    },

    setVolume(v) {
      this.volume = Math.min(100, Math.max(0, Math.round(v)));
      store.set("p5-volume", String(this.volume));
      if (this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.015);
      this.paint();
    },

    setOn(on) {
      this.on = on;
      store.set("p5-sound", on ? "on" : "off");
      if (on) this.ensure();
      if (this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.015);
      this.paint();
    },

    paint() {
      const box = doc.querySelector(".p5-volume");
      if (!box) return;
      const v = this.volume;
      const icon = !this.audible() ? "fa-volume-xmark" : v < 45 ? "fa-volume-low" : "fa-volume-high";
      box.querySelectorAll(".p5-sound .fas, .p5-volume__mute .fas").forEach(i => {
        i.classList.remove("fa-volume-xmark", "fa-volume-low", "fa-volume-high");
        i.classList.add(icon);
      });
      box.classList.toggle("is-muted", !this.on);
      box.querySelector(".p5-sound").classList.toggle("is-live", this.audible());
      box.querySelector(".p5-volume__mute").setAttribute("aria-pressed", String(!this.on));
      box.querySelector(".p5-volume__value").textContent = v + "%";
      const range = box.querySelector(".p5-volume__range");
      range.value = v;
      range.setAttribute("aria-valuetext", this.on ? v + "%" : v + "% (muted)");
      const lit = Math.round(v / 10);
      box.querySelectorAll(".p5-volume__bars i").forEach((bar, i) => {
        bar.classList.toggle("is-on", i < lit);
        bar.classList.toggle("is-peak", i === lit - 1);
      });
    },

    bindVolume() {
      const box = doc.querySelector(".p5-volume");
      if (!box) return;
      const range = box.querySelector(".p5-volume__range");
      const mute = box.querySelector(".p5-volume__mute");
      this.paint();
      range.addEventListener("input", () => {
        // Touching the slider is a clear "I want sound": unmute on the way.
        if (!this.on && Number(range.value) > 0) this.setOn(true);
        this.setVolume(Number(range.value));
        this.play("move");
        const g = gsap();
        const peak = box.querySelector(".p5-volume__bars .is-peak");
        if (g && peak && !still()) g.fromTo(peak, { scaleY: 1.5 }, { scaleY: 1.08, duration: 0.25, ease: "back.out(3)", transformOrigin: "50% 100%", clearProps: "transform" });
      });
      range.addEventListener("change", () => this.play("select"));
      mute.addEventListener("click", () => {
        this.setOn(!this.on);
        if (this.on && this.volume === 0) this.setVolume(50);
        this.play("toggle");
      });
      box.addEventListener("shown.bs.dropdown", () => {
        const g = gsap();
        if (!g || still()) return;
        g.timeline()
          .from(box.querySelector(".p5-volume__menu"), { scale: 0.85, rotation: -4, autoAlpha: 0, duration: 0.22, ease: "back.out(2.5)", clearProps: "transform,opacity,visibility" })
          .from(box.querySelectorAll(".p5-volume__bars i"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.25, stagger: 0.025, ease: "back.out(2)", clearProps: "transform" }, 0.05);
      });
    },

    // UI events that don't belong to a specific effect.
    bindUi() {
      doc.addEventListener("pointerover", e => {
        const card = e.target.closest(".p5-card");
        if (card && !card.contains(e.relatedTarget) && e.pointerType !== "touch") this.play("hover");
      });
      doc.addEventListener("click", e => {
        if (e.target.closest(".p5-tabs .nav-link")) this.play("tab");
        else if (e.target.closest(".theme-switch")) this.play("toggle");
        else if (e.target.closest("details > summary")) this.play("select");
      });
      doc.addEventListener("input", e => {
        if (e.target.matches(".challenge-input, .p5-auth__card .form-control")) this.play("type");
      });
      doc.addEventListener("submit", () => this.play("select"));
      doc.addEventListener("hide.bs.modal", () => this.play("close"));
    },
  };

  /* ---------------------------------------------------- calling cards --- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    // mulberry32: deterministic per string so a title looks the same on every visit.
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const VARIANTS = ["a", "b", "c", "d", "e", "f", "g"];

  function ransom(el) {
    if (el.dataset.p5Done) return;
    const text = (el.getAttribute("data-p5-ransom") || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    el.dataset.p5Done = "1";
    el.dataset.p5Text = text;
    el.setAttribute("aria-label", text);
    const calm = text.length > 26;
    const rand = rng(hash(text));
    const frag = doc.createDocumentFragment();
    let last = "";

    text.split(" ").forEach(word => {
      const w = doc.createElement("span");
      w.className = "p5-rw";
      w.setAttribute("aria-hidden", "true");
      Array.from(word).forEach((ch, i) => {
        const s = doc.createElement("span");
        let v = VARIANTS[Math.floor(rand() * VARIANTS.length)];
        if (v === last) v = VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length];
        // Long strings: mostly plain letters with a few cut-outs, for legibility.
        if (calm && rand() < 0.55) v = "e";
        last = v;
        s.className = "p5-r p5-r--" + v;
        s.textContent = ch;
        s.style.setProperty("--r", ((rand() - 0.5) * 16).toFixed(1) + "deg");
        s.style.setProperty("--y", ((rand() - 0.5) * 0.14).toFixed(2) + "em");
        s.style.setProperty("--s", (i === 0 ? 1.12 : 0.88 + rand() * 0.26).toFixed(2));
        w.appendChild(s);
      });
      frag.appendChild(w);
    });

    el.textContent = "";
    el.appendChild(frag);
    el.classList.add("p5-ransom");
    if (calm) el.classList.add("p5-ransom--calm");
  }

  function lettersIn(el, opts) {
    const g = gsap();
    if (!g || still()) return null;
    const letters = el.querySelectorAll(".p5-r");
    if (!letters.length) return null;
    const o = Object.assign({ delay: 0, each: 0.03 }, opts);
    return g.from(letters, {
      autoAlpha: 0,
      scale: lite() ? 1.4 : 2.6,
      rotation: () => g.utils.random(-50, 50),
      y: () => g.utils.random(-30, 30),
      duration: 0.42,
      ease: "back.out(2.2)",
      stagger: { each: lite() ? o.each * 0.6 : o.each, from: "random" },
      delay: o.delay,
      clearProps: "transform,opacity,visibility",
    });
  }

  function ransomAll(scope) {
    (scope || doc).querySelectorAll("[data-p5-ransom], body.p5 .jumbotron h1").forEach(ransom);
  }

  /* --------------------------------------------------- menu selector --- */
  function menu(list) {
    if (list.dataset.p5Menu === "ready") return;
    list.dataset.p5Menu = "ready";
    const g = gsap();
    const tag = /^(UL|OL)$/.test(list.tagName) ? "li" : "span";
    const sel = doc.createElement(tag);
    sel.className = "p5-sel";
    sel.setAttribute("aria-hidden", "true");
    sel.innerHTML = '<i class="p5-sel__cyan"></i><i class="p5-sel__red"></i><i class="p5-sel__white"></i>';
    list.insertBefore(sel, list.firstChild);
    let current = null;
    let jitter = null;
    let shown = false;

    function startJitter() {
      if (!g || still() || jitter) return;
      // Stepped random corner offsets: the shape "twitches" like the game's cursor.
      jitter = g.to(sel, {
        "--ja": () => g.utils.random(-9, 9) + "%",
        "--jb": () => g.utils.random(-9, 9) + "%",
        "--jc": () => g.utils.random(-6, 6) + "%",
        "--jd": () => g.utils.random(-9, 9) + "%",
        duration: 0.1,
        ease: "steps(1)",
        repeat: -1,
        repeatRefresh: true,
      });
    }

    function select(item) {
      if (item === current) return;
      if (current) current.classList.remove("is-p5-selected");
      current = item;
      item.classList.add("is-p5-selected");
      const lr = list.getBoundingClientRect();
      const ir = item.getBoundingClientRect();
      const box = {
        x: ir.left - lr.left + list.scrollLeft,
        y: ir.top - lr.top + list.scrollTop,
        width: ir.width,
        height: ir.height,
      };
      Sound.play("move");
      if (!g || still()) {
        Object.assign(sel.style, {
          visibility: "visible",
          transform: `translate(${box.x}px, ${box.y}px)`,
          width: box.width + "px",
          height: box.height + "px",
        });
        return;
      }
      const tilt = g.utils.random(-5, 5);
      if (!shown) {
        shown = true;
        g.set(sel, Object.assign({ autoAlpha: 1, rotation: tilt, scaleX: 0.2 }, box));
        g.to(sel, { scaleX: 1, duration: 0.22, ease: "back.out(2.5)" });
      } else {
        g.to(sel, Object.assign({ rotation: tilt, duration: 0.2, ease: "power3.out", overwrite: "auto" }, box));
      }
      g.fromTo(item, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: "back.out(3)", clearProps: "scale" });
      startJitter();
    }

    function clear() {
      if (current) current.classList.remove("is-p5-selected");
      current = null;
      shown = false;
      if (jitter) { jitter.kill(); jitter = null; }
      if (g && !still()) g.to(sel, { autoAlpha: 0, scaleX: 0.3, duration: 0.15, ease: "power2.in" });
      else sel.style.visibility = "hidden";
    }

    const pick = e => {
      const item = e.target.closest("[data-p5-item]");
      if (item && list.contains(item) && item.offsetParent !== null) select(item);
    };
    list.addEventListener("pointerover", e => { if (e.pointerType !== "touch") pick(e); });
    list.addEventListener("focusin", pick);
    list.addEventListener("pointerleave", () => { if (!list.contains(doc.activeElement)) clear(); });
    list.addEventListener("focusout", e => { if (!list.contains(e.relatedTarget)) clear(); });
    list.addEventListener("click", e => { if (e.target.closest("[data-p5-item]")) Sound.play("select"); });
    list.addEventListener("scroll", clear, { passive: true });
  }

  function menus(scope) {
    (scope || doc).querySelectorAll("[data-p5-menu]").forEach(menu);
  }

  /* ------------------------------------------------------- page wipe --- */
  // Red/black/white bands sweep over the page. Navigation starts on click, so
  // the request is already in flight while the curtain drops; the next page
  // lifts it as soon as it boots. A slow response shows the "now loading" car
  // on top of the curtain, so it never sits there frozen.
  const wipe = {
    el: null,
    bands: null,

    init() {
      this.el = doc.querySelector(".p5-wipe");
      if (!this.el) return;
      this.bands = this.el.querySelectorAll(".p5-wipe__band");
      const g = gsap();
      const arriving = root.classList.contains("p5-arriving");
      store.session("p5-wipe", null);
      doc.addEventListener("click", e => this.onClick(e));
      window.addEventListener("pageshow", e => {
        // Back/forward cache: never come back to a lowered curtain.
        root.classList.remove("p5-is-leaving");
        if (e.persisted && g) g.set(this.el, { autoAlpha: 0 });
      });
      if (!g || still()) {
        root.classList.remove("p5-arriving");
        return;
      }
      // GSAP takes over the transforms from the CSS first-paint state.
      g.set(this.bands, { x: 0, skewX: -18, xPercent: arriving ? 0 : -140 });
      if (arriving) {
        g.set(this.el, { autoAlpha: 1 });
        root.classList.remove("p5-arriving");
        g.timeline({ defaults: { ease: "power3.inOut" } })
          .to(this.bands, { xPercent: 140, duration: lite() ? 0.3 : 0.42, stagger: { each: 0.05, from: "end" } })
          .set(this.el, { autoAlpha: 0 });
      }
    },

    eligible(a, e) {
      if (!a || e.defaultPrevented || e.button !== 0) return false;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      if (a.target && a.target !== "_self") return false;
      if (a.hasAttribute("download") || a.hasAttribute("data-bs-toggle") || a.getAttribute("role") === "button") return false;
      if (a.closest(".modal, .dropdown-menu, [x-data] [x-html], .p5-dialog")) return false;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
      if (/\/(files|themes|api)\//.test(url.pathname)) return false;
      return true;
    },

    onClick(e) {
      const a = e.target.closest("a[href]");
      if (!this.eligible(a, e)) return;
      Sound.play("wipe");
      // Slow responses get a little "now loading" car in the corner.
      root.classList.add("p5-is-leaving");
      const g = gsap();
      if (!g || still()) return;
      store.session("p5-wipe", "1");
      g.set(this.el, { autoAlpha: 1 });
      g.set(this.bands, { xPercent: -140 });
      g.to(this.bands, { xPercent: 0, duration: lite() ? 0.24 : 0.32, stagger: 0.045, ease: "power3.in" });
      // Still here after a while (e.g. the link turned out to be a download): lift it.
      window.setTimeout(() => {
        root.classList.remove("p5-is-leaving");
        store.session("p5-wipe", null);
        g.timeline().to(this.bands, { xPercent: 140, duration: 0.35, ease: "power3.inOut" }).set(this.el, { autoAlpha: 0 });
      }, 8000);
    },
  };

  /* ----------------------------------------------------- flag splash --- */
  // Plays in, then holds on "TAKE YOUR TREASURE" until the player clicks
  // anywhere (or presses Enter, Space or Esc).
  const splash = {
    el: null,
    tl: null,

    init() {
      this.el = doc.querySelector(".p5-splash");
      if (!this.el) return;
      this.el.addEventListener("click", () => this.finish());
      // Capture phase, so Esc dismisses the splash without also closing the challenge modal.
      doc.addEventListener("keydown", e => {
        if (this.el.hidden || !["Escape", "Enter", " "].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        this.finish();
      }, true);
    },

    hold() {
      this.el.classList.add("is-holding");
      if (!this.music) Sound.play("stinger");
    },

    finish() {
      if (this.el.hidden) return;
      this.el.classList.remove("is-holding");
      Sound.stopTrack();
      Sound.play("dismiss");
      if (this.tl) this.tl.play("outro");
      else this.hide();
    },

    hide() {
      Sound.stopTrack();
      this.music = false;
      this.el.hidden = true;
      this.el.classList.remove("is-holding");
      this.tl = null;
      // Hand focus back (e.g. to the submit button) so the challenge window keeps working with the keyboard.
      const back = this.returnFocus;
      this.returnFocus = null;
      if (back && doc.contains(back)) back.focus({ preventScroll: true });
    },

    show(name, value) {
      if (!this.el) return;
      const g = gsap();
      const el = this.el;
      const mascot = MASCOTS[Math.floor(Math.random() * MASCOTS.length)];
      const title = el.querySelector(".p5-splash__title");
      el.querySelector(".p5-splash__thief").src = assets + "img/mascots/" + mascot + ".webp";
      el.querySelector(".p5-splash__persona").src = assets + "img/emblem/eagle-gray.webp";
      el.querySelector(".p5-splash__name").textContent = name || "";
      el.querySelector(".p5-splash__value").textContent = value ? "+" + value : "";
      ransom(title);
      if (el.hidden) this.returnFocus = doc.activeElement;
      el.hidden = false;
      el.classList.remove("is-holding");
      // One of the "victory" tracks from sfx/manifest.json if any loaded; synth otherwise.
      this.music = Sound.playTrack("victory");
      if (!this.music) Sound.play("splash");

      if (!g) { this.hold(); return; }
      if (this.tl) this.tl.kill();
      const q = s => el.querySelectorAll(s);

      if (still()) {
        this.tl = g.timeline({ onComplete: () => this.hide() })
          .fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 })
          .call(() => this.hold())
          .addPause()
          .addLabel("outro", "+=0.01")
          .to(el, { autoAlpha: 0, duration: 0.25 });
        return;
      }

      const small = lite();
      const tl = g.timeline({ defaults: { ease: "power4.out" }, onComplete: () => this.hide() });
      tl.set(el, { autoAlpha: 1 })
        .set(q(".p5-splash__flash"), { autoAlpha: 0 })
        .fromTo(q(".p5-splash__field"), { clipPath: "polygon(0 0, 0 0, 0 100%, 0 100%)" },
          { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)", duration: 0.22, ease: "power3.in" })
        .fromTo(q(".p5-splash__rays"), { scale: 0.4, rotation: -30, autoAlpha: 0 },
          { scale: 1, rotation: 0, autoAlpha: 0.35, duration: 0.6 }, "<0.1")
        .fromTo(q(".p5-splash__slash"), { xPercent: i => (i % 2 ? 110 : -110) },
          { xPercent: 0, duration: 0.28, stagger: 0.06, ease: "power3.out" }, "<")
        .addLabel("hero", "-=0.05");
      if (!small) {
        tl.fromTo(q(".p5-splash__persona"), { scale: 1.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 0.45, duration: 0.6 }, "hero");
      }
      tl.fromTo(q(".p5-splash__thief"), { xPercent: 70, skewX: -16, autoAlpha: 0 },
          { xPercent: 0, skewX: 0, autoAlpha: 1, duration: 0.45 }, "hero")
        .fromTo(q(".p5-splash__kicker"), { x: -80, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.3 }, "hero+=0.1")
        .add(() => { if (!this.music) Sound.play("hit"); }, "hero+=0.15")
        .add(lettersIn(title, { each: 0.02 }) || g.timeline(), "hero+=0.12")
        .fromTo(q(".p5-splash__meta > *"), { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, stagger: 0.08 }, ">-0.1")
        // Freeze on the finished frame until the player dismisses it.
        .call(() => this.hold())
        .addPause()
        .addLabel("outro", "+=0.01")
        .to(q(".p5-splash__flash"), { autoAlpha: 1, duration: 0.07, ease: "none" })
        .set(q(".p5-splash__field, .p5-splash__rays, .p5-splash__slash, .p5-splash__persona, .p5-splash__thief, .p5-splash__copy"), { autoAlpha: 0 })
        .to(q(".p5-splash__flash"), { autoAlpha: 0, duration: 0.35, ease: "power2.out" })
        .set(q(".p5-splash__copy, .p5-splash__field, .p5-splash__slash"), { clearProps: "opacity,visibility" });
      this.tl = tl;
    },
  };

  function miss() {
    Sound.play("miss");
    const input = doc.querySelector("#challenge-window .challenge-input");
    const dialog = doc.querySelector("#challenge-window .p5-dialog");
    if (input) {
      input.classList.remove("p5-miss");
      void input.offsetWidth;
      input.classList.add("p5-miss");
    }
    const g = gsap();
    if (g && dialog && !still() && window.CustomWiggle) {
      g.fromTo(dialog, { x: 0 }, { x: 12, duration: 0.42, ease: "p5shake", clearProps: "x" });
    }
  }

  // Watch flag attempts without touching core's challenge code.
  function hookAttempts() {
    const original = window.fetch;
    if (!original || original.p5Hooked) return;
    const hooked = function (input, init) {
      const result = original.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        if (method === "POST" && /\/api\/v1\/challenges\/attempt(\?|$)/.test(url)) {
          result.then(res => res.clone().json()).then(body => {
            const status = body && body.data && body.data.status;
            if (status === "correct") {
              const nameEl = doc.querySelector("#challenge-window .challenge-name");
              const valueEl = doc.querySelector("#challenge-window .challenge-value");
              const name = nameEl ? nameEl.dataset.p5Text || nameEl.textContent.trim() : "";
              const value = valueEl ? valueEl.textContent.trim() : "";
              splash.show(name, value);
            } else if (status === "incorrect") {
              miss();
            }
          }).catch(() => {});
        }
      } catch (e) { /* never break submissions */ }
      return result;
    };
    hooked.p5Hooked = true;
    window.fetch = hooked;
  }

  /* ------------------------------------------------------- set pieces --- */
  function stageIn() {
    const g = gsap();
    const stage = doc.querySelector(".p5-stage, body.p5 .jumbotron, .p5-auth__poster, .p5-lost");
    if (!stage) return;
    const title = stage.querySelector("[data-p5-ransom], h1");
    if (!g || still()) return;
    const tl = g.timeline({ defaults: { ease: "power4.out" } });
    const thief = stage.querySelector(".p5-stage__thief, .p5-auth__thief, .p5-lost__thief");
    const persona = stage.querySelector(".p5-stage__persona, .p5-auth__persona, .p5-lost__persona");
    const kicker = stage.querySelector(".p5-stage__kicker");
    if (stage.matches(".p5-stage, .jumbotron")) {
      // Same five points as the CSS shape so GSAP can interpolate them.
      tl.fromTo(stage,
        { clipPath: "polygon(0% 0%, 0% 0%, 0% 80%, 0% 92%, 0% 100%)" },
        { clipPath: "polygon(0% 0%, 100% 0%, 100% 80%, 58% 92%, 0% 100%)", duration: lite() ? 0.3 : 0.45, ease: "power3.inOut", clearProps: "clipPath" });
    } else {
      tl.from(stage, { xPercent: -4, autoAlpha: 0, duration: 0.35, clearProps: "transform,opacity,visibility" });
    }
    if (persona && !lite()) tl.from(persona, { scale: 1.25, autoAlpha: 0, duration: 0.8, clearProps: "transform,opacity,visibility" }, 0.15);
    if (thief) tl.from(thief, { xPercent: 45, skewX: -12, autoAlpha: 0, duration: 0.55, clearProps: "transform,opacity,visibility" }, 0.2);
    if (kicker) tl.from(kicker, { x: -60, autoAlpha: 0, duration: 0.35, clearProps: "transform,opacity,visibility" }, 0.25);
    if (title) tl.add(lettersIn(title) || g.timeline(), 0.3);
  }

  function titleScreen() {
    const screen = doc.querySelector(".p5-title");
    if (!screen) return;
    const g = gsap();
    if (!g || still()) return;
    const q = s => screen.querySelectorAll(s);
    const small = lite();
    const tl = g.timeline({ defaults: { ease: "power4.out" } });
    tl.from(q(".p5-title__shard"), { xPercent: 60, duration: 0.6 })
      .from(q(".p5-title__burst"), { rotation: -40, scale: 0.6, autoAlpha: 0, duration: 1.1 }, 0)
      .from(q(".p5-title__persona"), { scale: 1.3, autoAlpha: 0, duration: 0.9 }, 0.15)
      .from(q(".p5-title__thief"), { xPercent: 50, skewX: -14, autoAlpha: 0, duration: 0.7 }, 0.25)
      .from(q(".p5-date"), { y: -40, rotation: -20, autoAlpha: 0, duration: 0.5, ease: "back.out(2)" }, 0.2)
      .from(q(".p5-title__kicker"), { x: -120, autoAlpha: 0, duration: 0.4 }, 0.35)
      .add(lettersIn(screen.querySelector(".p5-title__name"), { each: 0.04 }) || g.timeline(), 0.45)
      .from(q(".p5-title__tagline"), { x: -60, autoAlpha: 0, duration: 0.4 }, 0.8)
      .from(q(".p5-countdown__unit"), { y: 50, rotation: () => g.utils.random(-25, 25), autoAlpha: 0, duration: 0.4, stagger: 0.07, ease: "back.out(2)" }, 0.9)
      // CTAs carry a CSS transform transition for hover, so animate explicitly and hand back to CSS.
      .fromTo(q(".p5-title__actions > .p5-cta"), { x: -80, autoAlpha: 0, transition: "none" },
        { x: 0, autoAlpha: 1, duration: 0.35, stagger: 0.08, clearProps: "transform,transition,opacity,visibility" }, 1.05)
      .from(q(".p5-title__card"), { scale: 0, rotation: -180, duration: 0.6, ease: "back.out(1.8)" }, 1.1)
      .from(q(".p5-title__stars"), { scale: 0, autoAlpha: 0, duration: 0.5, ease: "back.out(3)" }, 1.2);

    if (small) return;
    // Idle life: the burst turns, the card wobbles, stars twinkle.
    // The rays snap round on a beat instead of spinning nonstop: same energy,
    // and the huge layer only repaints for a fraction of each second.
    g.to(q(".p5-title__burst"), { rotation: "+=10", duration: 0.35, ease: "power3.out", repeat: -1, repeatDelay: 1.65, delay: 1.5 });
    g.to(q(".p5-title__card"), { rotation: -4, duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.7 });
    g.to(q(".p5-title__stars"), { scale: 1.12, autoAlpha: 0.65, duration: 0.9, ease: "steps(3)", yoyo: true, repeat: -1, delay: 1.7 });
    // Parallax on the cast, per the game's "everything is alive" menus.
    const xp = g.quickTo(q(".p5-title__persona"), "x", { duration: 0.8, ease: "power3" });
    const xt = g.quickTo(q(".p5-title__thief"), "x", { duration: 0.6, ease: "power3" });
    screen.addEventListener("pointermove", e => {
      const n = e.clientX / window.innerWidth - 0.5;
      xp(n * -30);
      xt(n * 18);
    });
  }

  function calendar() {
    const el = doc.querySelector("[data-p5-date]");
    if (!el) return;
    const now = new Date();
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const h = now.getHours();
    const phase = h < 5 ? "Late Night" : h < 11 ? "Morning" : h < 15 ? "Daytime" : h < 18 ? "After School" : h < 22 ? "Evening" : "Late Night";
    el.querySelector(".p5-date__md").textContent = now.getMonth() + 1 + "/" + now.getDate();
    el.querySelector(".p5-date__dow").textContent = days[now.getDay()];
    el.querySelector(".p5-date__phase").textContent = phase;
  }

  function countdown() {
    const box = doc.querySelector("[data-p5-countdown]");
    if (!box) return;
    const start = Number(window.init && window.init.start) || 0;
    const end = Number(window.init && window.init.end) || 0;
    const label = box.querySelector(".p5-countdown__label");
    const cells = {};
    box.querySelectorAll("[data-unit]").forEach(b => { cells[b.dataset.unit] = b; });
    const pad = n => String(n).padStart(2, "0");
    const g = gsap();
    let timer = null;

    function tick() {
      const now = Date.now() / 1000;
      let target = null;
      let text = box.dataset.labelOpen;
      if (start && now < start) { target = start; text = box.dataset.labelBefore; }
      else if (end && now < end) { target = end; text = box.dataset.labelDuring; }
      else if (end && now >= end) { text = box.dataset.labelAfter; }
      label.textContent = text;
      box.classList.toggle("is-over", target === null);
      if (target === null) { if (timer) window.clearInterval(timer); return; }
      let left = Math.max(0, Math.floor(target - now));
      const parts = { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
      Object.keys(parts).forEach(k => {
        const v = pad(parts[k]);
        if (cells[k] && cells[k].textContent !== v) {
          cells[k].textContent = v;
          if (g && !still() && k !== "s") g.fromTo(cells[k], { y: -8, rotation: -6 }, { y: 0, rotation: 0, duration: 0.3, ease: "back.out(3)" });
        }
      });
    }
    tick();
    timer = window.setInterval(tick, 1000);
  }

  // Cards drop in whenever Alpine renders (or re-filters) the board.
  function board() {
    const targets = doc.querySelector(".p5-board__targets");
    if (!targets) return;
    const g = gsap();
    let queued = false;
    const deal = () => {
      queued = false;
      const fresh = Array.from(targets.querySelectorAll(".p5-card:not([data-p5-in])")).filter(c => c.offsetParent !== null);
      fresh.forEach(c => { c.dataset.p5In = "1"; });
      if (!fresh.length || !g || still()) return;
      g.from(fresh, {
        y: lite() ? 20 : 50,
        rotation: () => g.utils.random(-12, 12),
        autoAlpha: 0,
        transition: "none",
        duration: 0.4,
        ease: "back.out(1.8)",
        stagger: { each: lite() ? 0.02 : 0.035, grid: "auto" },
        clearProps: "transform,transition,opacity,visibility",
      });
      targets.querySelectorAll(".p5-category__head h3:not([data-p5-in])").forEach(h => {
        if (h.offsetParent === null) return;
        h.dataset.p5In = "1";
        g.from(h, { x: -60, skewX: -30, autoAlpha: 0, duration: 0.35, ease: "power4.out", clearProps: "transform,opacity,visibility" });
      });
    };
    const queue = () => { if (!queued) { queued = true; window.requestAnimationFrame(deal); } };
    new MutationObserver(queue).observe(targets, { childList: true, subtree: true });
    doc.addEventListener("click", e => {
      if (!e.target.closest(".p5-catmenu__item")) return;
      targets.querySelectorAll(".p5-card[data-p5-in], .p5-category__head h3[data-p5-in]").forEach(c => { delete c.dataset.p5In; });
      window.setTimeout(queue, 0);
    });
  }

  // Challenge dialogue: slashes in each time Bootstrap shows the modal.
  function dialogs() {
    doc.addEventListener("show.bs.modal", () => Sound.play("open"));
    doc.addEventListener("shown.bs.modal", e => {
      const dialog = e.target.querySelector(".p5-dialog");
      if (!dialog) return;
      ransomAll(dialog);
      menus(dialog);
      const g = gsap();
      if (!g || still()) return;
      const name = dialog.querySelector(".p5-dialog__name");
      g.timeline({ defaults: { ease: "power4.out" } })
        .from(dialog, { xPercent: -8, skewX: 8, autoAlpha: 0, duration: 0.3, clearProps: "transform,opacity,visibility" })
        .from(dialog.querySelectorAll(".p5-dialog__category, .p5-dialog__value"), { scale: 1.8, autoAlpha: 0, duration: 0.3, stagger: 0.08, ease: "back.out(2)", clearProps: "transform,opacity,visibility" }, 0.1)
        .add(name ? lettersIn(name, { each: 0.018 }) || g.timeline() : g.timeline(), 0.12)
        .from(dialog.querySelector(".p5-dialog__desc"), { y: 24, autoAlpha: 0, duration: 0.3, clearProps: "transform,opacity,visibility" }, 0.2);
    });
  }

  // Ransom-ify anything Alpine or Bootstrap injects later (challenge views, etc).
  function watchDom() {
    new MutationObserver(records => {
      for (const r of records) {
        r.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches("[data-p5-ransom]")) ransom(n);
          if (n.querySelectorAll) {
            ransomAll(n);
            menus(n);
          }
        });
      }
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function mobileMenu() {
    const collapse = doc.getElementById("base-navbars");
    if (!collapse) return;
    collapse.addEventListener("hide.bs.collapse", () => Sound.play("close"));
    collapse.addEventListener("show.bs.collapse", () => {
      Sound.play("open");
      const g = gsap();
      if (!g || still()) return;
      g.from(collapse.querySelectorAll(".p5-menu__item, .p5-tools__item"), {
        x: -60, autoAlpha: 0, duration: 0.3, stagger: 0.04, ease: "power4.out", delay: 0.05,
        clearProps: "opacity,visibility,x",
      });
    });
  }

  /* -------------------------------------------------------------- boot --- */
  hookAttempts();

  function boot() {
    const g = gsap();
    if (g) {
      if (window.CustomEase && window.CustomWiggle) {
        g.registerPlugin(window.CustomEase, window.CustomWiggle);
        window.CustomWiggle.create("p5shake", { wiggles: 7, type: "easeOut" });
      }
    }
    ransomAll();
    menus();
    calendar();
    countdown();
    Sound.bindVolume();
    Sound.unlock();
    if (Sound.audible()) Sound.loadFiles();
    Sound.bindUi();
    wipe.init();
    splash.init();
    titleScreen();
    if (!doc.querySelector(".p5-title")) stageIn();
    board();
    dialogs();
    mobileMenu();
    watchDom();
    window.P5 = { splash: (n, v) => splash.show(n, v), sound: Sound, ransom };
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
