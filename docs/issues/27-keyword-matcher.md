# 27: Core whole-word keyword matcher

**Iteration:** 4 (Subjects)

## Description
Detection step 3, which costs no tokens: match the prompt against each subject's keywords as **whole words**, case-insensitive. The subject with the most keyword hits wins, and ties go to config order. Keywords may contain regex special characters (`c++`, `.net`), so boundaries are defined explicitly (not `\b`), so that `api` doesn't match `capital` but `tsx` matches `file.tsx`.

## Tests to write first
- `matches 'React' case-insensitively for keyword react`
- `does not match 'api' inside 'capital'`
- `matches 'tsx' in 'file.tsx'`
- `matches 'api' next to punctuation: '(api)', 'api?', 'api,'`
- `escapes regex characters in keywords such as 'c++' and '.net'`
- `matches multi-word keywords like 'design system'`
- `most hits wins`
- `tie is broken by subject order in the config`
- `returns undefined when nothing matches`
- `ignores subjects with no keywords`

## Implementation tasks
- [ ] `src/core/subjects/matchKeywords.ts`
- [ ] Precompile matchers once per config change

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#26

## Labels
`feature`

## Estimate
S
