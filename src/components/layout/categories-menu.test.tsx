import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { CategoryViewModel } from "@/lib/api/types";
import { CategoriesMenu } from "./categories-menu";

const CATEGORIES: CategoryViewModel[] = [
  { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Ficção Científica", bookCount: 1 },
  { id: "e5f6a7b8-c9d0-1234-efab-345678901234", name: "Negócios", bookCount: 3 },
  { id: "f6a7b8c9-d0e1-2345-fabc-456789012345", name: "Autoajuda", bookCount: 0 },
];

describe("CategoriesMenu", () => {
  it("goes to the full index even before the menu opens", () => {
    // The trigger is a link, not a button: the click has a destination for
    // anyone navigating by keyboard, and for a crawler.
    render(<CategoriesMenu categories={CATEGORIES} />);

    expect(screen.getByRole("link", { name: /Categorias/ })).toHaveAttribute(
      "href",
      "/categories",
    );
  });

  it("opens on hover and lists the categories that have books", async () => {
    // Hover, not click: the trigger is a link, so clicking navigates. Opening is
    // also what surfaces a misused Base UI part — several of them read a context
    // that only exists once the popup mounts.
    const user = userEvent.setup();
    render(<CategoriesMenu categories={CATEGORIES} />);

    await user.hover(screen.getByRole("link", { name: /Categorias/ }));

    expect(await screen.findByRole("menuitem", { name: /Ficção Científica/ })).toHaveAttribute(
      "href",
      `/?category=${CATEGORIES[0].id}`,
    );
    expect(screen.getByRole("menuitem", { name: /Negócios/ })).toBeInTheDocument();
  });

  it("leaves out a category with no books, which would be a dead end", async () => {
    const user = userEvent.setup();
    render(<CategoriesMenu categories={CATEGORIES} />);

    await user.hover(screen.getByRole("link", { name: /Categorias/ }));
    await screen.findByRole("menuitem", { name: /Negócios/ });

    expect(screen.queryByRole("menuitem", { name: /Autoajuda/ })).not.toBeInTheDocument();
  });
});
