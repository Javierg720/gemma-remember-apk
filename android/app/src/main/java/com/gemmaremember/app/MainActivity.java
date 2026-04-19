package com.gemmaremember.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
    }
}
