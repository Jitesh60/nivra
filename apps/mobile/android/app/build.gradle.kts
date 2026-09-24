import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Upload key for Play (never committed): android/key.properties with
// storeFile, storePassword, keyAlias, keyPassword. See docs/RELEASE.md.
val keystoreProperties =
    Properties().apply {
        val file = rootProject.file("key.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
val hasUploadKey = !keystoreProperties.isEmpty

android {
    namespace = "com.sajha.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.sajha.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // The flavours name the app with resValue, which AGP 9 turns off by default.
    buildFeatures {
        resValues = true
    }

    // One install per environment: `flutter run --flavor dev --dart-define-from-file=config/dev.json`
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Sajha Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "Sajha Staging")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "Sajha")
        }
    }

    signingConfigs {
        if (hasUploadKey) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // The upload key when it's there; the debug key otherwise, so
            // `flutter run --release` still works (prod bundles refuse it below).
            signingConfig = signingConfigs.getByName(if (hasUploadKey) "release" else "debug")
            // R8 (on for release builds) shrinks and obfuscates; keep what plugins need.
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// A prod release for the store must be signed with the upload key.
gradle.taskGraph.whenReady {
    val prodRelease =
        allTasks.any { t ->
            (t.name.startsWith("bundle") || t.name.startsWith("assemble")) &&
                t.name.endsWith("ProdRelease")
        }
    if (prodRelease && !hasUploadKey) {
        throw GradleException(
            "Prod release builds need android/key.properties (the Play upload key). See docs/RELEASE.md.",
        )
    }
}
