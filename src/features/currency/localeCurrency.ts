import { PRIMARY_CURRENCY, readStoredCurrencyPreference, writeCurrencyPreference, type SelectedCurrency } from './currency.ts';

// B2.7 automatic display-currency detection — first-visit initialisation only.
//
// Decision rules (owner-facing contract):
// 1. A stored display preference always wins, including an explicit 'NLE':
//    manual selections and the stored result of an earlier initial decision
//    both count, and a manual selection rewrites the stored value so it can
//    never be overridden later.
// 2. Without any stored value, the browser's own locale REGION subtags choose
//    once: SL->NLE, GN->GNF, GH->GHS, NG->NGN, US->USD. Language alone never
//    guesses a currency; unsupported or unknown regions fall back to NLE.
// 3. The initial decision is persisted immediately, so it does not flip on
//    later visits, browser-language changes or provider remounts.
//
// Privacy: no IP lookup, no third-party geolocation API, no fingerprinting.
// Only the Intl preferences the browser already exposes (navigator.languages
// and navigator.language) are read once at startup. NLE remains the
// authoritative commerce currency; foreign selections render clearly labeled
// informational estimates only.

/**
 * Region subtag -> display currency for the currently supported set.
 * Extend deliberately with researched pairs; unsupported regions fall back
 * to NLE rather than guessing.
 */
export const REGION_DISPLAY_CURRENCY: Readonly<Record<string, SelectedCurrency>> = {
  SL: 'NLE', // Sierra Leone — the authoritative commerce currency itself
  GN: 'GNF', // Guinea
  GH: 'GHS', // Ghana
  NG: 'NGN', // Nigeria
  US: 'USD', // United States
};

/** The minimal Intl preferences the browser already exposes. */
export interface BrowserLocales {
  languages: readonly string[];
  language: string | undefined;
}

export function browserLocales(): BrowserLocales {
  try {
    const nav = (globalThis as unknown as { navigator?: { languages?: unknown; language?: unknown } }).navigator;
    const languages = Array.isArray(nav?.languages)
      ? nav.languages.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const language = typeof nav?.language === 'string' ? nav.language : undefined;
    return { languages, language };
  } catch {
    return { languages: [], language: undefined };
  }
}

/**
 * Ordered scan over BCP-47-like tags. The first tag whose REGION subtag maps
 * to a supported display currency wins. A valid but unsupported region (for
 * example FR/GB/419) contributes nothing and the scan continues, because
 * region tags are explicit declarations rather than guesses. Tags without a
 * region, malformed tags and 'und' never decide anything.
 *
 * Every tag is validated as a complete locale before any region subtag is
 * read, so tags that cut off mid-extension, repeat a region or script, or
 * carry characters outside BCP-47 can no longer contribute a region from
 * their leading subtags.
 */
export function detectCurrencyForLocales(tags: readonly unknown[]): SelectedCurrency | null {
  for (const tag of tags) {
    const region = regionSubtag(tag);
    if (!region) continue;
    const mapped = REGION_DISPLAY_CURRENCY[region];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Full hierarchy: navigator.languages in preference order, then the fall-back
 * single primary locale. Nothing supported found -> NLE.
 */
export function currencyForBrowser(locales: BrowserLocales | undefined): SelectedCurrency {
  if (!locales) return PRIMARY_CURRENCY;
  const detected = detectCurrencyForLocales([...locales.languages, ...(locales.language ? [locales.language] : [])]);
  return detected ?? PRIMARY_CURRENCY;
}

/**
 * Initial display currency for a fresh render: the stored preference when one
 * exists, otherwise detect once from browser locales and persist the decision.
 * Safe to repeat (StrictMode double initialisation is idempotent) and it never
 * issues a network request; rate loading stays in CurrencyProvider.
 */
export function initialCurrencyPreference(): SelectedCurrency {
  const stored = readStoredCurrencyPreference();
  if (stored) return stored;
  const detected = currencyForBrowser(browserLocales());
  writeCurrencyPreference(detected);
  return detected;
}

/**
 * Region-only extraction from a validated language tag: language [-script]
 * [-region]. Returns the uppercased region subtag, or null when the tag is
 * invalid, carries no region, or is otherwise unresolvable ('und', orphan
 * language or private-use tags, an extension start or malformed structure).
 *
 * Validation happens first on the COMPLETE tag with the standards-based
 * `Intl.getCanonicalLocales` (ICU validated canonicalization), so trailing
 * partial extensions ('en-US-u', 'en-US-x'), repeated region or script
 * subtags ('en-US-NG', 'en-Latn-Latn-US'), stray separators and characters
 * outside BCP-47 ('en-US-!') all reject the whole tag before any region can
 * be read. Only a fully validated canonical tag is then structurally
 * scanned. Underscores are normalized to hyphens first — the deliberate
 * project policy — so 'en_us' and 'en_us_us' behave like their hyphenated
 * forms; regions are still matched case-insensitively.
 */
function regionSubtag(tag: unknown): string | null {
  if (typeof tag !== 'string' || tag.length === 0) return null;
  // Deliberate policy preserved: underscores are the one tolerated non-BCP-47
  // separator; no other malformed input is repaired.
  const normalized = tag.replace(/_/g, '-');
  let canonical: string;
  try {
    [canonical] = Intl.getCanonicalLocales(normalized);
  } catch {
    return null; // malformed, incomplete or duplicated subtags: never decide
  }
  const subtags = canonical.split('-');
  const language = subtags[0] ?? '';
  if (!/^[A-Za-z]{2,3}$/.test(language) && !/^[A-Za-z]{5,8}$/.test(language)) return null;
  if (language.toLowerCase() === 'und') return null;
  for (let i = 1; i < subtags.length; i += 1) {
    const sub = subtags[i];
    if (sub.length === 1) return null; // extension singleton or private-use: no region follows
    if (/^[0-9]{3}$/.test(sub)) return sub; // UN M.49 numeric region
    if (/^[A-Za-z]{4}$/.test(sub)) continue; // script subtag
    if (/^[A-Za-z]{2}$/.test(sub)) return sub.toUpperCase(); // ISO-3166 alpha-2 region
    return null; // variant or malformed structure: a region can no longer follow
  }
  return null;
}
