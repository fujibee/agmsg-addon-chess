/** Gives back the GPU buffers of a piece that left the board. Its materials are shared by all pieces, so they stay. */
export function disposePiece(group) {
  group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
}
