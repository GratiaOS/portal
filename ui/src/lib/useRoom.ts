import { useEffect, useMemo, useReducer, useRef } from 'react';
import { connectStream, createApi } from './client.ts';
import { initialState, roomReducer } from './state.ts';
import type { Activity, Hello, Participant, Presence, Turn } from './types.ts';

/** The room as the page sees it: the stream applied to the state, and the way to ask and to say. */
export function useRoom(token: string, onRefused: () => void) {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const api = useMemo(() => createApi(token), [token]);

  // Where the stream picks up after a break. Kept here as well as in the state, because a reconnect reads it at once,
  // before the next render has put the last event into the state.
  const cursor = useRef<number | undefined>(undefined);
  const refused = useRef(onRefused);
  refused.current = onRefused;

  useEffect(() => {
    cursor.current = undefined;
    const stream = connectStream({
      token,
      cursor: () => cursor.current,
      onConnection: (connection) => {
        dispatch({ type: 'connection', connection });
        if (connection === 'refused') refused.current();
      },
      onFrame: ({ event, data }) => {
        if (event === 'hello') {
          const hello = data as Hello;
          cursor.current = cursor.current === undefined || hello.lastSeq < cursor.current ? hello.lastSeq : cursor.current;
          dispatch({ type: 'hello', hello });
        } else if (event === 'message') {
          const turn = data as Turn;
          cursor.current = Math.max(cursor.current ?? 0, turn.seq);
          dispatch({ type: 'message', turn, live: true });
        } else if (event === 'presence') dispatch({ type: 'presence', presence: data as Presence });
        else if (event === 'activity') dispatch({ type: 'activity', activity: data as Activity });
        else if (event === 'participant') dispatch({ type: 'participant', participant: data as Participant });
      },
    });
    return () => stream.close();
  }, [token]);

  return { state, dispatch, api };
}
