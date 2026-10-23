export interface DestinationParts {
  stem: string;
  extension: string;
  folder: string | null;
}

const DRIVE = /^[A-Za-z]:$/;
const DOTENV_SUFFIX = /\.env(\.[^.]+)?$/;

function lastSeparator(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

export function splitDestination(path: string): DestinationParts {
  const separator = lastSeparator(path);
  const name = path.slice(separator + 1);
  if (!name) return { stem: path, extension: "", folder: null };
  const dotenv = DOTENV_SUFFIX.exec(name);
  const dot = dotenv && dotenv.index > 0 ? dotenv.index : name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  if (separator < 0) return { stem, extension, folder: null };
  const folder = path.slice(0, separator) || path.slice(0, 1);
  return {
    stem,
    extension,
    folder: DRIVE.test(folder) ? `${folder}${path[separator]}` : folder,
  };
}
