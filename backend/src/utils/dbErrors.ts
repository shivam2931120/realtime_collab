export const isMissingTableError = (error: unknown) => {
  const err = error as { code?: string; message?: string };
  if (err?.code === "42P01" || err?.code === "PGRST205") {
    return true;
  }

  return Boolean(
    err?.message &&
      (/relation .* does not exist/i.test(err.message) ||
        /could not find the table/i.test(err.message)),
  );
};

const connectionErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

type ErrorLike = {
  code?: string;
  message?: string;
  cause?: ErrorLike;
};

export const getDatabaseConnectionErrorCode = (error: unknown): string | null => {
  let current = error as ErrorLike | undefined;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code && connectionErrorCodes.has(current.code)) {
      return current.code;
    }

    current = current.cause;
  }

  const message = String((error as ErrorLike | undefined)?.message || "");
  return /fetch failed|network|connect|timed?\s*out|dns/i.test(message) ? "DATABASE_UNREACHABLE" : null;
};

export const isDatabaseUnavailableError = (error: unknown) =>
  Boolean(getDatabaseConnectionErrorCode(error));
