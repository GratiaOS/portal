# 🗿 Traces — quest map 🎁

Each quest is a place Room was read from. Open the link, see what was meant, tick it when you have been there. Links are permalinks `https://github.com/GratiaOS/<repository>/blob/<commit>/<path>`; `pnpm --filter portal traces` checks they still answer.

Read at the private monorepo commit `b821e91` (2026-10-29); linked at the public copies: firegate `e4f7912`, m3 `c76a3cb`, firecircle `7e97c12`. Room is MPL-2.0 and written new: leave a trace when you add something that comes from one of these.

## The page (`ui/`)

- [ ] `MessageBubble` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MessageBubble.tsx`
- [ ] `SeedPortal` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/SeedPortal.tsx`
- [ ] `MemoryStream` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx`
- [ ] `ChannelView` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx`
- [ ] `SignalQuality` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/SignalQuality.tsx`
- [ ] `PresenceDot` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceDot.tsx`
- [ ] `PeopleList` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceCounter.tsx`
- [ ] `ThinkingPill` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx`
- [ ] `ParticleField` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx`
- [ ] `FieldWhispers` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/FieldCompanion.tsx`
- [ ] `LoginGate` ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/MembraneGate.tsx`
- [ ] `ChannelList` ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/FamJamPad.tsx`
- [ ] `RadioMushroom` (and `useRadio`) ← `apps/amigo-web/app/fm/Radio.tsx ＠ c3889d87`, `apps/amigo-web/app/fm/page.tsx ＠ c3889d87`, `apps/amigo-web/app/lib/fm.ts ＠ c3889d87`
- [ ] the door of Parking, with no key to bring (`step through`) ← `https://github.com/GratiaOS/garden-core/blob/619a4acada7635b3f611684daeb281d332e04c4d/docs/patterns/missing-screw-field.md` and `https://github.com/GratiaOS/gratia-presence/blob/a5afa4ff8880fca5ee9885d94ae7de217959fdbd/packages/ui/src/hooks/useMissingScrew.ts`
- [ ] the yellow of the page ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/index.css` and `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/styles/theme.css`
- [ ] the look ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/UIStyleGuide.md` and `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/presence/usePresence.ts`

## Left in Firegate

- [ ] ambient layers ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/index.css`
- [ ] rotating whispers ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/FieldCompanion.tsx`
- [ ] shouting as static ← `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/lib/somatic.ts`

## The room (`src/`)

- [ ] `Participant`, `Conversation`, `Turn`, `Presence` ← RFC 0000 §7, no public copy
- [ ] ids as `kind:alias` ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/TownPad.tsx`
- [ ] Nova's voice ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/utils/joy.ts`
- [ ] `visibility` ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/server/src/db.rs`
- [ ] turns are never rewritten ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/docs/privacy.md`
- [ ] `Presence` ← RFC 0000 §7, no public copy
- [ ] the line between Room and Firecircle ← `https://github.com/GratiaOS/firecircle/blob/7e97c1230e4fd7d57e8a0250be3d2eb61733bda3/README.md`
- [ ] channels ← `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/FamJamPad.tsx`
- [ ] what a participant may do in a room (`src/authority.ts`) ← `@gratiaos/identity-core` 0.2.0, public on npm (`dist/authority.js`), no permalink: its source is in a private repository
