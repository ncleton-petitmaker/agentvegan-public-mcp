const OPENAI_SUBJECT = /^v1\/[A-Za-z0-9_-]{1,60}$/u;

export function rateLimitKey(request: Request): string {
  const openAiSubject = request.headers.get("X-OpenAI-Subject")?.trim();
  if (openAiSubject && OPENAI_SUBJECT.test(openAiSubject)) return openAiSubject;
  const clientIp = request.headers.get("CF-Connecting-IP")?.trim();
  return clientIp && clientIp.length <= 64 ? clientIp : "local-or-unknown";
}
