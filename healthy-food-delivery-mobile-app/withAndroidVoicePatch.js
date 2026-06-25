const {
  withAndroidManifest,
  withAppBuildGradle,
} = require("@expo/config-plugins");

// 1. Исправление Манифеста
function withAndroidManifestPatch(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!androidManifest.manifest.$["xmlns:tools"]) {
      androidManifest.manifest.$["xmlns:tools"] =
        "http://schemas.android.com/tools";
    }

    mainApplication.$["android:appComponentFactory"] =
      "androidx.core.app.CoreComponentFactory";
    mainApplication.$["tools:replace"] = "android:appComponentFactory";

    return config;
  });
}

// 2. Полное блокирование ВСЕЙ устаревшей группы com.android.support
function withAndroidGradlePatch(config) {
  return withAppBuildGradle(config, async (config) => {
    let buildGradle = config.modResults.contents;

    const patch = `
configurations.all {
    exclude group: 'com.android.support'
}
`;
    // Заменяем точечные исключения на одно глобальное
    if (!buildGradle.includes("exclude group: 'com.android.support'")) {
      buildGradle += patch;
    }

    config.modResults.contents = buildGradle;
    return config;
  });
}

module.exports = function withAndroidVoicePatch(config) {
  config = withAndroidManifestPatch(config);
  config = withAndroidGradlePatch(config);
  return config;
};
