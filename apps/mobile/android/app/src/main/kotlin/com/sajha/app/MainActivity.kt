package com.sajha.app

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Screens showing someone else's document turn on FLAG_SECURE:
        // screenshots, recordings and the recent-apps preview show black.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sajha/secure")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "setSecure" -> {
                        if (call.arguments == true) {
                            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        } else {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                        result.success(null)
                    }
                    // Android blocks capture outright, so there's nothing to report.
                    "isCaptured" -> result.success(false)
                    else -> result.notImplemented()
                }
            }
    }
}
