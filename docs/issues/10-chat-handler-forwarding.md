# 10: Core `chatHandler`: forward and stream

**Iteration:** 1 (Walking skeleton)

## Description
The orchestrator for a single chat request, written entirely against ports: resolve the model (#09), build the messages (#08), call `ModelPort.sendRequest`, stream each chunk to `ChatOutputPort.markdown`, and return a result. It honours the chat's `CancellationSignal`. Selector and model failures become a short, friendly message and an explicit error outcome. Failures to write output propagate, because a broken output cannot reliably show a friendly error. This is the seam that every later feature plugs into.

## Request and result
- `chatHandler(request, deps)` takes `prompt`, readonly `history`, the request `model`, and optional `availability` (`"available"` by default). `Deps` supplies the `selector`, `output` and cancellation `signal`.
- It uses the existing `resolveModel` and `buildMessages`, without changing their behavior.
- The result has JSON-safe `metadata` with `outcome`: `"completed"`, `"cancelled"`, `"noModel"` or `"error"`.
- `metadata.model` is the resolved model's display name once a send is attempted, including failed attempts. It is omitted before a model call, including no-model results and selector failures.
- Do not invent zero token counts or costs. Full versioned `ResultMetadata`, counting and accounting remain in #13, #16 and #18.

## Cancellation and errors
- Already-cancelled requests do not resolve or send a model request. Recheck cancellation after resolution, before reading each chunk and after awaiting it.
- Pass the same signal to `sendRequest`. A model operation already waiting for a response must settle through the adapter's cancellation support (#11); this core issue does not add timeouts or race pending promises.
- Drop chunks returned after cancellation, even if the stream ignores the signal. Attempt `iterator.return()` once for an unfinished stream when provided, including on cancellation, read failure or output failure. Do not close an already completed iterator again.
- Cancellation takes priority over selector, request and stream-closing failures once the signal is observed; it does not show a generic error.
- An empty model list shows `formatNoModel()` and returns `"noModel"`. Selector failures return `"error"`, not `"noModel"`.
- Request, iterator-creation, read and cleanup failures show `formatRequestError()`: "Q0T4 couldn't complete this request. Please try again." Internal error details are not displayed.
- Retain partial replies and separate the error with a blank line only when non-empty reply text was already written.
- Output-writing failures reject unchanged, without trying to write through the broken output again. No retries or detailed `NotFound` handling are added here (#38).
- The visible participant remains the stub until #11 wires the adapters.

## Tests to write first
- `streams every chunk from FakeModel to the output in order`
- `sends the messages produced by buildMessages`
- `stops streaming when the chat cancellation signal fires mid-stream`
- `writes a friendly error and resolves when sendRequest rejects`
- `writes partial output then a friendly error when the stream throws after chunk n`
- `writes the no-model message when no model is available`
- `returns a ChatResult-shaped object with metadata`
- `does not send when cancelled before the request or during model resolution`
- `drops late chunks and closes a stream that ignores cancellation`
- `closes without reading a stream returned after cancellation`
- `distinguishes selector failures from no-model outcomes`
- `names the resolved fallback model in JSON-safe metadata`
- `completes empty replies without errors or invented usage fields`
- `closes unfinished iterators and handles iterator setup, read and cleanup failures`
- `propagates output failures unchanged while closing the active stream`
- `does not select, count tokens or retry when the request model is usable`
- `formatRequestError returns the exact generic retry message`

## Implementation tasks
- [x] `src/core/chatHandler.ts` taking a `Deps` object of ports, with typed request and result interfaces
- [x] A generic error message in `core/errors` (detailed mapping comes in #38)
- [x] Keep the handler a pipeline of named steps; scope model-error catches to model operations so output failures stay explicit

## Acceptance criteria
- [x] The listed tests pass, core coverage holds, and CI is green

## Depends on
#08, #09

## Labels
`feature`

## Estimate
M
