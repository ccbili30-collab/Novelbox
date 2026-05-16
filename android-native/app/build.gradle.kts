plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.qinglan.chatnovel"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.qinglan.chatnovel.native"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-native"
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
        getByName("release") {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
            all {
                it.systemProperty("robolectric.graphicsMode", "NATIVE")
            }
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.02.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // Compose UI + Material 3
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Activity + Lifecycle + ViewModel
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // DataStore for prefs / theme seed
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Serialization (for chat messages + API I/O)
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")

    // Splash + core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.core:core-splashscreen:1.0.1")

    // Unit tests
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")

    // Robolectric — runs Android framework + Compose on the JVM so
    // CI / sandbox without a KVM-accelerated emulator can still drive
    // semantic-tree UI tests.
    testImplementation("org.robolectric:robolectric:4.11.1")
    testImplementation("androidx.test.ext:junit:1.1.5")
    testImplementation("androidx.test:core:1.5.0")
    testImplementation("androidx.test:runner:1.5.2")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
