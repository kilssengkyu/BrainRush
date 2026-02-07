import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { SignJWT, importPKCS8 } from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { corsHeaders } from '../_shared/cors.ts';

type VerifyRequest = {
  platform: 'ios' | 'android';
  productId: string;
  transactionId: string;
};

type VerifyResult = {
  ok: boolean;
  environment?: 'sandbox' | 'production';
  originalTransactionId?: string;
  storePayload?: Record<string, unknown>;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const base64UrlDecode = (input: string) => {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const decodeJwsPayload = (jws: string) => {
  const parts = jws.split('.');
  if (parts.length < 2) return null;
  const json = base64UrlDecode(parts[1]);
  return JSON.parse(json);
};

const verifyAppleTransaction = async (transactionId: string): Promise<VerifyResult> => {
  const keyId = requireEnv('APPLE_KEY_ID');
  const issuerId = requireEnv('APPLE_ISSUER_ID');
  const bundleId = requireEnv('APPLE_BUNDLE_ID');
  const privateKey = requireEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');

  const key = await importPKCS8(privateKey, 'ES256');
  const token = await new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const endpoints = [
    { env: 'production' as const, url: `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}` },
    { env: 'sandbox' as const, url: `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}` },
  ];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      continue;
    }
    const data = await res.json();
    const signed = data?.signedTransactionInfo as string | undefined;
    const payload = signed ? decodeJwsPayload(signed) : null;
    return {
      ok: true,
      environment: endpoint.env,
      originalTransactionId: payload?.originalTransactionId,
      storePayload: payload ?? data,
    };
  }

  return { ok: false };
};

const verifyGooglePlay = async (packageName: string, productId: string, purchaseToken: string): Promise<VerifyResult> => {
  const serviceAccountJson = JSON.parse(requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY'));
  const clientEmail = serviceAccountJson.client_email as string;
  const privateKey = (serviceAccountJson.private_key as string).replace(/\\n/g, '\n');

  const key = await importPKCS8(privateKey, 'RS256');
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/androidpublisher',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    return { ok: false };
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) return { ok: false };

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false };

  const data = await res.json();
  const purchaseState = data?.purchaseState;
  if (purchaseState !== 0) return { ok: false };

  return {
    ok: true,
    environment: 'production',
    originalTransactionId: data?.orderId,
    storePayload: data,
  };
};

const grantEntitlement = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  productId: string
) => {
  if (productId === 'remove_ads') {
    const { error } = await supabase.rpc('grant_ads_removal', { user_id: userId });
    if (error) throw error;
  } else if (productId === 'pencils_5') {
    const { error } = await supabase.rpc('grant_pencils', { user_id: userId, amount: 5 });
    if (error) throw error;
  } else if (productId === 'pencils_20') {
    const { error } = await supabase.rpc('grant_pencils', { user_id: userId, amount: 20 });
    if (error) throw error;
  } else if (productId === 'pencils_100') {
    const { error } = await supabase.rpc('grant_pencils', { user_id: userId, amount: 100 });
    if (error) throw error;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const body = (await req.json()) as VerifyRequest;
    const { platform, productId, transactionId } = body ?? {};
    if (!platform || !productId || !transactionId) {
      return jsonResponse(400, { error: 'Missing required fields' });
    }

    let result: VerifyResult = { ok: false };
    if (platform === 'ios') {
      result = await verifyAppleTransaction(transactionId);
    } else if (platform === 'android') {
      const packageName = requireEnv('GOOGLE_PLAY_PACKAGE_NAME');
      result = await verifyGooglePlay(packageName, productId, transactionId);
    } else {
      return jsonResponse(400, { error: 'Invalid platform' });
    }

    if (!result.ok) {
      return jsonResponse(400, { error: 'Verification failed' });
    }

    const { data: recorded, error: recordError } = await supabase.rpc('record_purchase', {
      user_id: user.id,
      product_id: productId,
      platform,
      transaction_id: transactionId,
    });
    if (recordError) throw recordError;

    if (recorded) {
      const { error: updateError } = await supabase
        .from('purchase_transactions')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
          store_environment: result.environment,
          original_transaction_id: result.originalTransactionId ?? null,
          store_payload: result.storePayload ?? null,
        })
        .eq('user_id', user.id)
        .eq('platform', platform)
        .eq('transaction_id', transactionId);
      if (updateError) throw updateError;

      await grantEntitlement(supabase, user.id, productId);
    }

    return jsonResponse(200, { ok: true, duplicate: !recorded });
  } catch (err) {
    return jsonResponse(500, { error: 'Server error', detail: String(err?.message ?? err) });
  }
});
