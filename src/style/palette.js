// W17 «Стиль»: the owner's six colours (plan-W17-style.md) and the shades made from them. The one
// source for the 3D world, the canvases (board, wrist) and, from S3 on, the CSS variables.
//   night    the background, the sky, the deepest shade
//   dusk     the fog, the cards, the walls' family
//   lamp     a lamp's light, "you are seen", money, the main action
//   alarm    the alarm only: the alarm, a scream, "caught"
//   whisper  sound: the microphone, the ripples of steps, the lurkers' eyes
//   paper    text, notes, the board's letters
export const PAL = {
  night: 0x0d1322, dusk: 0x18223a, lamp: 0xffb347, alarm: 0xff5468, whisper: 0x7fd0ff, paper: 0xefe6d4,
  ink: 0x05070d,        // the outlines: darker than night, not pure black
};
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
