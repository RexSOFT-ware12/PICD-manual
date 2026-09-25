export const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** "/data/A%20B/x.dsf#node" -> "node" */
export const fragmentOf = (url?: string | null): string =>
  url && url.includes("#") ? dec(url.slice(url.indexOf("#") + 1)) : "";

/** "/data/A%20B/x.dsf#node" -> "/data/A B/x.dsf" */
export const fileOf = (url?: string | null): string =>
  url ? dec(url.split("#")[0]) : "";

/** "#some%20id" -> "some id" */
export const idRef = (ref?: string | null): string | null =>
  ref ? dec(ref.replace(/^#/, "")) : null;

export const baseName = (path: string): string => {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1];
};

/** Normalises a library path for matching regardless of URL-encoding or OS separators. */
export const normPath = (p: string): string => dec(p).replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
