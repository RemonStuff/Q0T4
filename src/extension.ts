// Composition root: wires adapters to the core. Nothing to wire yet (#7, #11).

/**
 * Hooks for integration tests. VS Code has no API to invoke a chat
 * participant, so tests call the handler through these exports. The public
 * API for other extensions (#63) will sit next to `test`, not inside it.
 */
export interface Q0T4TestHooks {
  handleRequest(): Promise<never>;
}

export interface Q0T4Exports {
  readonly test: Q0T4TestHooks;
}

export function activate(): Q0T4Exports {
  return {
    test: {
      handleRequest: () => Promise.reject(new Error("@q0t4 isn't wired up yet (#11).")),
    },
  };
}

export function deactivate(): void {}
