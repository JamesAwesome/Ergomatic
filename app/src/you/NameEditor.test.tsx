import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NameEditor from "./NameEditor";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const ok = (name: string) =>
  ({
    ok: true,
    json: async () => ({ user: { id: "u1", email: "a@x.com", name } }),
  }) as unknown as Response;

describe("NameEditor", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue(ok("James"));
  });

  // AXE CANNOT CATCH THIS, which is why it is asserted by hand. An unlabelled
  // <section> is not exposed as a region at all, so a missing
  // `aria-labelledby` raises no violation -- the 398 design assertions passed
  // while this screen had two labelled regions and one anonymous one.
  it("exposes NAME as a labelled region, like its siblings on the screen", () => {
    render(<NameEditor name="Rower" onRenamed={vi.fn()} />);
    expect(screen.getByRole("region", { name: "NAME" })).toBeInTheDocument();
  });

  it("shows the rower's current name, so the screen answers 'what am I called'", () => {
    render(<NameEditor name="Rower" onRenamed={vi.fn()} />);
    expect(screen.getByLabelText("Your name")).toHaveValue("Rower");
  });

  // SAVE IS DISABLED UNTIL THE VALUE DIFFERS. Without this the control can
  // post a no-op, and a rower who opens the screen and leaves has written to
  // their account.
  it("offers no save until the name actually changes", async () => {
    render(<NameEditor name="Rower" onRenamed={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your name"), "s");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("sends the new name and tells the app it changed", async () => {
    const onRenamed = vi.fn();
    render(<NameEditor name="Rower" onRenamed={onRenamed} />);
    const field = screen.getByLabelText("Your name");
    await userEvent.clear(field);
    await userEvent.type(field, "James");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "James" }),
      }),
    );
    // The whole point of the callback: You's header and its initials read the
    // same user object, so they must be told rather than left stale.
    await waitFor(() => expect(onRenamed).toHaveBeenCalled());
  });

  it("confirms the save on screen, not just in the network tab", async () => {
    render(<NameEditor name="Rower" onRenamed={vi.fn()} />);
    const field = screen.getByLabelText("Your name");
    await userEvent.clear(field);
    await userEvent.type(field, "James");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("SAVED")).toBeInTheDocument();
  });

  // A REFUSAL THE ROWER CAN ACT ON. The server answers 400 for an empty
  // name; rendering nothing would leave them tapping Save at a field that
  // silently does nothing.
  it("says why an empty name was refused", async () => {
    mockedApi.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "name_required" }),
    } as unknown as Response);
    const onRenamed = vi.fn();
    render(<NameEditor name="Rower" onRenamed={onRenamed} />);
    const field = screen.getByLabelText("Your name");
    await userEvent.clear(field);
    await userEvent.type(field, "x");
    await userEvent.clear(field);
    await userEvent.type(field, " ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A name cannot be empty.",
    );
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("says so when the save cannot reach the server at all", async () => {
    mockedApi.mockRejectedValue(new Error("offline"));
    render(<NameEditor name="Rower" onRenamed={vi.fn()} />);
    const field = screen.getByLabelText("Your name");
    await userEvent.clear(field);
    await userEvent.type(field, "James");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not save. Try again.",
    );
  });
});
