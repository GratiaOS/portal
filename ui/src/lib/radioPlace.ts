// 🍄 Where the mushroom of the radio sits, in every room. One line to change (`RADIO_PLACE`), if a place turns out to be too far from where the eyes are.
//
//   'head'  the head of the channel, beside the title and the line (a wide page); on a phone the head is not shown, so the top bar holds it
//   'foot'  right above the box where people write, on every width: where the eyes are
//
// A new place is a new name here, a line in `radioSits`, and a prop in `ChannelView`: nothing else in the page knows where it is.
export type RadioPlace = 'head' | 'foot';

export const RADIO_PLACE: RadioPlace = 'head';

/** Where the mushroom is drawn now. */
export function radioSits(place: RadioPlace, narrow: boolean): 'head' | 'topbar' | 'foot' {
  if (place === 'foot') return 'foot';
  return narrow ? 'topbar' : 'head';
}
