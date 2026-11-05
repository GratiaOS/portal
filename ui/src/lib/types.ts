// The shapes the room speaks over the wire, as `src/domain.ts` and `src/hub.ts` define them.
// Kept here by hand so the UI builds on its own; a change on the room's side is a change here.

export type ParticipantKind = 'human' | 'companion' | 'service';

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
};
