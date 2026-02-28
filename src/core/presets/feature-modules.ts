import type { PicketyConfig } from "../../shared/types";

export const featureModulesPreset: PicketyConfig = {
  modules: {
    app: "src/app/**",
    features: "src/features/**",
    shared: "src/shared/**",
  },
  rules: {
    "module-boundaries": {
      severity: "error",
      rules: [
        {
          importer: "shared",
          imports: ["app", "features"],
          allow: false,
          message: "Shared code should stay independent of app and feature modules.",
        },
        {
          importer: "features",
          imports: "app",
          allow: false,
          message: "Feature modules should not depend on the app layer.",
        },
      ],
    },
  },
};
