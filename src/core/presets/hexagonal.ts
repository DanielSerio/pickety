import type { PicketyConfig } from "../../shared/types";

export const hexagonalPreset: PicketyConfig = {
  modules: {
    domain: "src/domain/**",
    application: "src/application/**",
    ports: "src/ports/**",
    adapters: "src/adapters/**",
    infrastructure: "src/infrastructure/**",
  },
  rules: {
    "module-boundaries": {
      severity: "error",
      rules: [
        {
          importer: "domain",
          imports: ["application", "ports", "adapters", "infrastructure"],
          allow: false,
          message: "Domain should not depend on outer layers.",
        },
        {
          importer: "application",
          imports: ["adapters", "infrastructure"],
          allow: false,
          message: "Application should not depend on adapters or infrastructure.",
        },
        {
          importer: "ports",
          imports: ["adapters", "infrastructure"],
          allow: false,
          message: "Ports should remain independent of adapters and infrastructure.",
        },
        {
          importer: "adapters",
          imports: "infrastructure",
          allow: false,
          message: "Adapters should not depend on infrastructure.",
        },
      ],
    },
  },
};
