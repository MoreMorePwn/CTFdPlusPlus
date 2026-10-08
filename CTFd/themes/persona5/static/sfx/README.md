# Sound effects

Every sound is synthesized in `js/persona5.js`, so this folder can stay empty.
To use a recording instead, put the file here and map the effect name to it in
`manifest.json`. A list plays a random entry each time:

```json
{
  "victory": ["victory-1.mp3", "victory-2.mp3", "victory-3.mp3"],
  "move": "cursor.mp3"
}
```

`victory` is the soundtrack for the correct-flag splash. It replaces the
synthesized splash, hit and stinger, follows the volume slider and fades out
when the splash is dismissed.

Current files:

| File | Source |
| --- | --- |
| `victory-1.mp3` | "Persona 5 Battle" instant from myinstants.com (8s, trimmed by the event team) |
| `victory-2.mp3` | "You'll Never See It Coming" (Persona 5), from youtu.be/1zkqZoVJDxo |
| `victory-3.mp3` | The Binding of Isaac's Specialist dance, from youtu.be/oSnWlkqcWJ0 |

All three are copyrighted game music, re-uploaded by third parties. They were
loudness-normalized and given a short fade-out. **The MP3s are gitignored** and
are not in the repository: copy them into this folder on the server that runs
the event. Without them the splash uses the synthesized sounds.

| Name | When it plays |
| --- | --- |
| `move` | The selector moves to a menu item |
| `hover` | The pointer enters a challenge card |
| `select` | A menu item, hint or form is confirmed |
| `back` | Reserved for cancel actions |
| `open` / `close` | A dialogue or the mobile menu opens or closes |
| `tab` | A tab in the challenge dialogue is clicked |
| `type` | Typing in the flag field or a login/register field |
| `toggle` | Sound or light/dark mode is toggled |
| `wipe` | Navigating to another page |
| `splash` / `hit` | The correct-flag splash slashes in and the title lands |
| `victory` | Soundtrack when a flag is correct (random pick) |
| `stinger` | The splash settles and waits for a click |
| `dismiss` | The splash is dismissed |
| `miss` | A wrong flag is submitted |

Names that are not listed keep their synthesized sound. Only use recordings you
have the right to redistribute.
