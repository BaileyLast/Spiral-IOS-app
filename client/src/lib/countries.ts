export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MY", name: "Malaysia" },
  { code: "MT", name: "Malta" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "RS", name: "Serbia" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
];

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
