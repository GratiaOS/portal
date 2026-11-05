/**
 * The nouns of the room, after RFC 0000 §7: Participant, Conversation, Turn
 * (Presence lives in the hub, Artifact is not needed yet).
 *
 * 🗿 trace
 * Name from:  RFC 0000 section 7, "Canonical Companion Model"; the voices `species:name` of M3's towns; M3's words for privacy.
 * Root:       RFC 0000 section 7, in the history of the project; it has no public copy
 * Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/TownPad.tsx
 * Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/server/src/db.rs
 * Same idea:  the nouns Participant, Conversation, Turn, Presence; ids as `kind:alias`; `private`, `public`, `sealed`.
 * Different:  a Turn has `text`, not `input` and `output`; visibility is on a conversation, not on each message;
 *             Presence has no `lastSeen` and no `channel`: the room says who is here, never when they came or went.
 * Not copied: written new for Room (MPL-2.0); the RFC is a document, M3's server is AGPL-3.0 and its UI Apache-2.0.
 */

/** `service` is for local helpers; `companion` is a participant that thinks, like Nova. */
export type ParticipantKind = 'human' | 'companion' | 'service';
export const PARTICIPANT_KINDS: readonly ParticipantKind[] = ['human', 'companion', 'service'];

export type Participant = {
  /** `kind:alias`, lowercase: `human:zeus`, `companion:nova`. The same voices M3's towns use. */
  id: string;
  kind: ParticipantKind;
  /** What people type after `@`. Letters, digits, `_`, `.`, `-`; starts and ends with a letter or digit. */
  alias: string;
  locale?: string;
  capabilities: string[];
  /**
   * One emoji after the name, `ida🦁`: the one the person chose, or else the one they were given. Only the one shown now is kept,
   * never when it changed or what it was before; and it is for the people in the room, not for a companion to read.
   */
  sign?: string;
};

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** One emoji and nothing else: one grapheme (a flag, a skin tone or a family joined by ZWJ is one), a pictograph, no letters or digits. */
export function isSign(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 32) return false;
  if ([...GRAPHEMES.segment(value)].length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/[\p{L}\p{N}\s]/u.test(value);
}

/** The vocabulary of M3's messages. Only `private` and `public` mean something yet; `sealed` is kept for encryption at rest. */
export type Visibility = 'private' | 'public' | 'sealed';
export const VISIBILITIES: readonly Visibility[] = ['private', 'public', 'sealed'];

/** A channel id is a slug: it ends up in URLs. */
export const CONVERSATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type ConversationStatus = 'open' | 'closed';

/** A channel. Everyone configured is in every channel for now (RFC's `participants` field waits for a reason). */
export type Conversation = {
  id: string;
  title: string;
  visibility: Visibility;
  status: ConversationStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

/** One intervention in a conversation. The RFC's `input`/`output` is a request-response shape; a room message is one voice, so `text`. */
export type Turn = {
  /** Global order across all conversations; the cursor for history and for resuming a stream. */
  seq: number;
  id: string;
  conversationId: string;
  speakerId: string;
  text: string;
  /** Ids of the participants named with `@`. */
  mentions: string[];
  createdAt: string;
};

/**
 * Who is here, now. Only humans come and go; a companion is there as long as the room runs.
 * There is no time in it, on purpose: the room does not know when anyone came or went, so nobody can be handed
 * a timecard of anyone else, and the wire has nothing to build one from.
 */
export type Presence = {
  participantId: string;
  state: 'online' | 'offline';
};

/**
 * Why a question is on the list of what the knowledge lacked. `model_found_nothing`: she said something was missing;
 * `figures_unverified`: her figures could not be found in what she leaned on. The other two were written by an earlier
 * form of her and are kept so that what was recorded can still be read.
 */
export type GapReason = 'model_found_nothing' | 'no_real_source' | 'empty_answer' | 'figures_unverified';
export const GAP_REASONS: readonly GapReason[] = ['model_found_nothing', 'no_real_source', 'empty_answer', 'figures_unverified'];

/**
 * A question the knowledge could not answer, with how often it was asked. Whoever asked is not kept, and neither
 * is the time of day: a gap is a hole in the knowledge, not a record of a person.
 */
export type KnowledgeGap = {
  question: string;
  /** Why, the last time it was asked. */
  why: GapReason;
  /** The files the model cited that do exist, if it cited any (for figures it could not confirm). */
  sources: string[];
  asked: number;
  firstDay: string;
  lastDay: string;
  /** Where it was last asked. */
  conversationId: string;
};

export const MAX_TEXT_LENGTH = 4000;

export const ALIAS_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}_.-]{0,30}[\p{L}\p{N}])?$/u;

export function participantId(kind: ParticipantKind, alias: string): string {
  return `${kind}:${alias.toLowerCase()}`;
}

/** What the caller did wrong, in words the HTTP layer can turn into a status. */
export class RoomError extends Error {
  readonly code: 'invalid' | 'not_found' | 'closed';

  constructor(code: RoomError['code'], message: string) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}
