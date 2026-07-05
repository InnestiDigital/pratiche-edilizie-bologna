/**
 * Exhaustiveness helper for discriminated-union `switch` statements. Call it in
 * the `default` branch: if a new union member is added without a matching `case`,
 * the argument is no longer of type `never` and the build fails — turning a
 * missed variant into a compile error instead of a silent runtime fall-through.
 *
 * Used by the sweep-strategy dispatch in `sync.ts` (and the category card
 * dispatch in the UI layer). Throws if somehow reached at runtime (a malformed
 * value that bypassed the type system), so it never silently returns.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value (exhaustiveness violated): ${JSON.stringify(x)}`);
}
