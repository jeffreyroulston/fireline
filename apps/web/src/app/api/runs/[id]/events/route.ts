const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Allow overnight Monte Carlo streams; default serverless 300s is far too short. */
export const maxDuration = 86400;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const upstream = await fetch(
    `${apiOrigin}/runs/${encodeURIComponent(id)}/events`,
    {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: request.signal,
    },
  );

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => upstream.statusText);
    return new Response(message || "Run stream failed.", {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
