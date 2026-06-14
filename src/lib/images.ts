export function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}
