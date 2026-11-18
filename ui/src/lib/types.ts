// The shapes the room speaks over the wire, as `src/domain.ts` and `src/hub.ts` define them.
// Kept here by hand so the UI builds on its own; a change on the room's side is a change here.

export type ParticipantKind = 'human' | 'companion' | 'service' | 'guest';

export type Participant = {
  id: string;
  kind: ParticipantKind;
  alias: string;
  locale?: string;
  capabilities: string[];
  /** One emoji after the name: the one they chose, or the one they were given. */
  sign?: string;
};

export type Conversation = {
  id: string;
  title: string;
  visibility: 'private' | 'public' | 'sealed';
  status: 'open' | 'closed';
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type Turn = {
  seq: number;
  id: string;
  conversationId: string;
  speakerId: string;
  text: string;
  mentions: string[];
  createdAt: string;
};

/** A look from the room's skins folder: the name of its folder, what to call it, a sign for its button, and the built-in look whose layout it keeps. */
export type SkinInfo = { id: string; name: string; emoji?: string; extends?: string };

/** What the box where people write may say: who can be called, and questions that companion is good at. */
export type Hints = { companion: string | null; examples: string[] };

/** Who is here, now. No time: the room does not know when anyone came or went, and says so. */
export type Presence = { participantId: string; state: 'online' | 'offline' };

export type Activity = { participantId: string; conversationId: string; state: 'thinking' | 'idle' };

export type Hello = {
  you: Participant;
  participants: Participant[];
  presence: Presence[];
  activity: Activity[];
  conversations: Conversation[];
  lastSeq: number;
  /** Said only to a visitor: how long what is said in their room lasts. */
  trailMinutes?: number;
  visitMinutes?: number;
  /** Said only to the team, and only by a portal that has drops: the frequency this person holds (`null` when none). Absent: no drops here. */
  heldFrequency?: { freq: string; title: string } | null;
};

/** One packet left on a frequency, as the room gives it: no sender and no time it was left, only when it goes (milliseconds). */
export type Drop = { id: string; type: 'drop'; payload: { body: string; format: string; /** The seal it was sealed with in Amigo, when it came with one. */ sigil?: string }; fadesAt: number };

/** What `GET /api/drops` gives the one who holds the frequency, the newest packet first. */
export type DropBox = { freq: string; title: string; drops: Drop[] };
