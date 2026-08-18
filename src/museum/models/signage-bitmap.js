export function createGpuReadySignageBitmap(canvas, createBitmap = createImageBitmap) {
  return createBitmap(canvas, { imageOrientation: 'flipY' });
}
