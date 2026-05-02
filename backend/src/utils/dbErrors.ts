export const isMissingTableError = (error: unknown) => {
  const err = error as { code?: string; message?: string };
  if (err?.code === "42P01") {
    return true;
  }

  return Boolean(err?.message && /relation .* does not exist/i.test(err.message));
};
