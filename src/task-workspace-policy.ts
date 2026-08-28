import path from 'node:path';

export const TASK_EXCLUDED_DIRECTORY_NAMES = Object.freeze([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.svn',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'venv',
] as const);

const EXCLUDED_NAMES = new Set<string>(TASK_EXCLUDED_DIRECTORY_NAMES);

export function taskPathHasExcludedDirectory(
  workspaceRoot: string,
  candidate: string,
): boolean {
  const relative = path.relative(workspaceRoot, path.resolve(workspaceRoot, candidate));
  if (!relative) return false;
  const segments = relative.split(path.sep);
  return segments.some(segment => EXCLUDED_NAMES.has(segment.toLowerCase()));
}

export function isPathContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
