package com.kilssengkyu.brainrush;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import com.getcapacitor.BridgeActivity;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.getcapacitor.community.admob.AdMob.class);
        registerPlugin(ee.forgr.nativepurchases.NativePurchasesPlugin.class);
        super.onCreate(savedInstanceState);

        // Let Android apply system window insets so content doesn't overlap status bar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // Hide the navigation bar for a fullscreen experience.
        hideNavigationBar();

        Log.e("BrainRush", ">>> MainActivity onCreate called <<<");
        if (getIntent() != null) {
            Log.e("BrainRush", ">>> Initial Intent Data: " + getIntent().getDataString());
        } else {
            Log.e("BrainRush", ">>> Initial Intent is NULL");
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideNavigationBar();
        }
    }

    private void hideNavigationBar() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(),
                getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
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
