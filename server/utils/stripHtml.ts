/**
 * stripHtml — sanitize a string that may contain raw HTML/CSS email content.
 *
 * Used to clean the `customerNote` (stored in `managerNote`) field before
 * persisting to the DB (createLead / importLeads) and before returning it to
 * the frontend (getLeads), so that existing dirty records are also fixed
 * without a DB migration.
 *
 * Steps applied in order:
 *  1. Remove <style>…</style> and <script>…</script> blocks entirely
 *  2. Remove all remaining HTML tags
 *  3. Decode common HTML entities (&amp; &lt; &gt; &nbsp; &quot; &#NNN;)
 *  4. Collapse multiple whitespace / newlines into a single space
 *  5. Trim leading / trailing whitespace
 */
export function stripHtml(text: string | null | undefined): string {
  if (!text) return "";

  let clean = text;

  // 1. Remove <style>…</style> blocks
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");

  // 2. Remove <script>…</script> blocks
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");

  // 3. Remove all remaining HTML tags
  clean = clean.replace(/<[^>]*>/g, " ");

  // 4. Decode common HTML entities
  clean = clean
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 5. Collapse whitespace and trim
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}
