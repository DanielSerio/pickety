// Extracts $variable names from a pattern string (e.g., "$route-name" from "routes/$route-name/*")
export function findVariables(pattern: string): string[] {
  const matches = pattern.match(/\$[\w-]+/g);
  return matches || [];
}

// Collects unique $variables across multiple patterns.
export function collectVariables(patterns: string[]): string[] {
  const vars = new Set<string>();
  for (const pattern of patterns) {
    for (const v of findVariables(pattern)) {
      vars.add(v);
    }
  }
  return [...vars];
}

// Matches a glob pattern with $variables against a file path using segment-based
// matching. Avoids regex with multiple .* quantifiers to prevent ReDoS.
// Returns captured variable values, or undefined if no match.
export function captureVariablesFromPath(
  pattern: string,
  relativePath: string,
  variables: string[]
): Record<string, string> | undefined {
  // Split pattern and path into segments for iterative matching
  const patternSegments = pattern.split("/");
  const pathSegments = relativePath.split("/");

  // Try matching at every possible starting offset in the path
  // (pattern "routes/$name" should match "src/routes/auth/index.ts")
  // ** can match zero segments, so only count non-** segments toward the minimum
  const minStart = 0;
  const nonStarCount = patternSegments.filter((s) => s !== "**").length;
  const maxStart = pathSegments.length - nonStarCount;

  for (let start = minStart; start <= maxStart; start++) {
    const captured = tryMatchSegments(patternSegments, pathSegments, start, variables);
    if (captured) {
      return captured;
    }
  }

  return undefined;
}

// Attempts to match pattern segments against path segments starting at a given offset.
// Returns captured variables on success, undefined on failure.
export function tryMatchSegments(
  patternSegments: string[],
  pathSegments: string[],
  startOffset: number,
  variables: string[]
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  let pathIdx = startOffset;

  for (let i = 0; i < patternSegments.length; i++) {
    const seg = patternSegments[i];

    if (seg === "**") {
      // ** matches zero or more segments. Try each possible endpoint.
      const remaining = patternSegments.slice(i + 1);
      if (remaining.length === 0) {
        // ** at end matches everything remaining
        return result;
      }
      // Try matching the rest of the pattern at every remaining position
      for (let skip = pathIdx; skip <= pathSegments.length - remaining.length; skip++) {
        const subResult = tryMatchSegments(remaining, pathSegments, skip, variables);
        if (subResult) {
          return { ...result, ...subResult };
        }
      }
      return undefined;
    }

    if (pathIdx >= pathSegments.length) {
      return undefined;
    }

    // Build a regex for this single segment (no .* — only [^/]+ and [^/]*)
    let segRegex = seg;
    const varOrder: string[] = [];

    // Replace $variables with placeholders
    for (const v of variables) {
      if (segRegex.includes(v)) {
        segRegex = segRegex.replace(v, `__VAR_${varOrder.length}__`);
        varOrder.push(v);
      }
    }

    // Escape regex special chars, preserving * for glob conversion
    segRegex = segRegex.replace(/[.+?^{}()|[\]\\]/g, "\\$&");
    // Single * matches any non-slash characters within one segment
    segRegex = segRegex.replace(/\*/g, "[^/]*");

    // Replace placeholders with capture groups
    for (let j = 0; j < varOrder.length; j++) {
      segRegex = segRegex.replace(`__VAR_${j}__`, "([^/]+)");
    }

    const match = pathSegments[pathIdx].match(new RegExp(`^${segRegex}$`));
    if (!match) {
      return undefined;
    }

    // Collect captured variables from this segment
    for (let j = 0; j < varOrder.length; j++) {
      result[varOrder[j]] = match[j + 1];
    }

    pathIdx++;
  }

  return result;
}

// Replaces $variables in a pattern with concrete values.
// If `values` is a string, all variables are replaced with that string (used for general patterns).
// If `values` is a record, each variable is replaced with its captured value.
export function replaceVariables(
  pattern: string,
  variables: string[],
  values: string | Record<string, string>
): string {
  let result = pattern;
  for (const v of variables) {
    const replacement = typeof values === "string" ? values : values[v];
    // Use global replace to handle multiple occurrences of the same variable
    const escapedV = v.replace(/\$/g, "\\$");
    result = result.replace(new RegExp(escapedV, "g"), replacement);
  }
  return result;
}
