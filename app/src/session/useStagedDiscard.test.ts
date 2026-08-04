import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DRAFT_KEY } from "./draft";
import { RUN_KEY } from "./run";
import { ARM_TIMEOUT_MS, useStagedDiscard } from "./useStagedDiscard";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// The shared staged-discard machine (Task 3, ui-fix round): {armed, arm,
// fire, disarm}, auto-disarming on blur or a 4s timeout, fire clearing both
// session records with no POST of its own. Extracted from WorkoutDetail.tsx's
// own Delete-workout flow (Task 1 fix round) so SessionComplete/Today/
// LogSession consume ONE implementation of this timing rather than three
// near-identical copies — this file proves the machine itself; each
// surface's own test file proves it's wired up (arm/fire reach the right
// button, the right copy, the right post-fire behaviour).
describe("useStagedDiscard", () => {
  it("starts unarmed", () => {
    const { result } = renderHook(() => useStagedDiscard());
    expect(result.current.armed).toBe(false);
  });

  it("arm() arms the control", () => {
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());
    expect(result.current.armed).toBe(true);
  });

  it("fire() clears both the draft and run records and disarms — a bare pair of localStorage.removeItem calls, never a POST", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1 }));
    localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1 }));
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());

    act(() => result.current.fire());

    expect(result.current.armed).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("fire() is safe to call while already unarmed — still clears whatever's staged (no gate of its own; callers own the two-tap sequencing)", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1 }));
    const { result } = renderHook(() => useStagedDiscard());

    act(() => result.current.fire());

    expect(result.current.armed).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("disarm() (the function every call site wires to onBlur) resets armed to false without touching storage — disarm-blur", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1 }));
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());

    act(() => result.current.disarm());

    expect(result.current.armed).toBe(false);
    // Only fire() clears records — disarm (blur or timeout) never does.
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("disarms automatically 4s after arming with no second press — disarm-timeout", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());
    expect(result.current.armed).toBe(true);

    act(() => vi.advanceTimersByTime(ARM_TIMEOUT_MS));

    expect(result.current.armed).toBe(false);
  });

  it("does not yet disarm just before the 4s mark", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());

    act(() => vi.advanceTimersByTime(ARM_TIMEOUT_MS - 1));

    expect(result.current.armed).toBe(true);
  });

  it("a re-press while already armed gets a full fresh 4s window, not whatever remained of the first", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.arm()); // re-press, 1s before the original timer would fire
    act(() => vi.advanceTimersByTime(3000)); // 6s since the first press, only 3s since the re-press
    expect(result.current.armed).toBe(true);

    act(() => vi.advanceTimersByTime(1000)); // 4s since the re-press
    expect(result.current.armed).toBe(false);
  });

  it("clears the pending auto-disarm timer on unmount, so it can never call setState against an unmounted component", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useStagedDiscard());
    act(() => result.current.arm());
    const callsBeforeUnmount = clearSpy.mock.calls.length;

    unmount();

    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);
    // Nothing left to fire — advancing well past the timeout must not throw.
    expect(() =>
      act(() => vi.advanceTimersByTime(ARM_TIMEOUT_MS * 2)),
    ).not.toThrow();
  });

  it("unmounting while unarmed is a no-op — there is no timer to clear", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => useStagedDiscard());
    const callsBeforeUnmount = clearSpy.mock.calls.length;

    unmount();

    expect(clearSpy.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
