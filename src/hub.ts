import { canIn, endOfGuest, mayKnow } from './access.js';
import { forGuests, pseudonymOf } from './guests.js';
import type { DropsConfig } from './config.js';
import { participantId } from './domain.js';
import type { Conversation, Participant, Presence, Turn } from './domain.js';
import { frame } from './sse.js';
import type { RoomStore } from './store.js';

/** Where a connection's bytes go: a response, in production; a list, in tests. */
export type Sink = {
  write(chunk: string): void;
  close?(): void;
};

/** Someone is working on an answer in a conversation: shown as "thinking…", gone when the answer arrives. Never stored. */
export type Activity = {
  participantId: string;
  conversationId: string;
  state: 'thinking' | 'idle';
};

/** The first event of every connection: who you are, who is here, where to talk, and where the room is now. */
export type Hello = {
  you: Participant;
  participants: Participant[];
  presence: Presence[];
  /** Who is thinking right now, so a client that arrives in the middle of it sees it too. */
  activity: Activity[];
  conversations: Conversation[];
  lastSeq: number;
  /** Only to a guest: how long what is said in their room lasts, so that the page can let it fade before it is gone. */
  trailMinutes?: number;
  /** Only to the team: the name of the day it speaks under in the guest room. */
  guestName?: string;
  /** Only to a guest: how long a visit lasts (`guests.minutes`), so that the page can say which of the snails of the visit it is on. */
  visitMinutes?: number;
  /** Only to a person of the team, and only for a portal that has drops: which frequency they hold (`null` when none), never what is on it. */
  heldFrequency?: { freq: string; title: string } | null;
};

export type HubEvents = {
  turn: Turn;
  presence: Presence;
  activity: Activity;
};

export type HubOptions = {
  /** How long a human may be gone before they are shown offline, so a page refresh does not blink. Defaults to 5000 ms. */
  graceMs?: number;
  /** `guests.trailMinutes`, told to a guest in the hello. */
  trailMinutes?: number;
  /** `guests.minutes`, told to a guest in the hello. */
  visitMinutes?: number;
  /** The clock a guest's binding is read by, in milliseconds. For tests; defaults to the real one. */
  now?: () => number;
  /** The drops of the config, so that `hello` can say which frequency a person holds. Without them `hello` says nothing of drops. */
  drops?: DropsConfig;
};

/** Those who come and go, and are shown offline when they are not there: people and visitors. A companion is there while the portal runs. */
const comesAndGoes = (participant: Participant): boolean => participant.kind === 'human' || participant.kind === 'guest';

type Connection = { participant: Participant; sink: Sink; endTimer?: ReturnType<typeof setTimeout> };

const DEFAULT_GRACE_MS = 5000;
const REPLAY_PAGE = 1000;

export class Hub {
  private readonly connections = new Set<Connection>();
  private readonly presence = new Map<string, Presence>();
  private readonly leaving = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly thinking = new Map<string, Activity>();
  private readonly listeners: { [K in keyof HubEvents]: Set<(payload: HubEvents[K]) => void> } = {
    turn: new Set(),
    presence: new Set(),
    activity: new Set(),
  };
  private readonly graceMs: number;
  private readonly trailMinutes?: number;
  private readonly visitMinutes?: number;
  private readonly now: () => number;
  private readonly drops?: DropsConfig;

  constructor(
    private readonly store: RoomStore,
    options: HubOptions = {},
  ) {
    this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    this.trailMinutes = options.trailMinutes;
    this.visitMinutes = options.visitMinutes;
    this.now = options.now ?? Date.now;
    this.drops = options.drops;
  }

  /** Listen to what happens in the room: every turn, from a person or a companion, and every change of presence. */
  on<K extends keyof HubEvents>(event: K, listener: (payload: HubEvents[K]) => void): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  /** The one way a turn enters the room: written, then told to everyone, then to the listeners. */
  publish(input: { conversationId: string; speakerId: string; text: string }): Turn {
    const turn = this.store.appendTurn(input);
    // in the guest room everyone is as a guest: the team too, whoever reads it, speaks under a name of the day
    const guestRoom = this.store.getConversation(turn.conversationId)?.kind === 'guest';
    const hidden = forGuests(this.store, turn, this.now());
    this.broadcast(frame('message', turn, turn.seq), (to) => !guestRoom && to.kind !== 'guest' && this.mayRead(to, turn.conversationId));
    this.broadcast(frame('message', hidden, turn.seq), (to) => (guestRoom || to.kind === 'guest') && this.mayRead(to, turn.conversationId));
    this.emit('turn', turn);
    return turn;
  }

  /** A turn as this reader is given it: in the guest room, and for any guest, the team's words come under a name of the day, never their own. */
  seenBy(viewer: Participant, turn: Turn): Turn {
    return viewer.kind === 'guest' || this.store.getConversation(turn.conversationId)?.kind === 'guest' ? forGuests(this.store, turn, this.now()) : turn;
  }

  /**
   * Opens a connection. It gets `hello`, then every turn after `lastEventId` (what it missed while away),
   * then whatever happens next. Returns the way to close it; calling that twice is fine.
   */
  subscribe(participant: Participant, sink: Sink, lastEventId?: string | number): () => void {
    const connection: Connection = { participant, sink };

    this.cancelLeaving(participant.id);
    // told before the connection exists, so the newcomer hears about everyone else, not about themselves
    if (comesAndGoes(participant) && this.presenceOf(participant).state !== 'online') this.setPresence(participant.id, 'online');
    this.connections.add(connection);

    // a guest's stream ends when their time does: it does not outlive the binding that opened it
    const end = endOfGuest(this.store, participant, this.now());
    if (end !== undefined) {
      connection.endTimer = setTimeout(() => {
        this.drop(connection);
        connection.sink.close?.();
      }, Math.max(0, end - this.now()));
      (connection.endTimer as { unref?: () => void }).unref?.(); // Node's timer can be let go of; on Cloudflare a timer is a number
    }

    // what a connection is told is what its participant may know: a guest hears of their own room and of no one on the team
    const known = this.store.listParticipants().filter((other) => mayKnow(participant, other));
    const hello: Hello = {
      you: participant,
      participants: known,
      presence: known.map((p) => this.presenceOf(p)),
      activity: [...this.thinking.values()].filter((a) => this.mayRead(participant, a.conversationId)),
      conversations: this.store.listConversations().filter((c) => this.mayRead(participant, c.id)),
      lastSeq: this.store.lastSeq(),
      // to the team: the name of the day it goes by in the guest room, so that the page knows its own words there
      ...(participant.kind !== 'guest' && participant.kind !== 'companion' ? { guestName: pseudonymOf(participant.id, this.now()) } : {}),
      ...(participant.kind === 'guest' && this.trailMinutes !== undefined ? { trailMinutes: this.trailMinutes } : {}),
      ...(participant.kind === 'guest' && this.visitMinutes !== undefined ? { visitMinutes: this.visitMinutes } : {}),
      // the identity of the box, for the page to ask for what is in it: said to the team alone, and only where the portal has drops
      ...(this.drops && participant.kind !== 'guest' ? { heldFrequency: this.heldBy(participant) } : {}),
    };
    if (this.deliver(connection, frame('hello', hello))) this.replay(connection, lastEventId);

    let open = true;
    return () => {
      if (!open) return;
      open = false;
      this.drop(connection);
    };
  }

  private heldBy(participant: Participant): { freq: string; title: string } | null {
    const held = this.drops?.frequencies.find((f) => participantId('human', f.holder) === participant.id);
    return held ? { freq: held.freq, title: held.title } : null;
  }

  /** Says that someone starts or stops working on an answer in a conversation. Saying it twice changes nothing. */
  setActivity(participantId: string, conversationId: string, state: Activity['state']): void {
    const key = `${participantId}|${conversationId}`;
    const was = this.thinking.has(key);
    const activity: Activity = { participantId, conversationId, state };
    if (state === 'thinking') {
      if (was) return;
      this.thinking.set(key, activity);
    } else {
      if (!was) return;
      this.thinking.delete(key);
    }
    this.broadcast(frame('activity', activity), (to) => this.mayRead(to, conversationId));
    this.emit('activity', activity);
  }

  /**
   * Tells one participant, on every connection they have, that something was left on their frequency: only the frequency, never what was left,
   * and no one else. It is not a turn and has no id, so it is not part of what a connection that comes later is given; nothing is kept of it.
   */
  notifyDrop(participantId: string, freq: string): void {
    this.broadcast(frame('drop', { freq }), (to) => to.id === participantId);
  }

  /**
   * Tells one participant, on every connection they have, that a packet of their frequency was burned: the frequency and the id, to drop it
   * from an open box. Not a pulse (no dot, no sound), no `id` of its own, and nothing is kept of it.
   */
  notifyDropGone(participantId: string, freq: string, id: string): void {
    this.broadcast(frame('drop-gone', { freq, id }), (to) => to.id === participantId);
  }

  /** Tells everyone how someone shows now (their sign), as they show in `hello`. Not kept: the store has only the current one. */
  participantChanged(participant: Participant): void {
    this.broadcast(frame('participant', participant), (to) => mayKnow(to, participant));
  }

  /** A guest's visit ends now, because they left: their connections close at once and they are not here, with no wait to see if they come back. */
  endVisit(participant: Participant): void {
    for (const connection of [...this.connections]) {
      if (connection.participant.id !== participant.id) continue;
      this.drop(connection);
      connection.sink.close?.();
    }
    this.cancelLeaving(participant.id);
    if (this.presenceOf(participant).state !== 'offline') this.setPresence(participant.id, 'offline');
  }

  /** Who is here, for everyone the room knows. */
  snapshot(): Presence[] {
    return this.store.listParticipants().map((p) => this.presenceOf(p));
  }

  /** Ends every connection and stops the timers. */
  close(): void {
    for (const timer of this.leaving.values()) clearTimeout(timer);
    this.leaving.clear();
    this.thinking.clear();
    for (const { sink, endTimer } of this.connections) {
      if (endTimer) clearTimeout(endTimer);
      sink.close?.();
    }
    this.connections.clear();
  }

  private presenceOf(participant: Participant): Presence {
    return (
      this.presence.get(participant.id) ?? {
        participantId: participant.id,
        state: comesAndGoes(participant) ? 'offline' : 'online',
      }
    );
  }

  private setPresence(participantId: string, state: Presence['state']): void {
    const presence: Presence = { participantId, state };
    this.presence.set(participantId, presence);
    const who = this.store.getParticipant(participantId);
    this.broadcast(frame('presence', presence), (to) => !who || mayKnow(to, who));
    this.emit('presence', presence);
  }

  private cancelLeaving(participantId: string): void {
    const timer = this.leaving.get(participantId);
    if (timer) clearTimeout(timer);
    this.leaving.delete(participantId);
  }

  private hasConnection(participantId: string): boolean {
    for (const { participant } of this.connections) if (participant.id === participantId) return true;
    return false;
  }

  private drop(connection: Connection): void {
    if (!this.connections.delete(connection)) return;
    if (connection.endTimer) clearTimeout(connection.endTimer);
    const { participant } = connection;
    if (!comesAndGoes(participant) || this.hasConnection(participant.id)) return;

    // not offline yet: the same person often comes right back (a refresh, a tunnel, a phone changing network)
    const timer = setTimeout(() => {
      this.leaving.delete(participant.id);
      if (!this.hasConnection(participant.id)) this.setPresence(participant.id, 'offline');
    }, this.graceMs);
    (timer as { unref?: () => void }).unref?.(); // as above
    this.leaving.set(participant.id, timer);
  }

  private replay(connection: Connection, lastEventId: string | number | undefined): void {
    let cursor = Number.parseInt(String(lastEventId ?? ''), 10);
    if (!Number.isInteger(cursor) || cursor < 0) return; // nothing asked for; history comes from the REST side

    // a guest is not given what has outlived the trail, even in the minutes before the portal lets it go
    const since = connection.participant.kind === 'guest' && this.trailMinutes ? new Date(this.now() - this.trailMinutes * 60_000).toISOString() : undefined;
    for (;;) {
      const page = this.store.turnsAfter(cursor, REPLAY_PAGE);
      for (const turn of page) {
        if (!this.mayRead(connection.participant, turn.conversationId)) continue;
        if (since && turn.createdAt < since) continue;
        if (!this.deliver(connection, frame('message', this.seenBy(connection.participant, turn), turn.seq))) return;
      }
      if (page.length < REPLAY_PAGE) return;
      cursor = page[page.length - 1].seq;
    }
  }

  /** A connection that cannot be written to is gone; the others do not wait for it. */
  private deliver(connection: Connection, chunk: string): boolean {
    try {
      connection.sink.write(chunk);
      return true;
    } catch {
      this.drop(connection);
      return false;
    }
  }

  /** Told to the connections whose participant may be told it (everyone, when no one is named). */
  private broadcast(chunk: string, to: (participant: Participant) => boolean = () => true): void {
    for (const connection of [...this.connections]) if (to(connection.participant)) this.deliver(connection, chunk);
  }

  private mayRead(participant: Participant, conversationId: string): boolean {
    return canIn(this.store, participant, conversationId, 'read', this.now());
  }

  private emit<K extends keyof HubEvents>(event: K, payload: HubEvents[K]): void {
    for (const listener of [...this.listeners[event]]) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`portal: a "${event}" listener failed`, err);
      }
    }
  }
}
