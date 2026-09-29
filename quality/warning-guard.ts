interface WarningSource {
  on(event: "warning", listener: (warning: Error) => void): unknown;
  off(event: "warning", listener: (warning: Error) => void): unknown;
}

export function installWarningGuard(
  source: WarningSource,
  registerFinalizer: (finalize: () => Promise<void>) => void,
  settle: () => Promise<unknown>,
): void {
  const reject = (warning: Error): never => {
    throw warning;
  };
  source.on("warning", reject);
  try {
    registerFinalizer(async () => {
      try {
        await settle();
      } finally {
        source.off("warning", reject);
      }
    });
  } catch (error) {
    source.off("warning", reject);
    throw error;
  }
}
