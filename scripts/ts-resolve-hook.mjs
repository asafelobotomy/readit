/** Resolve TypeScript `.js` import specifiers to sibling `.ts` files for Node strip-types. */
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  ) {
    if (specifier.endsWith(".js")) {
      const asTs = specifier.slice(0, -3) + ".ts";
      try {
        return await nextResolve(asTs, context);
      } catch {
        /* fall through */
      }
    }
  }
  if (specifier.startsWith("@readit/")) {
    const map = {
      "@readit/schema": new URL("../packages/schema/src/index.ts", import.meta.url)
        .href,
      "@readit/css-engine": new URL(
        "../packages/css-engine/src/index.ts",
        import.meta.url,
      ).href,
      "@readit/features": new URL(
        "../packages/features/src/index.ts",
        import.meta.url,
      ).href,
    };
    const target = map[specifier];
    if (target) return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
