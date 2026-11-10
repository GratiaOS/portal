# Skins

A skin is one stylesheet that answers the parts of the page. The page says what each thing **is** (`data-part`) and in what
**state** it is; it says nothing about how it looks or where it sits. So another stylesheet can lay the same page out in
another way, as CSS Zen Garden did, or give it another ambience, as a Winamp skin did.

Three skins are here, and they are not three colour schemes of one layout:

- `bubbles.css` (🫧), the one Room starts in: a warm field, rounded glass, bubbles that rise.
- `bank.css` (🏦): a ledger. A message is a row of three columns (time, who, what), made by giving `message` a grid and letting
  `message-body` disappear into it (`display: contents`); the channels are a ruled column; every corner is square.
- `radar.css` (🪖): a situation more than a conversation. The people are points on a round scope (their place worked out in CSS
  from `--angle` and `--ring`); someone who is not here is not on it, one who comes in appears with a ring, a point pulses while its
  person works on an answer and sends a ring out when they speak, and everything that moves keeps one tempo (56 beats a minute). The
  words are a plain log beside it. It is the skin that uses the extra states and numbers listed below.

Every part below has a rule in each of them (a test checks it). Read one as the example for writing the next.

**About the names.** People now say *rooms* for what the parts below call channels, and *portal* for the whole page (decided
2026-11-02: portal › room › pad). The names of the parts are contract 1 and stay as they are: `room` is the whole page, and the
`channel-*` parts belong to the room that is open. A skin made for contract 1 keeps working.

## Rules of the contract

- **One skin is on at a time**, named on the root: `<html data-skin="bank">`. A skin puts **every** rule inside
  `:root[data-skin='<id>']` (with CSS nesting) and starts the names of its keyframes with `<id>-`, so that skins sit side by
  side and only the chosen one answers. Only `lib/skin.ts` writes `data-skin`; a skin is chosen with the switch in the side, and
  the choice is remembered by the browser (`localStorage`, `portal.skin`).
- The page puts **no class, and no colour or size, on an element**. A part is found by `[data-part='…']`; a state by an
  attribute on the part (`[data-here]`, `[data-from='companion']`).
- The colours are named for what they are for (`--ink`, `--glass`, `--accent`, …) and are defined in `:root` by the skin.
- Motion belongs to the skin and stays behind `@media (prefers-reduced-motion: no-preference)`. For anyone who asks for
  less, there is none.
- A part can be hidden (`display: none`), moved or restyled. The order of the elements in the page is the order a screen
  reader reads, so move things with CSS (`grid`, `order`), not by expecting another order in the markup.
- Only the parts below exist. A new part is a change to the page and to this list together (a test keeps them in step).

## Skins from a folder (a room's own)

A room can offer looks of its own, next to the three built in. [`skins/template`](../../../skins/template) in the repository is one to copy: five colours to change, and a look in two minutes (`pnpm dev` offers the folder). Put a folder of skins next to the config and name it in `skinsDir`; the
room serves it and offers each good skin as one more button in the side.

```
skins/
  atlas/
    skin.json      { "id": "atlas", "name": "Atlas", "emoji": "🗺️", "extends": "bank", "contract": 1 }
    skin.css
    logo.svg       whatever the stylesheet uses: images (svg, png, jpg, webp) and fonts (woff2, woff)
```

The smallest skin keeps the layout of a built-in look and changes only its colours (`skin.css`, with `"extends": "bank"` in `skin.json`):

```css
:root[data-skin='atlas'] {
  --field: oklch(0.94 0.02 85);
  --paper: oklch(0.985 0.012 85);
  --ink: oklch(0.24 0.03 60);
  --ink-soft: oklch(0.24 0.03 60 / 0.82);
  --ink-faint: oklch(0.24 0.03 60 / 0.7);
  --accent: oklch(0.42 0.12 30);
}
```

- **`id`** is the name of the folder: lower case letters, digits and `-`, 2 to 32 characters, starting with a letter. It may not be
  `bubbles`, `bank` or `radar`.
- **`extends`** (optional) is one of the three built in. The skin then keeps that look's layout and says only what is different: its
  colours, a font, a part or two. Without it, the skin answers every part itself, as the built-in ones do.
- **The stylesheet** puts every rule inside `:root[data-skin='<id>']` (with CSS nesting), names its keyframes `<id>-…`, and may have
  `@font-face` rules outside, each naming its `font-family` `<id>-…` too (a face is registered for the whole page, and one that took the
  name of a font another look uses would change that look as well). No `@import`, and nothing it loads may come from another place: the page's policy refuses it, and the
  room refuses the skin. Up to 256 KB, and each file up to 4 MB.
- **Checked when it is asked for**, so a skin can be added or changed while the room runs. A skin that is not good is left out, and the
  room says why when it starts.
- **Served to anyone** who can reach the room, without a token: the sign-in page wears a skin too. A skin holds a look, nothing of what is
  said in the room. Every file is sent with a policy that stops an image opened on its own from running anything.
- **A skin the room no longer has** is let go of: the browser goes back to 🫧.
- **A built-in look answers a skin that extends it**, as well as itself: its rules are inside
  `:root:is([data-skin='bank'], [data-skin-base='bank'])`, and the page sets `data-skin-base` to what `extends` names.

## The page

| part | what it is | state |
| --- | --- | --- |
| `app` | the whole page | |
| `ambient` | decoration behind everything (`aria-hidden`), holding the `mote`s | |
| `mote` | one small thing in the ambience; the page gives it `left`, `width`, `height` and `--dur`, `--delay`, `--drift`, `--o` | |
| `stage` | everything in front of the ambience | |

## The threshold (before signing in)

The threshold is the portal's own, not a skin's: the gate of lights, the same whatever look someone chose (`ui/src/gate.css`,
its parts named with `data-gate`, so that no skin's rule reaches it). A skin made for contract 1 that dressed the `gate-*`
parts keeps working everywhere else; those rules simply find nothing now.

## The room

| part | what it is | state |
| --- | --- | --- |
| `room` | the side and the channel next to it | `data-sheet` while the sheet of a narrow page is open |
| `side` | channels, people, you; on a narrow page it is the sheet that comes up from the foot (`position: fixed`, `visibility: hidden` while closed, so that it cannot be tabbed into) | |
| `channels` | the group of channels, with its `label` | |
| `label` | a small heading in the side (channels, people; on a narrow page also you, the look and the app, which carry `data-sheet-only` and are not shown on a wide one) | `data-sheet-only` |
| `channel-list` | the list of channels | |
| `channel` | one channel, a button | `aria-current="true"` for the one open |
| `hash` | the `#` before a channel's name | |
| `people` | the section of people | |
| `people-list` | the list of people | |
| `person` | one person; the page gives it `--angle` (0 to 359) and `--ring` (1, 2 or 3), a place on a scope worked out from the id: it means nothing, not nearness, not when | `data-here` when they are here; `data-thinking` while they work on an answer in this channel; `data-spoke` for about two seconds after a message of theirs arrives live; `data-arrived` for about two seconds after they come in while we are looking (not for those already here when the page opened, and nothing for those who leave) |
| `presence` | the dot that says so, with nothing about when | `data-here`, `data-popping` for a moment after arriving |
| `person-name` | their name | |
| `sign` | the one emoji after a name (`ida🦁`), in `person-name`, `speaker` and `self-name`, written against it | |
| `sr-only` | text only for screen readers | |
| `side-foot` | people and you, together | |
| `self` | you: name, the choice of look, and the buttons | |
| `self-name` | your name; your sign's slot comes right after it | |
| `skin-switch` | the choice of look (a `group`) | |
| `skin-option` | one look, a button with its emoji | `aria-pressed="true"` for the one on |
| `sign-slot-wrap` | your name with its slot, the ▲▼ and the grid | |
| `sign-slot` | your sign in your name, a button: ↑↓ step, a click opens the grid | `data-preview` while stepping, before it is kept; `data-popping` for a moment after it is kept |
| `sign-steps` | the ▲ and ▼ beside it | |
| `sign-step` | one of them, a button | |
| `sign-grid` | every sign (a `group`), four to a row, a frame moved with the arrows | |
| `sign-tile` | one sign in it, a button | `aria-pressed="true"` for yours; `data-own` for one you added |
| `sign-add` | + to add your own, or × to let yours go, a button | |
| `sign-input` | the box for the emoji you add | |
| `sign-said` | what the page says when a sign is kept or not (also to screen readers) | |
| `notify` | the button that turns notifications on | |
| `signout` | the button that signs out | |
| `main` | the open channel's side of the page | |

## A channel

| part | what it is | state |
| --- | --- | --- |
| `channel-view` | the open channel | |
| `channel-head` | its heading row | |
| `channel-title` | the title | |
| `signal` | the connection, told quietly | `data-connection="live \| connecting \| reconnecting \| refused"` |
| `signal-dot` | its dot | |
| `log` | what scrolls | `data-welcome` when it holds the welcome of a visitor's room: then it should keep its content at its foot (a column that puts the free space above the welcome) |
| `older` | holds the button for older messages | |
| `older-button` | the button | `disabled` while loading |
| `empty` | the line for a channel where nothing has been said | |
| `topbar` | on a narrow page (under 48 rem), the bar above the room: where you are, who is here, how the line is, the settings; hidden on a wide one | |
| `topbar-room` | the button that opens the sheet, with the name of the room | `aria-expanded` |
| `topbar-title` | the name of the room in it | |
| `topbar-caret` | its little arrow | |
| `topbar-people` | how many are here | |
| `topbar-time` | a visitor's minutes left, only in the last ten | |
| `topbar-settings` | the second button that opens the sheet | |
| `sheet-backdrop` | the cover behind the open sheet; a press on it closes it | |
| `visit-as` | in a visitor's side: who they are writing as | |
| `visit-time` | in a visitor's side: how long the visit has left | |
| `sheet-head` | the head of the sheet of a narrow page: the handle and the close button; hidden on a wide page | |
| `sheet-handle` | the little bar that says the sheet can be pulled down | |
| `sheet-close` | the button that closes the sheet | |
| `self-group` | a section under your name in the side: `data-group` is `you`, `look`, `app` or `end` (the way out); on a wide page it adds nothing, on a narrow one it is a section with its own title | `data-group` |
| `skin-emoji` | the sign of a look, inside its button | |
| `skin-name` | the name of a look, inside its button; shown on a narrow page, where the buttons are big | |
| `install` | the button that offers to install the portal as an app, shown only where the browser gives the means | |
| `install-hint` | a line about the app: how to add it by hand on iOS, or what staying signed in means once it is installed | |
| `welcome` | what a visitor finds at the top of the room: a whisper and two lines; made by the page, no message, and it does not fade | |
| `welcome-whisper` | its first line, the whisper of the place | |
| `welcome-map` | the two lines under it: nothing follows you, nothing is asked of you | |
| `messages` | the list of messages, a `log` for screen readers | |
| `message` | one message | `data-head` when it is the first of a run by the same person; `data-from="mine \| companion \| other"`; `data-to-you` when it names the reader and the reader did not write it; `data-fading` when the room lets what is said fade (a visitor's room): the page then sets the element's own `opacity`, so a skin should not set one |
| `time` | the time it was said | |
| `message-body` | everything but the time | |
| `speaker` | the name, once per run; the page gives it `--hue` (0 to 360), a colour that stays with the person | |
| `speaker-mark` | the dot after a companion's name | |
| `bubble` | the shape that holds the words | |
| `content` | the words and the code, in order | |
| `text` | a piece of prose | |
| `sources` | what a companion leaned on | |
| `thinking` | who is working on an answer | |
| `thinking-dots` | its dots, `aria-hidden` | |
| `dot` | one of them; the page gives it `--i` (0, 1, 2) to stagger them | |

## Inside the words

The words of a message are cut into what they are: `mention` (a person the room says was named, `@Nova`; it has `--hue` as the speaker has,
`data-from='companion'` when it is a companion, and `data-you` when it is the reader), `tag` (`#decizie`: a `#` and a word that starts with a letter,
so `#78` and the name of a channel are not tags), `link` (an address that starts with `http://` or `https://`: the text is the address itself, so what is shown is where it goes, and it opens in another tab
with `noopener noreferrer nofollow ugc`; a skin should let it break anywhere, `overflow-wrap: anywhere`), and `inline-code` (a span between backticks, taken as written, and nothing inside it is
read as a mention or a tag). A `text` whose message is one to three emoji and nothing else has `data-jumbo`: a skin may show it large.

The page also registers one highlight, `room-occurrence`: when a word is selected in the log, every place it is in the log is in it. A
skin dresses it with `::highlight(room-occurrence)` and nothing else; the selection itself is the browser's.

## The column of whispers

`field` (the third column on a wide page (a skin shows it from 64 rem, where the channel still has room for its words): a few quiet lines that turn by themselves; a skin hides it on a narrower one, since the
page leaves that to it; it came after contract 1, so the page hides it until a skin shows it, and a skin made for contract 1
that builds on no built-in look never finds it; it has `data-idle` after a minute with nothing done, when the lines are the ones for rest) and `field-line` (the line it
shows now; it has `data-first` while it is the first of its set, which a skin may let breathe). The lines are not announced as they turn.

## Code

`code` (the figure), `code-head`, `code-lang`, `code-copy` (the button), `code-body` (the `pre`).

## Where something is written

`composer`, `composer-row`, `composer-input`, `composer-send` (`disabled` while there is nothing to send),
`composer-note` (the calm line under the box, read when the box is focused: a refusal when there is one, and otherwise how to break a line and how far the text is from the limit; a refusal is also said once, as it comes, through an `sr-only` status; the box itself is as tall as its text, up to two fifths of the window, and scrolls inside past that).
