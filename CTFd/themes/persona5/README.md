# Persona 5

A Persona 5 participant theme for CTFd++. Select `persona5` in
Admin > Config > Theme. Admin pages keep the admin theme.

## What it does

- **Calling-card lettering**: page titles, the event name and challenge names
  are cut into ransom-note letters. The letters are seeded by the text, so a
  title looks the same on every visit. Long names switch to a calmer, more
  readable mix.
- **Menu jitter selector**: hovering or focusing the navbar, challenge
  categories, home buttons or scoreboard brackets moves a red, cyan and white
  cursor shape onto the item. The shape twitches in GSAP steps.
- **Slash page transitions**: red, black and white bands sweep over the page
  and the next page sweeps them away. Navigation starts on click, so the
  request is already in flight while the curtain drops. If the server is slow,
  a "now loading" car races in the corner over the curtain. Downloads, new
  tabs, modals, `/api`, `/files` and hash links are excluded, and the curtain
  lifts itself if a script fails to load.
- **Correct-flag splash**: an All-Out-Attack-style screen with a red field,
  slashes, a random NCW mascot, "TAKE YOUR TREASURE", the challenge name and
  points. It holds until the player clicks anywhere (or presses Enter, Space or
  Esc), then ends with a white flash. A wrong flag flickers the input and
  shakes the dialogue box. Flag attempts are observed by wrapping `fetch`, so
  core's challenge code is untouched.
- **Sound effects**: synthesized with WebAudio and voiced after the game's UI:
  cursor ticks, confirms, dialogue open and close, tabs, typing blips, slashes
  and a victory sting. They are **muted by default**. The speaker button in the
  navbar opens a volume dropdown with a mute toggle and a 10-step scale (drag,
  click a bar, or use the arrow keys). Both settings are remembered per browser.
  Recordings can replace any sound without code changes; see
  `static/sfx/README.md`.
- **A different NCW mascot per page**, chosen in `templates/base.html`
  (`p5_cast`). A template can override it with
  `{% set p5_thief = "think" %}` and `{% set p5_kicker = "..." %}`.

Motion levels:

| Context | Behaviour |
| --- | --- |
| Desktop | Full choreography and idle motion |
| Phone or touch screen | Shorter, simpler motion with no idle loops |
| `prefers-reduced-motion` | No transitions or jitter; the splash is a simple fade |
| GSAP blocked | Everything works; only the decoration is skipped |

## Pages

Bespoke layouts:

- title screen (home), with a P5 calendar and countdown. The index page's
  content from Admin > Pages is not shown on the homepage; use other pages
  for rules or info.
- challenge board (target list) and challenge dialogue
- scoreboard podium
- login, register, reset password and confirm ("infiltration")
- notifications (in-game chat)
- error pages

Core templates that are not overridden (profiles, teams, settings, team join
and create) get the same header ("stage") and component styling through CSS.
Every core feature keeps working, including solver uploads, AI sources,
ratings, hints, brackets and notifications.

Light and dark modes are both supported. Core theme fallback must stay enabled
(the default).

## Assets and licences

- `static/img`: National Cyber Week mascots, eagle emblem, logo, stars and car,
  taken from ncw.cscbinus.org (CSC BINUS) and converted to WebP. The emblem is
  also baked to greyscale for the background silhouettes. An uploaded CTF logo
  or small icon in Admin > Config takes precedence over the NCW logo and eagle
  favicon.
- `static/sfx`: the flag-success soundtracks are copyrighted game music (Persona
  5 and The Binding of Isaac) taken from third-party uploads. **They are not
  licensed for redistribution**, so the MP3s are gitignored and must be copied
  in per deployment. Without them the theme uses synthesized sounds. See
  `static/sfx/README.md`.
- `static/vendor`: GSAP 3.13.0 with CustomEase and CustomWiggle, under the GSAP
  Standard License (free, including commercial use). See `GSAP-LICENSE.md`.
- `static/fonts`: Anton, Archivo Black and Abril Fatface (SIL OFL 1.1), and
  Special Elite (Apache 2.0). Licence texts are next to the fonts.

The body text uses the core theme's bundled Lato.
