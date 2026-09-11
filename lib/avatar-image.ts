// Raster-only, bounded JPEGs from the photo uploader; reject metadata and oversized dimensions.
export function validAvatarJpeg(bytes: Uint8Array) {
  const size = bytes.length;
  if (
    size < 100 ||
    size > 100000 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes[size - 2] !== 255 ||
    bytes[size - 1] !== 217
  )
    return false;
  let position = 2,
    validFrame = false;
  while (position < size - 2) {
    if (bytes[position++] !== 255) return false;
    while (bytes[position] === 255) position++;
    const marker = bytes[position++];
    if (marker === 0xda) return validFrame;
    if (marker === 0xe1) return false; // EXIF/XMP is stripped by the uploader.
    if (marker === 0xd9) break;
    if (position + 2 > size) return false;
    const length = bytes[position] * 256 + bytes[position + 1];
    if (length < 2 || position + length > size) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return false;
      const height = bytes[position + 3] * 256 + bytes[position + 4],
        width = bytes[position + 5] * 256 + bytes[position + 6];
      if (width < 1 || height < 1 || width > 1024 || height > 1024)
        return false;
      validFrame = true;
    }
    position += length;
  }
  return false;
}
