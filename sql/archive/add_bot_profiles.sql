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
    ('bot_a1f3c9d2', 'nightmilo', NULL, 'US', 700),
    ('bot_b7e2d4f9', '엽떡좋아', NULL, 'KR', 735),
    ('bot_c4a8e1b0', 'ねこパン', NULL, 'JP', 770),
    ('bot_d9f1b3c7', 'lunebleue', NULL, 'FR', 805),
    ('bot_e2c7f4a1', 'nachtfuchs', NULL, 'DE', 840),
    ('bot_f6b0d8c3', 'teabreak', NULL, 'GB', 875),
    ('bot_g3d9a6e4', 'maplezone', NULL, 'CA', 910),
    ('bot_h5c2e8f1', 'arvosesh', NULL, 'AU', 945),
    ('bot_i8b4c0d6', 'luazinha', NULL, 'BR', 980),
    ('bot_j0f6a2c8', 'KopiPing', NULL, 'SG', 1015),
    ('bot_k2a7m4q9', 'pixeljun', NULL, 'US', 1050),
    ('bot_l5n8r1t3', '새벽한판', NULL, 'KR', 1085),
    ('bot_m4p6u2w7', 'しずく', NULL, 'JP', 1120),
    ('bot_n8s3x5z1', 'petitpixel', NULL, 'FR', 1155),
    ('bot_o6v9y2b4', 'kekszeit', NULL, 'DE', 1190),
    ('bot_p3c7f1h8', 'softlag', NULL, 'GB', 1225),
    ('bot_q9j4l6n2', 'auroracall', NULL, 'CA', 1260),
    ('bot_r1k5m8p3', 'koalablink', NULL, 'AU', 1295),
    ('bot_s7q2t4v6', 'cafezinho', NULL, 'BR', 1330),
    ('bot_t4w8x1c5', '夜猫子', NULL, 'SG', 1365),
    ('bot_u6r2k9m4', 'queueghost', NULL, 'US', 1400),
    ('bot_v3h7p1x8', '민초단장', NULL, 'KR', 1435),
    ('bot_w8n4c6q2', 'まったり勢', NULL, 'JP', 1470),
    ('bot_x5d1t7z9', 'cafeminuit', NULL, 'FR', 1505),
    ('bot_y2f8l3b6', 'ruhesturm', NULL, 'DE', 1540),
    ('bot_z9m5v2k1', 'cheekychip', NULL, 'GB', 1575),
    ('bot_aa4p7s1d', 'neigeux', NULL, 'CA', 1610),
    ('bot_ab8t2w5f', 'sunnyrespawn', NULL, 'AU', 1645),
    ('bot_ac3x6r9h', 'viradanoite', NULL, 'BR', 1680),
    ('bot_ad7k1n4j', 'makanfirst', NULL, 'SG', 1715),
    ('bot_ae2q5u8l', 'snackstack', NULL, 'US', 1750),
    ('bot_af6w9y3n', '칼퇴요정', NULL, 'KR', 1785),
    ('bot_ag1z4c7p', 'もちうさ', NULL, 'JP', 1820),
    ('bot_ah5b8f2r', 'eclat', NULL, 'FR', 1855),
    ('bot_ai9d3h6t', 'pixelotto', NULL, 'DE', 1890),
    ('bot_aj4f7j1v', 'rainyqueue', NULL, 'GB', 1925),
    ('bot_ak8h2l5x', 'poutinepls', NULL, 'CA', 1960),
    ('bot_al3j6n9z', 'matechill', NULL, 'AU', 1980),
    ('bot_am7l1p4b', 'dashdoce', NULL, 'BR', 1990),
    ('bot_an2n5r8d', '雨后', NULL, 'SG', 2000)
ON CONFLICT (id) DO NOTHING;
