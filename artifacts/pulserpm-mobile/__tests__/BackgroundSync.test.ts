/**
 * Unit tests for the HC_SYNC_TASK background task handler defined in BackgroundSync.ts.
 *
 * The task handler is registered at module load via TaskManager.defineTask.
 * We capture it through the mock so we can call it directly in each test.
 */

import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  getRegisteredTasksAsync: jest.fn(),
}));

jest.mock("expo-background-fetch", () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  BackgroundFetchResult: {
    NoData: "noData",
    NewData: "newData",
    Failed: "failed",
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock health services — resolved relative to BackgroundSync.ts module location
jest.mock("../services/HealthConnectService", () => ({
  getHCStatus: jest.fn(),
  getHCPermissions: jest.fn(),
  readLatestVitals: jest.fn(),
  hasAnyReading: jest.fn(),
}));

jest.mock("../services/HealthKitService", () => ({
  getHKStatus: jest.fn(),
  getHKPermissions: jest.fn(),
  readLatestVitals: jest.fn(),
  hasAnyReading: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Import the module AFTER mocks are set up so defineTask is called with the mock
import "../services/BackgroundSync";
import { HC_SYNC_TASK } from "../services/BackgroundSync";

// Retrieve the task handler that was registered at module load
function getTaskHandler(): () => Promise<string> {
  const calls = (TaskManager.defineTask as jest.Mock).mock.calls;
  const entry = calls.find(([name]: [string]) => name === HC_SYNC_TASK);
  if (!entry) throw new Error("HC_SYNC_TASK handler was never registered");
  return entry[1];
}

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Dynamic-import mocks require jest.requireMock to access after the module loads
const hcService = jest.requireMock("../services/HealthConnectService") as {
  getHCStatus: jest.Mock;
  getHCPermissions: jest.Mock;
  readLatestVitals: jest.Mock;
  hasAnyReading: jest.Mock;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HC_SYNC_TASK — task handler", () => {
  let handler: () => Promise<string>;

  beforeAll(() => {
    handler = getTaskHandler();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no stored API key
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
  });

  // ── 1. No API key ──────────────────────────────────────────────────────
  it("returns NoData when no API key is stored", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null); // no key for any storage read

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
  });

  // ── 2. Health Connect not ready ─────────────────────────────────────────
  it("returns NoData when Health Connect status is not 'ready'", async () => {
    // getItem called first for STORAGE_KEY_API
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("unavailable");

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    expect(hcService.getHCStatus).toHaveBeenCalledTimes(1);
  });

  // ── 3. No HC permissions granted ───────────────────────────────────────
  it("returns NoData when no Health Connect permissions are granted", async () => {
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("ready");
    hcService.getHCPermissions.mockResolvedValue({
      heartRate: false,
      spo2: false,
      bloodPressure: false,
      temperature: false,
    });

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
  });

  // ── 4. Successful post → NewData ────────────────────────────────────────
  it("returns NewData and stamps last-sync time on a successful post", async () => {
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      if (key === "pulserpm_ingest_url") return Promise.resolve("https://api.example.com/api/device/ingest");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("ready");
    hcService.getHCPermissions.mockResolvedValue({
      heartRate: true,
      spo2: false,
      bloodPressure: false,
      temperature: false,
    });
    hcService.readLatestVitals.mockResolvedValue({ heartRate: 72 });
    hcService.hasAnyReading.mockReturnValue(true);

    // Successful HTTP response
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Should stamp the last-sync timestamp
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "pulserpm_last_hc_sync",
      expect.any(String)
    );
  });

  // ── 5. Failed post → Failed ─────────────────────────────────────────────
  it("returns Failed when the ingest POST returns a non-ok response", async () => {
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      if (key === "pulserpm_ingest_url") return Promise.resolve("https://api.example.com/api/device/ingest");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("ready");
    hcService.getHCPermissions.mockResolvedValue({
      heartRate: true,
      spo2: false,
      bloodPressure: false,
      temperature: false,
    });
    hcService.readLatestVitals.mockResolvedValue({ heartRate: 72 });
    hcService.hasAnyReading.mockReturnValue(true);

    // Non-ok HTTP response
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.Failed);
    // Should NOT stamp a last-sync timestamp
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalledWith(
      "pulserpm_last_hc_sync",
      expect.any(String)
    );
  });

  // ── 6. Network throws → Failed ──────────────────────────────────────────
  it("returns Failed when the fetch call throws a network error", async () => {
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      if (key === "pulserpm_ingest_url") return Promise.resolve("https://api.example.com/api/device/ingest");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("ready");
    hcService.getHCPermissions.mockResolvedValue({
      heartRate: true,
      spo2: false,
      bloodPressure: false,
      temperature: false,
    });
    hcService.readLatestVitals.mockResolvedValue({ heartRate: 72 });
    hcService.hasAnyReading.mockReturnValue(true);

    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.Failed);
  });

  // ── 7. No vitals returned → NoData ─────────────────────────────────────
  it("returns NoData when the health store has no new readings", async () => {
    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === "pulserpm_api_key") return Promise.resolve("test-key-123");
      return Promise.resolve(null);
    });

    hcService.getHCStatus.mockResolvedValue("ready");
    hcService.getHCPermissions.mockResolvedValue({
      heartRate: true,
      spo2: false,
      bloodPressure: false,
      temperature: false,
    });
    hcService.readLatestVitals.mockResolvedValue({});
    hcService.hasAnyReading.mockReturnValue(false);

    global.fetch = jest.fn();

    const result = await handler();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isBackgroundSyncRegistered
// ---------------------------------------------------------------------------

import { isBackgroundSyncRegistered } from "../services/BackgroundSync";

describe("isBackgroundSyncRegistered", () => {
  it("returns true when the task appears in the registered list", async () => {
    (TaskManager.getRegisteredTasksAsync as jest.Mock).mockResolvedValue([
      { taskName: HC_SYNC_TASK },
    ]);
    const result = await isBackgroundSyncRegistered();
    expect(result).toBe(true);
  });

  it("returns false when the task is absent from the registered list", async () => {
    (TaskManager.getRegisteredTasksAsync as jest.Mock).mockResolvedValue([
      { taskName: "some-other-task" },
    ]);
    const result = await isBackgroundSyncRegistered();
    expect(result).toBe(false);
  });

  it("returns false when TaskManager throws", async () => {
    (TaskManager.getRegisteredTasksAsync as jest.Mock).mockRejectedValue(
      new Error("unavailable")
    );
    const result = await isBackgroundSyncRegistered();
    expect(result).toBe(false);
  });
});
