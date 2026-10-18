# 30: Core classifier

**Iteration:** 4 (Subjects)

## Description
Detection step 4. Send a short request to the classifier model: a leading user message listing each subject's name and description (there's no system role), followed by the prompt truncated to ~500 characters. Ask for the subject name only. Count the classifier's input and output tokens and **charge them to the chosen subject**, even if the main request is then refused. The model is the chat's model when `classifierModelFamily` is `""`. Otherwise it's `select({ vendor: "copilot", family })`, falling back to the chat's model if that family isn't found. Any classifier failure falls back to `fallbackSubject`.

## Tests to write first
- `prompt lists every subject with its description`
- `prompt truncates long user prompts to ~500 characters`
- `parses an exact subject name`
- `parses a name wrapped in quotes, backticks or trailing punctuation`
- `parses case-insensitively`
- `an unknown answer falls back to fallbackSubject`
- `a classifier error falls back to fallbackSubject and charges only input tokens if streaming started`
- `stops reading after ~20 output tokens` (guards against a rambling model)
- `charges classifier input + output to the chosen subject`
- `uses the chat model when classifierModelFamily is empty`
- `uses the configured family when available`
- `falls back to the chat model when the configured family is missing`
- `is skipped when only one subject is configured`

## Implementation tasks
- [ ] `src/core/subjects/classifier.ts`: `classify(prompt, subjects, model, signal) → { subject, tokens }`
- [ ] Add the `classifier` tokens field to the recording policy (#16)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#13, #26

## Labels
`feature`

## Estimate
M
