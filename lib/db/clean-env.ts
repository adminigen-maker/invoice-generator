/**
 * Strip every character outside printable ASCII (0x21–0x7E) from a config value.
 *
 * Supabase project URLs and API keys are pure ASCII by construction, so this
 * only ever removes invisible corruption — a BOM, non-breaking space, or
 * zero-width character that a copy-paste into a hosting dashboard's env-var
 * field can smuggle in. Such a character, once placed into the `apikey` /
 * `Authorization` request headers, throws:
 *
 *   "Failed to read the 'headers' property from 'RequestInit':
 *    String contains non ISO-8859-1 code point."
 *
 * because HTTP header values must be Latin-1. Sanitizing here makes the app
 * resilient to that class of paste error wherever the bad byte lands.
 */
export function cleanEnv(value: string | undefined | null): string {
  return (value ?? "").replace(/[^\x21-\x7E]/g, "");
}
