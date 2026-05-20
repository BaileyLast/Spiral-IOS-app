export interface Country {
  code: string;
  name: string;
  currency: string;
  locale: string;
}

export const COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina", currency: "ARS", locale: "es-AR" },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU" },
  { code: "AT", name: "Austria", currency: "EUR", locale: "de-AT" },
  { code: "BE", name: "Belgium", currency: "EUR", locale: "nl-BE" },
  { code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR" },
  { code: "BG", name: "Bulgaria", currency: "BGN", locale: "bg-BG" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA" },
  { code: "CL", name: "Chile", currency: "CLP", locale: "es-CL" },
  { code: "CN", name: "China", currency: "CNY", locale: "zh-CN" },
  { code: "CO", name: "Colombia", currency: "COP", locale: "es-CO" },
  { code: "HR", name: "Croatia", currency: "EUR", locale: "hr-HR" },
  { code: "CY", name: "Cyprus", currency: "EUR", locale: "el-CY" },
  { code: "CZ", name: "Czech Republic", currency: "CZK", locale: "cs-CZ" },
  { code: "DK", name: "Denmark", currency: "DKK", locale: "da-DK" },
  { code: "EG", name: "Egypt", currency: "EGP", locale: "ar-EG" },
  { code: "EE", name: "Estonia", currency: "EUR", locale: "et-EE" },
  { code: "FI", name: "Finland", currency: "EUR", locale: "fi-FI" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE" },
  { code: "GR", name: "Greece", currency: "EUR", locale: "el-GR" },
  { code: "HK", name: "Hong Kong", currency: "HKD", locale: "en-HK" },
  { code: "HU", name: "Hungary", currency: "HUF", locale: "hu-HU" },
  { code: "IS", name: "Iceland", currency: "ISK", locale: "is-IS" },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN" },
  { code: "ID", name: "Indonesia", currency: "IDR", locale: "id-ID" },
  { code: "IE", name: "Ireland", currency: "EUR", locale: "en-IE" },
  { code: "IL", name: "Israel", currency: "ILS", locale: "he-IL" },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT" },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP" },
  { code: "LV", name: "Latvia", currency: "EUR", locale: "lv-LV" },
  { code: "LT", name: "Lithuania", currency: "EUR", locale: "lt-LT" },
  { code: "LU", name: "Luxembourg", currency: "EUR", locale: "fr-LU" },
  { code: "MY", name: "Malaysia", currency: "MYR", locale: "ms-MY" },
  { code: "MT", name: "Malta", currency: "EUR", locale: "en-MT" },
  { code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX" },
  { code: "NL", name: "Netherlands", currency: "EUR", locale: "nl-NL" },
  { code: "NZ", name: "New Zealand", currency: "NZD", locale: "en-NZ" },
  { code: "NG", name: "Nigeria", currency: "NGN", locale: "en-NG" },
  { code: "NO", name: "Norway", currency: "NOK", locale: "nb-NO" },
  { code: "PE", name: "Peru", currency: "PEN", locale: "es-PE" },
  { code: "PH", name: "Philippines", currency: "PHP", locale: "en-PH" },
  { code: "PL", name: "Poland", currency: "PLN", locale: "pl-PL" },
  { code: "PT", name: "Portugal", currency: "EUR", locale: "pt-PT" },
  { code: "RO", name: "Romania", currency: "RON", locale: "ro-RO" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", locale: "ar-SA" },
  { code: "RS", name: "Serbia", currency: "RSD", locale: "sr-RS" },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG" },
  { code: "SK", name: "Slovakia", currency: "EUR", locale: "sk-SK" },
  { code: "SI", name: "Slovenia", currency: "EUR", locale: "sl-SI" },
  { code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA" },
  { code: "KR", name: "South Korea", currency: "KRW", locale: "ko-KR" },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES" },
  { code: "SE", name: "Sweden", currency: "SEK", locale: "sv-SE" },
  { code: "CH", name: "Switzerland", currency: "CHF", locale: "de-CH" },
  { code: "TW", name: "Taiwan", currency: "TWD", locale: "zh-TW" },
  { code: "TH", name: "Thailand", currency: "THB", locale: "th-TH" },
  { code: "TR", name: "Turkey", currency: "TRY", locale: "tr-TR" },
  { code: "UA", name: "Ukraine", currency: "UAH", locale: "uk-UA" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE" },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB" },
  { code: "US", name: "United States", currency: "USD", locale: "en-US" },
  { code: "VN", name: "Vietnam", currency: "VND", locale: "vi-VN" },
];

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";

export function formatCurrency(amount: number, countryCode: string | null | undefined): string {
  const country = getCountryByCode(countryCode);
  const currency = country?.currency || DEFAULT_CURRENCY;
  const locale = country?.locale || DEFAULT_LOCALE;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return COUNTRY_BY_CODE.get(code.toUpperCase());
}

const LOCALE_REGION_RE = /[-_]([A-Z]{2})\b/i;

// Best-effort IANA timezone → ISO-3166 alpha-2 mapping, covering the cities in
// the COUNTRIES list above. Used only as a fallback when navigator.language
// has no region tag (common on iOS / some Android locales).
const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "America/Argentina/Buenos_Aires": "AR",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Australia/Adelaide": "AU",
  "Europe/Vienna": "AT",
  "Europe/Brussels": "BE",
  "America/Sao_Paulo": "BR", "America/Bahia": "BR", "America/Fortaleza": "BR",
  "Europe/Sofia": "BG",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Montreal": "CA", "America/Edmonton": "CA", "America/Halifax": "CA", "America/Winnipeg": "CA",
  "America/Santiago": "CL",
  "Asia/Shanghai": "CN", "Asia/Beijing": "CN",
  "America/Bogota": "CO",
  "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY",
  "Europe/Prague": "CZ",
  "Europe/Copenhagen": "DK",
  "Africa/Cairo": "EG",
  "Europe/Tallinn": "EE",
  "Europe/Helsinki": "FI",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Athens": "GR",
  "Asia/Hong_Kong": "HK",
  "Europe/Budapest": "HU",
  "Atlantic/Reykjavik": "IS",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Asia/Jakarta": "ID",
  "Europe/Dublin": "IE",
  "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL",
  "Europe/Rome": "IT",
  "Asia/Tokyo": "JP",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Luxembourg": "LU",
  "Asia/Kuala_Lumpur": "MY",
  "Europe/Malta": "MT",
  "America/Mexico_City": "MX",
  "Europe/Amsterdam": "NL",
  "Pacific/Auckland": "NZ",
  "Africa/Lagos": "NG",
  "Europe/Oslo": "NO",
  "America/Lima": "PE",
  "Asia/Manila": "PH",
  "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT",
  "Europe/Bucharest": "RO",
  "Asia/Riyadh": "SA",
  "Europe/Belgrade": "RS",
  "Asia/Singapore": "SG",
  "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI",
  "Africa/Johannesburg": "ZA",
  "Asia/Seoul": "KR",
  "Europe/Madrid": "ES",
  "Europe/Stockholm": "SE",
  "Europe/Zurich": "CH",
  "Asia/Taipei": "TW",
  "Asia/Bangkok": "TH",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA", "Europe/Kiev": "UA",
  "Asia/Dubai": "AE",
  "Europe/London": "GB",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "Asia/Ho_Chi_Minh": "VN", "Asia/Saigon": "VN",
};

export function detectCountryFromLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
  if (navigator.language) candidates.push(navigator.language);
  for (const lang of candidates) {
    const m = lang.match(LOCALE_REGION_RE);
    if (m) {
      const code = m[1].toUpperCase();
      if (COUNTRY_BY_CODE.has(code)) return code;
    }
  }
  // Fallback: derive country from device timezone.
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TIMEZONE_TO_COUNTRY[tz]) {
        const code = TIMEZONE_TO_COUNTRY[tz];
        if (COUNTRY_BY_CODE.has(code)) return code;
      }
    }
  } catch {
    // Intl not available; ignore.
  }
  return null;
}
