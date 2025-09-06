import { get } from '../../../../line/cdn';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params?.id;
  const entry = id ? get(id) : undefined;
  if (!entry) return new Response('Not Found', { status: 404 });
  return new Response(entry.buf, {
    status: 200,
    headers: {
      'content-type': entry.mime,
      'cache-control': 'public, max-age=60',
    },
  });
}

