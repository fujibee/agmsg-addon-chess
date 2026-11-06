// How far back the camera stands and where the fog starts, so the board is whole and clear at any pane shape.
// Plain numbers in and out, no three.js, so a test can check it.

const BOARD_RADIUS = 6.6; // from the middle of the board to its far corner, frame and pieces included

/**
 * `dist` is the distance the user chose (the wheel); `aspect` is the view's width over its height.
 * A view narrower than 1.15 stands back by the same ratio so the sides of the board stay in; the fog starts past the
 * board's far edge and ends well behind it, and the far plane stays beyond the fog, whatever the distance.
 */
export function framing(dist, aspect) {
  const d = dist * Math.max(1, 1.15 / Math.max(aspect, 0.05));
  return { d, fogNear: d + BOARD_RADIUS + 0.5, fogFar: d + BOARD_RADIUS + 18, far: Math.max(80, d + BOARD_RADIUS + 40) };
}
