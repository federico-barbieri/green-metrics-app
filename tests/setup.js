import "@testing-library/jest-dom";
import { beforeAll, afterAll, beforeEach} from "vitest";
import { setupServer } from "msw/node";

const handlers = [];
const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  server.resetHandlers();
});

// Mock environment variables for testing
process.env.NODE_ENV = "test";
