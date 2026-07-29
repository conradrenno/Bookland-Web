import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./search-bar";

const push = vi.fn();
let currentUrl = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => currentUrl,
}));

beforeEach(() => {
  push.mockClear();
  currentUrl = new URLSearchParams();
});

async function search(term: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Buscar livros por título ou autor");
  await user.clear(input);
  if (term) await user.type(input, term);
  // Enter, because a search field is submitted rather than clicked.
  await user.type(input, "{Enter}");
}

describe("SearchBar", () => {
  it("sends the term to the catalogue URL", async () => {
    render(<SearchBar />);

    await search("duna");

    expect(push).toHaveBeenCalledWith("/?q=duna");
  });

  it("does not search per keystroke", async () => {
    render(<SearchBar />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Buscar livros por título ou autor"), "duna");

    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the other filters while replacing the term", async () => {
    currentUrl = new URLSearchParams({ category: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    render(<SearchBar />);

    await search("clean");

    expect(push).toHaveBeenCalledWith("/?q=clean&category=a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("returns to the first page, since old offsets do not fit new results", async () => {
    currentUrl = new URLSearchParams({ page: "4" });
    render(<SearchBar />);

    await search("duna");

    expect(push).toHaveBeenCalledWith("/?q=duna");
  });

  it("clears the search when the field is emptied", async () => {
    currentUrl = new URLSearchParams({ q: "duna" });
    render(<SearchBar />);

    await search("");

    expect(push).toHaveBeenCalledWith("/");
  });

  it("treats an all-spaces term as no search at all", async () => {
    render(<SearchBar />);

    await search("   ");

    expect(push).toHaveBeenCalledWith("/");
  });

  it("starts from the term already in the URL", () => {
    currentUrl = new URLSearchParams({ q: "duna" });
    render(<SearchBar />);

    expect(screen.getByLabelText("Buscar livros por título ou autor")).toHaveValue("duna");
  });
});
