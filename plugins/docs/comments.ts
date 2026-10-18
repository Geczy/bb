import { z } from "zod";

export const commentAuthorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), name: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("agent"),
      name: z.string().min(1),
      threadId: z.string().min(1),
    })
    .strict(),
]);
export const commentAnchorSchema = z
  .object({
    quote: z.string().min(1),
    prefix: z.string(),
    suffix: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    documentSha256: z.string().min(1),
  })
  .strict()
  .refine((a) => a.end > a.start);
export const commentMessageSchema = z
  .object({
    id: z.string().min(1),
    author: commentAuthorSchema,
    body: z.string().trim().min(1).max(50_000),
    createdAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable(),
    sentTo: z
      .array(z.object({ id: z.string(), name: z.string() }).strict())
      .default([]),
  })
  .strict();
export const commentThreadSchema = z
  .object({
    id: z.string().min(1),
    anchor: commentAnchorSchema,
    resolvedAt: z.iso.datetime().nullable(),
    resolvedBy: commentAuthorSchema.nullable(),
    messages: z.array(commentMessageSchema).min(1),
  })
  .strict();
export const commentsFileSchema = z
  .object({ version: z.literal(1), threads: z.array(commentThreadSchema) })
  .strict();
export const resolvedAnchorSchema = z
  .object({
    state: z.enum(["anchored", "moved", "orphaned"]),
    quote: z.string(),
    start: z.number().int().nullable(),
    end: z.number().int().nullable(),
    line: z.number().int().nullable(),
  })
  .strict();
export const listedCommentSchema = commentThreadSchema.extend({
  status: z.enum(["open", "resolved"]),
  anchor: resolvedAnchorSchema,
});
export const commentsListSchema = z.object({
  sidecarSha256: z.string().nullable(),
  threads: z.array(listedCommentSchema),
  notice: z.string().nullable(),
});
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;
export type CommentAnchor = z.infer<typeof commentAnchorSchema>;
export type CommentMessage = z.infer<typeof commentMessageSchema>;
export type CommentThread = z.infer<typeof commentThreadSchema>;
export type CommentsFile = z.infer<typeof commentsFileSchema>;
export type ListedComment = z.infer<typeof listedCommentSchema>;
export type CommentsList = z.infer<typeof commentsListSchema>;
export type VisibleDocument = { text: string; lines: number[] };

export function exactOccurrences(text: string, quote: string): number[] {
  if (!quote) return [];
  const positions: number[] = [];
  for (
    let start = text.indexOf(quote);
    start >= 0;
    start = text.indexOf(quote, start + 1)
  )
    positions.push(start);
  return positions;
}
export function makeAnchor(
  text: string,
  start: number,
  end: number,
  sha256: string,
): CommentAnchor {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 48), start),
    suffix: text.slice(end, end + 48),
    start,
    end,
    documentSha256: sha256,
  };
}
function contextScore(
  text: string,
  start: number,
  end: number,
  anchor: CommentAnchor,
): number {
  let score = 0;
  for (let i = 1; i <= anchor.prefix.length && i <= start; i++) {
    if (text[start - i] !== anchor.prefix[anchor.prefix.length - i]) break;
    score++;
  }
  for (let i = 0; i < anchor.suffix.length && end + i < text.length; i++) {
    if (text[end + i] !== anchor.suffix[i]) break;
    score++;
  }
  return score;
}
function fuzzyRange(
  text: string,
  anchor: CommentAnchor,
): { start: number; end: number } | null {
  const quote = anchor.quote;
  if (quote.length < 8 || quote.length > 2048) return null;
  const errors = Math.floor(quote.length / 4);
  const left = Math.max(0, anchor.start - 512);
  const right = Math.min(text.length, anchor.end + 512);
  let costs = Array.from({ length: quote.length + 1 }, (_, i) => i);
  let starts = costs.map(() => left);
  let best: { start: number; end: number; score: number } | null = null;
  for (let end = left; end < right; end++) {
    const next = [0];
    const nextStarts = [end + 1];
    for (let i = 1; i <= quote.length; i++) {
      const choices = [
        costs[i - 1] + (quote[i - 1] === text[end] ? 0 : 1),
        costs[i] + 1,
        next[i - 1] + 1,
      ];
      const cost = Math.min(...choices);
      const choice = choices.indexOf(cost);
      next[i] = cost;
      nextStarts[i] =
        choice === 0
          ? starts[i - 1]
          : choice === 1
            ? starts[i]
            : nextStarts[i - 1];
    }
    const distance = next[quote.length];
    const start = nextStarts[quote.length];
    if (distance <= errors && end + 1 > start) {
      const context = contextScore(text, start, end + 1, anchor);
      if (
        context >= Math.min(8, anchor.prefix.length + anchor.suffix.length) &&
        context > 0
      ) {
        const score =
          context * 4 - distance * 2 - Math.abs(start - anchor.start) / 1024;
        if (!best || score > best.score) best = { start, end: end + 1, score };
      }
    }
    costs = next;
    starts = nextStarts;
  }
  return best;
}
export function resolveAnchor(
  doc: VisibleDocument,
  sha256: string,
  anchor: CommentAnchor,
): ListedComment["anchor"] {
  const result = (
    start: number,
    end: number,
    state: "anchored" | "moved",
  ): ListedComment["anchor"] => ({
    state,
    quote: anchor.quote,
    start,
    end,
    line: doc.lines[start] ?? 1,
  });
  if (
    sha256 === anchor.documentSha256 &&
    doc.text.slice(anchor.start, anchor.end) === anchor.quote
  )
    return result(anchor.start, anchor.end, "anchored");
  const matches = exactOccurrences(doc.text, anchor.quote);
  matches.sort(
    (a, b) =>
      contextScore(doc.text, b, b + anchor.quote.length, anchor) -
        contextScore(doc.text, a, a + anchor.quote.length, anchor) ||
      Math.abs(a - anchor.start) - Math.abs(b - anchor.start),
  );
  if (matches.length)
    return result(matches[0], matches[0] + anchor.quote.length, "moved");
  const fuzzy = fuzzyRange(doc.text, anchor);
  if (fuzzy) return result(fuzzy.start, fuzzy.end, "moved");
  return {
    state: "orphaned",
    quote: anchor.quote,
    start: null,
    end: null,
    line: null,
  };
}
export function commentMentions(body: string): { id: string; name: string }[] {
  const mentions = [
    ...body.matchAll(/@\[([^\]\n]+)\]\(thread:(thr_[a-zA-Z0-9_-]+)\)/g),
  ].map((match) => ({ name: match[1], id: match[2] }));
  return mentions.filter(
    (item, i) => mentions.findIndex((other) => other.id === item.id) === i,
  );
}
