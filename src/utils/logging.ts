const line = (scope: string, message: string): void => {
  process.stdout.write(`[${scope}] ${message}\n`);
};

export const logger = {
  info: line,
  warn: (scope: string, message: string): void => line(scope, `warning: ${message}`),
  error: (scope: string, message: string): void => line(scope, `erro: ${message}`),
};
