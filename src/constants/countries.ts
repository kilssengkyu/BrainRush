export interface Country {
    code: string;
    name: string;
    emoji: string;
}

const COUNTRY_CODES: string[] = [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
    'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
    'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
    'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
    'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
    'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
    'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
    'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
    'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
    'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
    'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
    'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
    'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
    'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
    'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
];

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const toFlagEmoji = (code: string) =>
    String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)));

const MAJOR_COUNTRY_LABEL_OVERRIDES: Record<string, string> = {
    KR: '대한민국 (South Korea)',
    US: 'United States',
    JP: '日本 (Japan)',
    CN: '中国 (China)',
    TW: '台灣 (Taiwan)',
    HK: '香港 (Hong Kong)',
    SG: 'Singapore',
    TH: 'ประเทศไทย (Thailand)',
    VN: 'Việt Nam (Vietnam)',
    ID: 'Indonesia',
    IN: 'भारत (India)',
    PH: 'Pilipinas (Philippines)',
    MY: 'Malaysia',
    GB: 'United Kingdom',
    DE: 'Deutschland (Germany)',
    FR: 'France (Français)',
    ES: 'España (Spain)',
    IT: 'Italia (Italy)',
    BR: 'Brasil (Brazil)',
    MX: 'México (Mexico)',
    CA: 'Canada',
    AU: 'Australia',
    RU: 'Россия (Russia)',
    TR: 'Türkiye (Turkey)',
    SA: 'السعودية (Saudi Arabia)',
    AE: 'الإمارات (UAE)',
};

export const COUNTRIES: Country[] = COUNTRY_CODES.map((code) => ({
    code,
    name: MAJOR_COUNTRY_LABEL_OVERRIDES[code] ?? regionNames?.of(code) ?? code,
    emoji: toFlagEmoji(code),
}));
