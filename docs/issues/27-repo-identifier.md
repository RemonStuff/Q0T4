# 27: Core repo identifier from git remotes

**Iteration:** 4 (Repo subjects)

## Description
The subject is the repo being worked on. Given what `WorkspacePort` reports (folder name plus git remotes, see #30), pure core derives a stable identifier that's the same on every machine and every clone:
1. The `origin` remote, normalised to `owner/repo`
2. Otherwise the first remote, normalised
3. Otherwise the folder name
4. Nothing open → `undefined`, so the pipeline uses `fallbackSubject`

Normalisation handles HTTPS, SSH (`git@host:owner/repo.git`), `ssh://` URLs, a trailing `.git`, credentials in URLs, GitLab subgroups, and Azure DevOps URLs.

## Tests to write first
- `normalises https://github.com/RemonStuff/Q0T4.git to RemonStuff/Q0T4`
- `normalises git@github.com:RemonStuff/Q0T4.git to RemonStuff/Q0T4`
- `normalises ssh://git@github.com/RemonStuff/Q0T4 to RemonStuff/Q0T4`
- `strips credentials: https://user:token@github.com/o/r.git → o/r`
- `keeps GitLab subgroups: https://gitlab.com/group/sub/repo.git → group/sub/repo`
- `normalises Azure DevOps https://dev.azure.com/org/project/_git/repo → org/project/repo`
- `normalises Azure DevOps SSH git@ssh.dev.azure.com:v3/org/project/repo → org/project/repo`
- `trailing slashes and whitespace are ignored`
- `an unparseable URL falls back to the folder name`
- `prefers origin over other remotes`
- `uses the first remote when there is no origin`
- `uses the folder name when there are no remotes`
- `returns undefined when no folder is open`
- `never includes the host name, so the same repo on two machines matches`

## Implementation tasks
- [ ] `src/core/subjects/repoIdentifier.ts`: `normaliseRemote(url)`, `repoSubject(info)`
- [ ] Use a URL table for the tests (`it.each`)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#26

## Labels
`feature`

## Estimate
S
