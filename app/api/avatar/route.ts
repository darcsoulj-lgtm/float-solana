import { validAvatarJpeg } from '@/lib/avatar-image';
import { communityMember } from '@/lib/community-server';
import { db, runtime, rateLimit } from '@/lib/server';
import { AppError } from '@/lib/validation';
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
};
async function handle(req: Request) {
  try {
    const member = await communityMember(req);
    const bucket = runtime().AVATARS;
    if (!bucket) throw new AppError('Photo storage is unavailable.', 503);
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('member');
      if (!id || id.length > 80) throw new AppError('Invalid member.');
      const row = await db()
        .prepare(
          'SELECT avatar_key FROM community_members WHERE id=? AND suspended=0',
        )
        .bind(id)
        .first<{ avatar_key: string | null }>();
      const photo = row?.avatar_key ? await bucket.get(row.avatar_key) : null;
      if (!photo) return new Response(null, { status: 404, headers });
      return new Response(photo.body, {
        headers: { ...headers, 'Content-Type': 'image/jpeg' },
      });
    }
    if (req.headers.get('origin') !== new URL(req.url).origin)
      throw new AppError('A same-origin request is required.', 403);
    await rateLimit('avatar:' + member!.id, 6);
    const old = member!.avatar_key;
    if (req.method === 'DELETE') {
      await db()
        .prepare('UPDATE community_members SET avatar_key=NULL WHERE id=?')
        .bind(member!.id)
        .run();
      if (old) await bucket.delete(old);
      return Response.json({ ok: true }, { headers });
    }
    if (req.headers.get('content-type') !== 'image/jpeg')
      throw new AppError('Use a JPEG image.', 415);
    if (Number(req.headers.get('content-length')) > 100000)
      throw new AppError('Photo is too large.', 413);
    const reader = req.body?.getReader();
    if (!reader) throw new AppError('Choose a photo.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 100000) {
        await reader.cancel();
        throw new AppError('Photo is too large.', 413);
      }
      chunks.push(r.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    if (!validAvatarJpeg(bytes)) throw new AppError('Invalid JPEG image.');
    const key = `avatars/${member!.id}/${crypto.randomUUID()}.jpg`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    try {
      await db()
        .prepare('UPDATE community_members SET avatar_key=? WHERE id=?')
        .bind(key, member!.id)
        .run();
    } catch (e) {
      await bucket.delete(key);
      throw e;
    }
    if (old) await bucket.delete(old);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : 'Could not update photo. Try again.',
      },
      { status: e instanceof AppError ? e.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
