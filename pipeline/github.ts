// Public repositories only, fetched as an archive with no token. No API call:
// the API's unauthenticated rate limit is 60 an hour per address, codeload's
// archives aren't counted against it, and the archive carries its own commit.

export type Repo = { owner: string; name: string; url: string };

// Owner and repository names as GitHub allows them. Lowercased, because GitHub
// treats them case-insensitively and two spellings of one repository must not
// become two analyses.
const REPO_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z0-9-]+)\/([a-z0-9._-]+?)(?:\.git)?\/?$/i;

/** Throws with a message fit to show whoever pasted the URL. */
export function parseRepoUrl(input: string): Repo {
  const match = REPO_URL.exec(input.trim());
  if (!match || match[2] === "." || match[2] === "..") {
    throw new Error(`Not a GitHub repository URL: "${input.trim()}". Expected https://github.com/owner/repository.`);
  }
  const owner = match[1].toLowerCase();
  const name = match[2].toLowerCase();
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

// A limit stated rather than an architecture built around it: a repository
// whose archive is larger than this is too large to analyse in a request.
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

/** The gzipped tar of the default branch's head. */
export async function fetchArchive(repo: Repo): Promise<Buffer> {
  const url = `https://codeload.github.com/${repo.owner}/${repo.name}/tar.gz/HEAD`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`Could not reach GitHub: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (response.status === 404) {
    // Codeload answers a private repository exactly like a missing one.
    throw new Error(`${repo.owner}/${repo.name} was not found on GitHub. It doesn't exist, or it is private.`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`GitHub answered ${response.status} ${response.statusText} for ${repo.owner}/${repo.name}.`);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ARCHIVE_BYTES) {
      await reader.cancel();
      throw new Error(
        `${repo.owner}/${repo.name} is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB compressed, which is more than one run can analyse.`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
