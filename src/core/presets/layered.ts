import type { PicketyConfig } from "../../shared/types";

export const layeredPreset: PicketyConfig = {
  modules: {
    presentation: "src/presentation/**",
    application: "src/application/**",
    domain: "src/domain/**",
    infrastructure: "src/infrastructure/**",
  },
  rules: {
    "module-boundaries": {
      severity: "error",
      rules: [
        {
          importer: "domain",
          imports: ["application", "presentation", "infrastructure"],
          allow: false,
          message: "Domain should not depend on outer layers.",
        },
        {
          importer: "application",
          imports: ["presentation", "infrastructure"],
          allow: false,
          message: "Application should not depend on presentation or infrastructure.",
        },
        {
          importer: "presentation",
          imports: "infrastructure",
          allow: false,
          message: "Presentation should not depend directly on infrastructure.",
        },
      ],
    },
  },
};
