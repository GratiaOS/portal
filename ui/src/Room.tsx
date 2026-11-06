import { useCallback, useEffect, useMemo, useState } from 'react';
import ChannelList from './components/ChannelList.tsx';
import ChannelView from './components/ChannelView.tsx';
import NotifyButton from './components/NotifyButton.tsx';
import PeopleList from './components/PeopleList.tsx';
import FieldWhispers from './components/FieldWhispers.tsx';
import SignSlot from './components/SignSlot.tsx';
import SkinSwitch from './components/SkinSwitch.tsx';
import { ApiError } from './lib/client.ts';
import { rowsOf } from './lib/format.ts';
import { peopleOf, thinkingIn } from './lib/people.ts';
import { useArrived } from './lib/arrivals.ts';
import { useSpoke } from './lib/spoke.ts';
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
  const t = stringsFor(state.you?.locale ?? navigator.language);
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
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const selected = state.conversations.find((c) => c.id === wanted) ?? state.conversations[0];
  const channelId = selected?.id;
  const { here: looking, start } = useUnread(state, channelId, TITLE);
  useNotify(state, looking, start, t);

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

  const turns = channelId ? (state.turns[channelId] ?? []) : [];
  const rows = useMemo(() => rowsOf(turns, state.participants), [turns, state.participants]);

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
    <div data-part="room">
      <aside data-part="side">
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
            {state.you && !guest && <SignSlot name={state.you.alias} current={state.you.sign} onChoose={chooseSign} t={t} />}
            <SkinSwitch t={t} extra={skins} />
            {!guest && <NotifyButton t={t} />}
            <button type="button" onClick={() => onSignOut()} data-part="signout">
              {guest ? t.guestLeave : t.signOut}
            </button>
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
