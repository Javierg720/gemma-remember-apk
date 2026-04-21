package com.gemmaremember.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int MIC_PERMISSION_REQ = 4242;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            registerPlugin(GemmaPlugin.class);
        } catch (Throwable t) {
            Log.e("GemmaRemember", "GemmaPlugin failed to load: " + t.getMessage());
        }
        try {
            registerPlugin(MemoryPlugin.class);
        } catch (Throwable t) {
            Log.e("GemmaRemember", "MemoryPlugin failed to load: " + t.getMessage());
        }
        super.onCreate(savedInstanceState);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION_REQ);
        }

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
        }
    }
}
