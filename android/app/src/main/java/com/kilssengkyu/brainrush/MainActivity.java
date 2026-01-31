package com.kilssengkyu.brainrush;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override

    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.getcapacitor.community.admob.AdMob.class);
        registerPlugin(ee.forgr.nativepurchases.NativePurchasesPlugin.class);
        super.onCreate(savedInstanceState);
        Log.e("BrainRush", ">>> MainActivity onCreate called <<<");
        if (getIntent() != null) {
            Log.e("BrainRush", ">>> Initial Intent Data: " + getIntent().getDataString());
        } else {
            Log.e("BrainRush", ">>> Initial Intent is NULL");
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Log.e("BrainRush", ">>> MainActivity onNewIntent called <<<");
        if (intent != null && intent.getDataString() != null) {
            String url = intent.getDataString();
            Log.e("BrainRush", ">>> New Intent Data: " + url);

            // Forcefully send URL to WebView to bypass potential Capacitor listener issues
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('customDeepLink', { detail: '" + url + "' }))",
                            null);
                });
            }
        } else {
            Log.e("BrainRush", ">>> New Intent is NULL");
        }
    }
}
