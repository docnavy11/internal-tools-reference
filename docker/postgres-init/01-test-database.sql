-- Separate databases for the Vitest suite (DATABASE_URL_TEST) and the Playwright suite
-- (DATABASE_URL_E2E), so the two can run at the same time without seeing each other.
CREATE DATABASE app_test OWNER app;
CREATE DATABASE app_e2e OWNER app;
