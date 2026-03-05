-- Bot profiles for matchmaking (public read)
CREATE TABLE IF NOT EXISTS public.bot_profiles (
    id text primary key,
    nickname text not null,
    avatar_url text,
    country text,
    mmr int default 1000,
    created_at timestamptz default now()
);

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public bot profiles are viewable by everyone" ON public.bot_profiles;
CREATE POLICY "Public bot profiles are viewable by everyone" ON public.bot_profiles
    FOR SELECT USING (true);

-- Seed a small pool of believable bot profiles (id is internal)
INSERT INTO public.bot_profiles (id, nickname, avatar_url, country, mmr)
VALUES
    ('bot_a1f3c9d2', 'Player_4821', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Ivy', 'US', 980),
    ('bot_b7e2d4f9', 'Player_1934', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Noah', 'KR', 1020),
    ('bot_c4a8e1b0', 'Player_7750', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Jade', 'JP', 995),
    ('bot_d9f1b3c7', 'Player_2048', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Milo', 'FR', 1015),
    ('bot_e2c7f4a1', 'Player_5603', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Rin', 'DE', 970),
    ('bot_f6b0d8c3', 'Player_8472', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Luna', 'GB', 990),
    ('bot_g3d9a6e4', 'Player_3310', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Kai', 'CA', 1030),
    ('bot_h5c2e8f1', 'Player_6117', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Zoe', 'AU', 985),
    ('bot_i8b4c0d6', 'Player_9284', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Eli', 'BR', 1005),
    ('bot_j0f6a2c8', 'Player_4096', 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Uma', 'SG', 975)
ON CONFLICT (id) DO NOTHING;
