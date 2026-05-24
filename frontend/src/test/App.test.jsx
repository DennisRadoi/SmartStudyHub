import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { vi } from "vitest";
import App from "../App.jsx";

const createMockResponse = (data) => ({
  ok: true,
  json: async () => data,
});

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (typeof url === "string" && url.includes("/config")) {
          return Promise.resolve(
            createMockResponse({
              chat_model: "test-model",
              generation_model: "test-model",
            })
          );
        }
        return Promise.resolve(createMockResponse({}));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderApp = async () => {
    await act(async () => {
      render(<App />);
    });
  };

  it("renders the login header", async () => {
    await renderApp();
    expect(screen.getByText("Smart Study Hub")).toBeInTheDocument();
  });

  it("shows developer code field on signup", async () => {
    await renderApp();
    const user = userEvent.setup();
    await screen.findByText("Smart Study Hub");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      screen.getByPlaceholderText("Developer Code (optional)")
    ).toBeInTheDocument();
  });

  it("hides developer code field when switching back to login", async () => {
    await renderApp();
    const user = userEvent.setup();
    await screen.findByText("Smart Study Hub");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    const loginToggles = screen.getAllByRole("button", { name: "Login" });
    await user.click(loginToggles[0]);

    expect(
      screen.queryByPlaceholderText("Developer Code (optional)")
    ).toBeNull();
  });

  it("toggles dark mode button label", async () => {
    await renderApp();
    const user = userEvent.setup();
    await screen.findByText("Smart Study Hub");

    const toggle = screen.getByText("🌙 Dark");
    await user.click(toggle);
    expect(screen.getByText("☀️ Light")).toBeInTheDocument();
  });
});
