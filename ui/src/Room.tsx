import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SignalQuality from './components/SignalQuality.tsx';
import { fadeOf, inTrail, opacityOf } from './lib/trail.ts';
import ChannelList from './components/ChannelList.tsx';
import ChannelView from './components/ChannelView.tsx';
import NotifyButton from './components/NotifyButton.tsx';
import PeopleList from './components/PeopleList.tsx';
import FieldWhispers from './components/FieldWhispers.tsx';
import GuestWelcome from './components/GuestWelcome.tsx';
import Snails from './components/Snails.tsx';
import SignSlot from './components/SignSlot.tsx';
import SkinSwitch from './components/SkinSwitch.tsx';
import { ApiError } from './lib/client.ts';
import { rowsOf } from './lib/format.ts';
import { peopleOf, thinkingIn } from './lib/people.ts';
import { useArrived } from './lib/arrivals.ts';
import { useSpoke } from './lib/spoke.ts';
import { leavingEndsAVisit } from './lib/guest.ts';
import { useLang } from './lib/lang.ts';
import { readGuest, readGuestUntil } from './lib/session.ts';
import { snailAt } from './lib/snails.ts';
import { SAY_FROM, minutesLeft } from './lib/visit.ts';
import { useInstall } from './lib/install.ts';
import { stringsFor } from './lib/strings.ts';
import type { Hints, SkinInfo } from './lib/types.ts';
import { useNotify } from './lib/useNotify.ts';
import { useRoom } from './lib/useRoom.ts';
import { useUnread } from './lib/useUnread.ts';
import { whispersFor } from './lib/whispers.ts';

const PAGE = 50;
const TITLE = 'El portal';

const channelFromHash = () => decodeURIComponent(location.hash.replace(/^#/, '')) || undefined;

export function Room({ token, onSignOut }: { token: string; onSignOut: (refused?: boolean) => void }) {
  const { state, dispatch, api } = useRoom(token, () => onSignOut(true)); // the portal stopped opening to this key
  const locale = state.you?.locale ?? navigator.language;
  const t = stringsFor(locale);
  useLang(locale);
  // a visitor has one room and no one to look up: no list of rooms, no team, no sign, no notifications; only who else is here
  const guest = state.you?.kind === 'guest';

  // what the box where people write may say, asked once; without it the box keeps its one line
  const [hints, setHints] = useState<Hints | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    api.hints().then((found) => !cancelled && setHints(found)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);
  const whispers = useMemo(() => whispersFor(t, hints), [t, hints]);

  // the looks the room has in its skins folder, asked once; `undefined` until it answers (and if it cannot, the choice stays as it was)
  const [skins, setSkins] = useState<SkinInfo[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    api.skins().then((found) => !cancelled && setSkins(found)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const [wanted, setWanted] = useState(channelFromHash);
  useEffect(() => {
    const onHash = () => setWanted(channelFromHash());
    window.addEventListener('hashchange', onHash);
    // a click on a notice, with the page already open: the worker says which channel (public/sw.js)
    const onWorker = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; hash?: unknown } | null;
      if (data?.type === 'portal:channel' && typeof data.hash === 'string' && data.hash.startsWith('#')) location.hash = data.hash;
    };
    navigator.serviceWorker?.addEventListener('message', onWorker);
    return () => {
      window.removeEventListener('hashchange', onHash);
      navigator.serviceWorker?.removeEventListener('message', onWorker);
    };
  }, []);

  const selected = state.conversations.find((c) => c.id === wanted) ?? state.conversations[0];
  const channelId = selected?.id;
  const { here: looking, start } = useUnread(state, channelId, TITLE);
  useNotify(state, looking, start, t, !guest, TITLE); // a visitor's messages are never shown as notifications of the computer

  // the first page of a channel's history, once, when it is first looked at
  const [loadingFor, setLoadingFor] = useState<string | undefined>(undefined);
  const loaded = channelId !== undefined && state.more[channelId] !== undefined;
  useEffect(() => {
    if (!channelId || loaded) return;
    let cancelled = false;
    setLoadingFor(channelId);
    api
      .history(channelId, { limit: PAGE })
      .then((turns) => !cancelled && dispatch({ type: 'history', conversationId: channelId, turns, limit: PAGE }))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoadingFor(undefined));
    return () => {
      cancelled = true;
    };
  }, [channelId, loaded, api, dispatch]);

  // the trail: a visitor's room lets what is said fade, and it goes from the tab's memory when the portal lets it go; the page does the counting
  const trailMs = guest && state.trailMinutes ? state.trailMinutes * 60_000 : undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!trailMs) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      dispatch({ type: 'forget', before: at - trailMs });
    };
    tick();
    const every = setInterval(tick, 15_000);
    return () => clearInterval(every);
  }, [trailMs, dispatch]);

  const kept = channelId ? (state.turns[channelId] ?? []) : [];
  const turns = useMemo(() => (trailMs ? kept.filter((turn) => inTrail(turn.createdAt, trailMs, now)) : kept), [kept, trailMs, now]);
  const rows = useMemo(() => {
    const made = rowsOf(turns, state.participants);
    return trailMs ? made.map((row, i) => ({ ...row, opacity: opacityOf(fadeOf(row.turn.createdAt, trailMs, now, made.length - 1 - i)) })) : made;
  }, [turns, state.participants, trailMs, now]);

  const people = useMemo(() => peopleOf(state.participants, state.presence), [state.participants, state.presence]);
  // the other visitors who are here now, counted and never listed (the portal tells a guest of no one else)
  const othersHere = useMemo(
    () => people.filter((p) => p.participant.kind === 'guest' && p.participant.id !== state.you?.id && p.here).length,
    [people, state.you?.id],
  );
  const spoke = useSpoke(state);
  const arrived = useArrived(people);
  const thinkingIds = useMemo(() => new Set(state.thinking.filter((a) => a.conversationId === channelId).map((a) => a.participantId)), [channelId, state.thinking]);
  const thinking = useMemo(() => thinkingIn(channelId, state.thinking, state.participants), [channelId, state.thinking, state.participants]);

  const olderThan = turns[0]?.seq;
  const older = useCallback(() => {
    if (!channelId || olderThan === undefined) return;
    setLoadingFor(channelId);
    api
      .history(channelId, { before: olderThan, limit: PAGE })
      .then((page) => dispatch({ type: 'history', conversationId: channelId, turns: page, limit: PAGE }))
      .catch(() => undefined)
      .finally(() => setLoadingFor(undefined));
  }, [api, channelId, dispatch, olderThan]);

  // on a narrow page the rooms, the people and the settings are a sheet behind the top bar, closed by the backdrop, by Escape and by choosing a room
  const [sheet, setSheet] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const side = useRef<HTMLElement>(null);
  const opened = useRef(false);
  useEffect(() => setSheet(false), [channelId]);
  useEffect(() => {
    if (sheet) {
      opened.current = true;
      side.current?.focus({ preventScroll: true });
    } else if (opened.current) {
      opened.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // a visitor's visit, counted on their own clock: said aloud only in its last minutes, always in the sheet
  const until = guest ? readGuestUntil() : undefined;
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === undefined) return;
    const every = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(every);
  }, [until]);
  const left = minutesLeft(until, clockNow);
  // the snail that is walking in this visit: a visitor's, and only when the portal has told how long a visit and a trail are
  const snail =
    guest && until !== undefined && state.visitMinutes && state.trailMinutes
      ? snailAt(until, clockNow, state.visitMinutes * 60_000, state.trailMinutes * 60_000)
      : undefined;
  const install = useInstall();

  const [note, setNote] = useState('');
  const send = useCallback(
    async (text: string) => {
      if (!channelId) return;
      setNote('');
      try {
        const turn = await api.say(channelId, text);
        dispatch({ type: 'message', turn, live: false }); // the stream brings it too; one turn is kept once
      } catch (err) {
        setNote(err instanceof ApiError && err.status === 429 ? t.slowDown(err.retryAfter ?? 5) : err instanceof ApiError && err.status < 500 ? err.message : t.couldNotSend);
        throw err;
      }
    },
    [api, channelId, dispatch, t],
  );

  const chooseSign = useCallback(
    async (sign: string | null) => {
      const participant = await api.setSign(sign);
      dispatch({ type: 'participant', participant }); // the stream brings it too, to everyone
    },
    [api, dispatch],
  );

  return (
    <div data-part="room" data-sheet={sheet ? '' : undefined}>
      <header data-part="topbar">
        <button type="button" data-part="topbar-room" ref={trigger} aria-expanded={sheet} aria-controls="side" aria-label={t.menu} onClick={() => setSheet((open) => !open)}>
          <span data-part="topbar-title">{selected?.title}</span>
          <span aria-hidden data-part="topbar-caret">
            ▾
          </span>
        </button>
        <span data-part="topbar-people">{t.hereCount(guest ? othersHere + 1 : people.filter((p) => p.here).length)}</span>
        {guest && left !== undefined && left <= SAY_FROM && <span data-part="topbar-time">⏱ {left} min</span>}
        <SignalQuality connection={state.connection} t={t} />
        <button type="button" data-part="topbar-settings" aria-label={t.settings} onClick={() => setSheet(true)}>
          ⚙
        </button>
      </header>
      <button type="button" data-part="sheet-backdrop" aria-label={t.closeSheet} tabIndex={-1} onClick={() => setSheet(false)} />
      <aside data-part="side" id="side" ref={side} tabIndex={-1}>
        <div data-part="sheet-head">
          <span aria-hidden data-part="sheet-handle" />
          <button type="button" data-part="sheet-close" aria-label={t.closeSheet} onClick={() => setSheet(false)}>
            ✕
          </button>
        </div>
        {!guest && (
          <div data-part="channels">
            <p data-part="label">
              {t.channels}
            </p>
            <ChannelList channels={state.conversations} selected={channelId} onSelect={(id) => (location.hash = encodeURIComponent(id))} label={t.channels} />
          </div>
        )}
        <div data-part="side-foot">
          {guest ? (
            <p data-part="label" role="status">
              {othersHere === 0 ? t.guestAlone : t.guestOthers(othersHere)}
            </p>
          ) : (
            <PeopleList people={people} meId={state.you?.id} thinking={thinkingIds} spoke={spoke} arrived={arrived} t={t} />
          )}
          <div data-part="self">
            <div data-part="self-group" data-group="you">
              <p data-part="label" data-sheet-only="">
                {t.sheetYou}
              </p>
              {guest && state.you && (
                <>
                  <p data-part="visit-as">{t.guestAs(state.you.alias)}</p>
                  {left !== undefined && <p data-part="visit-time">{t.guestEndsIn(left)}</p>}
                </>
              )}
              {state.you && !guest && <SignSlot name={state.you.alias} current={state.you.sign} onChoose={chooseSign} t={t} />}
            </div>
            <div data-part="self-group" data-group="look">
              <p data-part="label" data-sheet-only="">
                {t.skin}
              </p>
              <SkinSwitch t={t} extra={skins} />
            </div>
            <div data-part="self-group" data-group="app">
              <p data-part="label" data-sheet-only="">
                {t.sheetApp}
              </p>
              {!guest && <NotifyButton t={t} />}
              {install.canPrompt && (
                <button type="button" onClick={() => void install.ask()} data-part="install">
                  {t.install}
                </button>
              )}
              {install.showIosHint && <p data-part="install-hint">{t.installIos}</p>}
              {install.installed && !guest && <p data-part="install-hint">{t.installedNote}</p>}
            </div>
            <div data-part="self-group" data-group="end">
              <button
                type="button"
                onClick={() => {
                  // a visitor's leaving ends their time at the portal too (asked before the key is let go; if it cannot be, the time runs out as it would have)
                  if (leavingEndsAVisit(state.you?.kind, readGuest())) void api.leave().catch(() => undefined);
                  onSignOut();
                }}
                data-part="signout"
              >
                {guest ? t.guestLeave : t.signOut}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main data-part="main">
        {selected && (
          <ChannelView
            channelId={selected.id}
            channelIds={state.conversations.map((c) => c.id)}
            title={selected.title}
            rows={rows}
            meId={state.you?.id}
            hasMore={state.more[selected.id] === true}
            loading={loadingFor === selected.id}
            onOlder={older}
            onSend={send}
            notice={guest ? t.guestNotPrivate : undefined}
            welcome={guest ? <GuestWelcome trailMinutes={state.trailMinutes} t={t} /> : undefined}
            snails={snail ? <Snails snail={snail} t={t} /> : undefined}
            note={note}
            whispers={whispers}
            thinking={thinking}
            connection={state.connection}
            t={t}
          />
        )}
      </main>

      <FieldWhispers t={t} />
    </div>
  );
}
