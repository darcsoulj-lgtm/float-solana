'use client';
import NextImage from 'next/image';
import { useState } from 'react';
export function MemberAvatar({
  alias,
  memberId,
  version,
}: {
  alias: string;
  memberId: string;
  version?: string | null;
}) {
  const [failed, setFailed] = useState('');
  return (
    <span className="member-avatar">
      {version && failed !== version ? (
        <NextImage
          unoptimized
          width={256}
          height={256}
          src={`/api/avatar?member=${encodeURIComponent(memberId)}&v=${encodeURIComponent(version)}`}
          alt=""
          onError={() => setFailed(version)}
        />
      ) : (
        alias.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
export async function prepareAvatar(file: File): Promise<Blob> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw Error('Choose a JPG, PNG or WebP image under 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Image editing is unavailable.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#f0f0f2';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob || blob.size > 100000)
      throw Error('Please choose a smaller photo.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
