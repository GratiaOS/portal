import type { Connection } from './client.ts';
import type { Activity, Conversation, Hello, Participant, Presence, Turn } from './types.ts';

export type RoomState = {
  you?: Participant;
  participants: Participant[];
  presence: Record<string, Presence>;
  /** Who is working on an answer, and where. */
  thinking: Activity[];
  conversations: Conversation[];
  /** Per conversation, oldest first. */
  turns: Record<string, Turn[]>;
  /** Per conversation: older turns may exist. True until a page of history comes back short. */
  more: Record<string, boolean>;
  /** The last turn the live stream gave us: where it picks up again. Turns from history do not move it. */
  cursor?: number;
  connection: Connection;
  /** Only for a visitor: how long what is said lasts (minutes). The page lets turns fade by it and drops them from memory past it. */
  trailMinutes?: number;
  visitMinutes?: number;
};

export type RoomAction =
  | { type: 'connection'; connection: Connection }
  | { type: 'hello'; hello: Hello }
  | { type: 'message'; turn: Turn; live: boolean }
  | { type: 'history'; conversationId: string; turns: Turn[]; limit: number }
  | { type: 'presence'; presence: Presence }
  | { type: 'participant'; participant: Participant }
  | { type: 'activity'; activity: Activity }
  | { type: 'forget'; before: number };

export const initialState: RoomState = {
  participants: [],
  presence: {},
  thinking: [],
  conversations: [],
  turns: {},
  more: {},
  connection: 'connecting',
};

/** Turns in order of `seq`, each once. The same turn arrives from the stream and from the call that sent it. */
export function mergeTurns(have: Turn[], incoming: Turn[]): Turn[] {
  const bySeq = new Map(have.map((t) => [t.seq, t] as const));
  for (const turn of incoming) bySeq.set(turn.seq, turn);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.connection };

    case 'hello': {
      const { hello } = action;
      // a room whose history is behind what we have seen was started anew: what we hold is of another life
      const reset = state.cursor !== undefined && hello.lastSeq < state.cursor;
      return {
        ...state,
        you: hello.you,
        trailMinutes: hello.trailMinutes,
        visitMinutes: hello.visitMinutes,
        participants: hello.participants,
        presence: Object.fromEntries(hello.presence.map((p) => [p.participantId, p])),
        thinking: hello.activity.filter((a) => a.state === 'thinking'),
        conversations: hello.conversations,
        turns: reset ? {} : state.turns,
        more: reset ? {} : state.more,
        cursor: state.cursor === undefined || reset ? hello.lastSeq : state.cursor,
      };
    }

    case 'message': {
      const { turn, live } = action;
      return {
        ...state,
        turns: { ...state.turns, [turn.conversationId]: mergeTurns(state.turns[turn.conversationId] ?? [], [turn]) },
        cursor: live ? Math.max(state.cursor ?? 0, turn.seq) : state.cursor,
      };
    }

    case 'history':
      return {
        ...state,
        turns: { ...state.turns, [action.conversationId]: mergeTurns(state.turns[action.conversationId] ?? [], action.turns) },
        more: { ...state.more, [action.conversationId]: action.turns.length >= action.limit },
      };

    case 'participant': {
      // how someone shows now (their sign): put in place of what we had, and in `you` when it is you
      const { participant } = action;
      return {
        ...state,
        // a participant the page has not heard of (a visitor who has just come in) is added, and one it knows is replaced
        participants: state.participants.some((p) => p.id === participant.id) ? state.participants.map((p) => (p.id === participant.id ? participant : p)) : [...state.participants, participant],
        you: state.you?.id === participant.id ? participant : state.you,
      };
    }

    case 'presence':
      return { ...state, presence: { ...state.presence, [action.presence.participantId]: action.presence } };

    case 'forget': {
      // what has outlived the trail goes from memory: nothing of it is kept anywhere else (no storage), so this is the end of it on this machine
      let changed = false;
      const turns: Record<string, Turn[]> = {};
      for (const [id, list] of Object.entries(state.turns)) {
        const kept = list.filter((turn) => Date.parse(turn.createdAt) >= action.before);
        if (kept.length !== list.length) changed = true;
        turns[id] = kept;
      }
      return changed ? { ...state, turns } : state;
    }

    case 'activity': {
      const { activity } = action;
      const others = state.thinking.filter((a) => !(a.participantId === activity.participantId && a.conversationId === activity.conversationId));
      return { ...state, thinking: activity.state === 'thinking' ? [...others, activity] : others };
    }
  }
}
