-- App config table for version control and feature flags
CREATE TABLE IF NOT EXISTS app_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Insert default min versions (update these when a forced update is needed)
INSERT INTO app_config (key, value) VALUES
    ('min_ios_version', '0.9.0'),
    ('min_android_version', '0.9.0'),
    ('store_url_ios', ''),
    ('store_url_android', 'https://play.google.com/store/apps/details?id=com.kilssengkyu.brainrush')
ON CONFLICT (key) DO NOTHING;

-- Allow anyone to read app_config (no auth needed for version check)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config"
    ON app_config FOR SELECT
    USING (true);
