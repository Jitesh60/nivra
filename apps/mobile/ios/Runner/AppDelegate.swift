import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var secureChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // Shared-document viewer: iOS can't block screenshots, so the app blurs
    // the document while the screen is recorded or mirrored.
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SajhaSecureScreen")
    else { return }
    let channel = FlutterMethodChannel(
      name: "sajha/secure", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "setSecure":
        result(nil)
      case "isCaptured":
        result(UIScreen.main.isCaptured)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    secureChannel = channel
    NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.secureChannel?.invokeMethod("captureChanged", arguments: UIScreen.main.isCaptured)
    }
  }
}
