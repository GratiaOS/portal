// What the page says, in the two languages of the people who use it. The portal's own sentences (Nova's, the errors)
// come from the portal; these are the page's.

import type { BuiltInSkin } from './skin.ts';

export type Strings = {
  signInTitle: string;
  signInHint: string;
  tokenLabel: string;
  /** The gate of lights: the line above the field, what the field holds, how it is sent, and the side door. */
  gateKey: string;
  gatePlaceholder: string;
  gateEnter: string;
  runYourOwn: string;
  /** The door for visitors: the button, what is said while it opens, and why it may not. */
  stepThrough: string;
  stepping: string;
  guestFull: string;
  guestSlow: string;
  guestClosed: string;
  guestAway: string;
  /** In the guest room: who else is here, with no list; and the way out. */
  guestAlone: string;
  guestOthers: (count: number) => string;
  guestLeave: string;
  /** Said when a visit has ended, on the gate it returns to. */
  visitEnded: string;
  enter: string;
  checking: string;
  tokenUnknown: string;
  roomAway: string;
  tooManyKeys: string;
  channels: string;
  people: string;
  here: string;
  notHere: string;
  signOut: string;
  notifyOn: string;
  /** Lines that say how to call a companion, by example. */
  whispers: (companion: string) => string[];
  /** The column at the right: its name for a screen reader, and the lines it turns, while someone is here and while no one has touched anything for a minute. */
  fieldLabel: string;
  fieldActive: string[];
  fieldIdle: string[];
  /** The name of the choice of looks, and of each look. */
  skin: string;
  skinNames: Record<BuiltInSkin, string>;
  copy: string;
  copied: string;
  /** "3 mesaje noi": several turns in one notice. */
  newMessages: (count: number) => string;
  say: string;
  send: string;
  /** Said by a screen reader before a message that names the reader. */
  toYou: string;
  /** Under the box, where Enter sends. */
  lineBreak: string;
  older: string;
  loading: string;
  empty: string;
  sources: string;
  slowDown: (seconds: number) => string;
  /** Who is working on an answer: "Nova gândește…". */
  thinking: (names: string[]) => string;
  couldNotSend: string;
  live: string;
  reconnecting: string;
  refused: string;
  /** The sign after your name: a slot to step through, and a grid behind it. Its words are M3's joy: a high five, a plot twist. */
  signSlot: (sign: string | undefined) => string;
  signHelp: string;
  signPrevious: string;
  signNext: string;
  signGrid: string;
  signAdd: (max: number) => string;
  signLetGo: string;
  signKept: (sign: string) => string;
  signLetGoDone: string;
  signNotOne: string;
  signPlotTwist: (why: string) => string;
};

const ro: Strings = {
  signInTitle: 'Intră în portal',
  signInHint: 'Lipește tokenul pe care l-ai primit.',
  tokenLabel: 'Token',
  gateKey: 'Ai o cheie? 🗝️',
  gatePlaceholder: 'tokenul tău',
  gateEnter: 'Enter o trimite.',
  runYourOwn: 'Rulează-l pe al tău',
  stepThrough: 'Intră',
  stepping: 'Intru…',
  guestFull: 'Camera e plină acum. Mai încearcă puțin mai târziu.',
  guestSlow: 'Prea mulți vizitatori de aici, chiar acum. Așteaptă puțin.',
  guestClosed: 'Acest portal nu primește vizitatori.',
  guestAway: 'Nu ajung la portal acum. Încearcă din nou în câteva clipe.',
  guestAlone: 'Ești singur aici, deocamdată.',
  guestOthers: (count) => (count === 1 ? 'Mai e cineva aici.' : `Mai sunt ${count} aici.`),
  guestLeave: 'Pleacă',
  visitEnded: 'Vizita ta s-a încheiat.',
  enter: 'Intră',
  checking: 'Verific…',
  tokenUnknown: 'Tokenul nu e recunoscut. Verifică-l și încearcă din nou.',
  roomAway: 'Nu ajung la portal acum. Încearcă din nou în câteva clipe.',
  tooManyKeys: 'Prea multe chei greșite la rând. Așteaptă puțin și încearcă din nou.',
  channels: 'Camere',
  people: 'Oameni',
  here: 'e aici',
  notHere: 'nu e aici',
  signOut: 'Ieși',
  notifyOn: 'Pornește notificările',
  whispers: (c) => [`Cheam-o pe @${c} ca pe o colegă.`, `@${c}, mă ajuți cu ceva?`, `@${c}, tu ce părere ai?`],
  fieldLabel: 'Șoapte',
  fieldActive: ['Respiră mai întâi.', 'Nu ești în urmă.', 'Totul se desfășoară.', 'Un adevăr pe rând.', 'Lasă memoria să te găsească.', 'Nu lipsește nimic.'],
  fieldIdle: ['E în regulă să stai liniștit.', 'Tăcerea e o limbă.', 'Câmpul ascultă.', 'Odihna face parte din a-ți aminti.', 'Fără grabă, fără griji.', 'Liniștea înfige rădăcini mai adânci.'],
  skin: 'Aspect',
  skinNames: { bubbles: 'Bule', bank: 'Bancă', radar: 'Radar' },
  copy: 'Copiază',
  copied: 'Copiat',
  newMessages: (n) => `${n} mesaje noi`,
  say: 'Scrie un mesaj…',
  send: 'Trimite',
  toYou: 'Pentru tine',
  lineBreak: 'Shift+Enter: rând nou',
  older: 'Mesaje mai vechi',
  loading: 'Se încarcă…',
  empty: 'Încă nu s-a spus nimic aici.',
  sources: 'Surse',
  slowDown: (s) => `Prea repede. Mai așteaptă ${s} s.`,
  thinking: (names) => `${names.join(', ')} ${names.length > 1 ? 'gândesc' : 'gândește'}…`,
  couldNotSend: 'Mesajul nu a plecat. Încearcă din nou.',
  live: 'Conectat',
  reconnecting: 'Se reconectează',
  refused: 'Sesiune încheiată',
  signSlot: (sign) => (sign ? `Semnul tău, ${sign}: schimbă-l` : 'Alege-ți un semn'),
  signHelp: '↑↓ schimbă, Enter păstrează, Esc lasă cum era; un clic deschide toate semnele',
  signPrevious: 'Semnul de dinainte',
  signNext: 'Semnul următor',
  signGrid: 'Toate semnele',
  signAdd: (max) => `Adaugă al tău: orice emoji (rămân ultimele ${max})`,
  signLetGo: 'Renunță la semn',
  signKept: (sign) => `Bate palma! Acum ești ${sign}`,
  signLetGoDone: 'Gata, fără semn de-al tău',
  signNotOne: 'Plot twist: un singur emoji, te rog.',
  signPlotTwist: (why) => `Plot twist: semnul n-a plecat${why ? ` (${why})` : ''}. Încearcă iar.`,
};

const en: Strings = {
  signInTitle: 'Come into the portal',
  signInHint: 'Paste the token you were given.',
  tokenLabel: 'Token',
  gateKey: 'Have a key? 🗝️',
  gatePlaceholder: 'your token',
  gateEnter: 'Enter sends it.',
  runYourOwn: 'Run your own',
  stepThrough: 'Step through',
  stepping: 'Stepping through…',
  guestFull: 'The room is full right now. Try again in a little while.',
  guestSlow: 'Too many visitors from here just now. Wait a little.',
  guestClosed: 'This portal does not take visitors.',
  guestAway: 'The portal is out of reach right now. Try again in a moment.',
  guestAlone: 'You are the only one here, for now.',
  guestOthers: (count) => (count === 1 ? 'Someone else is here.' : `${count} others are here.`),
  guestLeave: 'Leave',
  visitEnded: 'Your visit has ended.',
  enter: 'Enter',
  checking: 'Checking…',
  tokenUnknown: 'That token is not recognised. Check it and try again.',
  roomAway: 'The portal is out of reach right now. Try again in a moment.',
  tooManyKeys: 'Too many wrong keys in a row. Wait a little and try again.',
  channels: 'Rooms',
  people: 'People',
  here: 'is here',
  notHere: 'is not here',
  signOut: 'Sign out',
  notifyOn: 'Turn on notifications',
  whispers: (c) => [`Call @${c} like you would a colleague.`, `@${c}, could you help me with something?`, `@${c}, what do you think?`],
  fieldLabel: 'Whispers',
  fieldActive: ['Breathe first.', 'You are not behind.', 'Everything is unfolding.', 'One truth at a time.', 'Let memory find you.', 'Nothing is missing.'],
  fieldIdle: ['It’s okay to sit quietly.', 'Silence is its own language.', 'The field is listening.', 'Rest is part of remembering.', 'No hurry, no worry.', 'Stillness plants deeper roots.'],
  skin: 'Look',
  skinNames: { bubbles: 'Bubbles', bank: 'Bank', radar: 'Radar' },
  copy: 'Copy',
  copied: 'Copied',
  newMessages: (n) => `${n} new messages`,
  say: 'Write a message…',
  send: 'Send',
  toYou: 'For you',
  lineBreak: 'Shift+Enter: new line',
  older: 'Older messages',
  loading: 'Loading…',
  empty: 'Nothing has been said here yet.',
  sources: 'Sources',
  slowDown: (s) => `Too fast. Wait ${s} s.`,
  thinking: (names) => `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} thinking…`,
  couldNotSend: 'The message did not go. Try again.',
  live: 'Connected',
  reconnecting: 'Reconnecting',
  refused: 'Session ended',
  signSlot: (sign) => (sign ? `Your sign, ${sign}: change it` : 'Pick a sign'),
  signHelp: '↑↓ change, Enter keeps, Esc leaves it; a click opens every sign',
  signPrevious: 'The sign before',
  signNext: 'The next sign',
  signGrid: 'Every sign',
  signAdd: (max) => `Add your own: any emoji (the last ${max} stay)`,
  signLetGo: 'Let your sign go',
  signKept: (sign) => `High five! You are ${sign} now`,
  signLetGoDone: 'Done, no sign of your own',
  signNotOne: 'Plot twist: one emoji, please.',
  signPlotTwist: (why) => `Plot twist: the sign did not go${why ? ` (${why})` : ''}. Try again.`,
};

/** Romanian unless the person's language says English. */
export function stringsFor(locale: string | undefined): Strings {
  return locale?.toLowerCase().startsWith('en') ? en : ro;
}
