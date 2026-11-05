export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonError(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  const message = e instanceof Error ? e.message : "Something went wrong";
  return Response.json({ error: message }, { status: 500 });
}
