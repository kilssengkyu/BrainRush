export interface Country {
    code: string;
    name: string; // Display Name (Korean preferred as per user request context, or English/Korean mixed)
    emoji: string;
}

export const COUNTRIES: Country[] = [
    { code: 'KR', name: 'South Korea (대한민국)', emoji: '🇰🇷' },
    { code: 'US', name: 'United States', emoji: '🇺🇸' },
    { code: 'JP', name: 'Japan (日本)', emoji: '🇯🇵' },
    { code: 'CN', name: 'China (中国)', emoji: '🇨🇳' },
    { code: 'VN', name: 'Vietnam', emoji: '🇻🇳' },
    { code: 'TH', name: 'Thailand', emoji: '🇹🇭' },
    { code: 'ID', name: 'Indonesia', emoji: '🇮🇩' },
    { code: 'IN', name: 'India', emoji: '🇮🇳' },
    { code: 'GB', name: 'United Kingdom', emoji: '🇬🇧' },
    { code: 'DE', name: 'Germany', emoji: '🇩🇪' },
    { code: 'FR', name: 'France', emoji: '🇫🇷' },
    { code: 'IT', name: 'Italy', emoji: '🇮🇹' },
    { code: 'ES', name: 'Spain', emoji: '🇪🇸' },
    { code: 'RU', name: 'Russia', emoji: '🇷🇺' },
    { code: 'BR', name: 'Brazil', emoji: '🇧🇷' },
    { code: 'CA', name: 'Canada', emoji: '🇨🇦' },
    { code: 'AU', name: 'Australia', emoji: '🇦🇺' },
    { code: 'TW', name: 'Taiwan', emoji: '🇹🇼' },
    { code: 'HK', name: 'Hong Kong', emoji: '🇭🇰' },
    { code: 'SG', name: 'Singapore', emoji: '🇸🇬' },
    { code: 'MY', name: 'Malaysia', emoji: '🇲🇾' },
    { code: 'PH', name: 'Philippines', emoji: '🇵🇭' },
    { code: 'TR', name: 'Turkey', emoji: '🇹🇷' },
    { code: 'SA', name: 'Saudi Arabia', emoji: '🇸🇦' },
    { code: 'AE', name: 'United Arab Emirates', emoji: '🇦🇪' },
    { code: 'ZA', name: 'South Africa', emoji: '🇿🇦' },
    { code: 'EG', name: 'Egypt', emoji: '🇪🇬' },
    { code: 'AR', name: 'Argentina', emoji: '🇦🇷' },
    { code: 'MX', name: 'Mexico', emoji: '🇲🇽' },
    { code: 'NL', name: 'Netherlands', emoji: '🇳🇱' },
    { code: 'SE', name: 'Sweden', emoji: '🇸🇪' },
    { code: 'CH', name: 'Switzerland', emoji: '🇨🇭' },
    { code: 'PL', name: 'Poland', emoji: '🇵🇱' },
    { code: 'UA', name: 'Ukraine', emoji: '🇺🇦' },
];
