/**
 * Unit tests for the AppState "active" re-registration handler in AppContext.
 *
 * When the app returns to the foreground (background/inactive → active),
 * the handler must:
 *   1. Call isBackgroundSyncRegistered() to check whether the OS killed the task.
 *   2. Call registerBackgroundSync(15) if and only if the check returns false.
 */

import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// BackgroundSync helpers we want to spy on
const mockIsRegistered = jest.fn();
const mockRegister = jest.fn();

jest.mock("@/services/BackgroundSync", () => ({
  isBackgroundSyncRegistered: (...args: unknown[]) => mockIsRegistered(...args),
  registerBackgroundSync: (...args: unknown[]) => mockRegister(...args),
  STORAGE_KEY_LAST_HC_SYNC: "pulserpm_last_hc_sync",
  STORAGE_KEY_BG_SYNC_ENABLED: "pulserpm_bg_sync_enabled",
  HC_SYNC_TASK: "pulserpm-hc-background-sync",
}));

// Silence health service imports used inside AppContext
jest.mock("@/services/HealthConnectService", () => ({
  getHCStatus: jest.fn().mockResolvedValue("unavailable"),
  getHCPermissions: jest.fn().mockResolvedValue({
    heartRate: false,
    spo2: false,
    bloodPressure: false,
    temperature: false,
  }),
  readLatestVitals: jest.fn().mockResolvedValue({}),
  hasAnyReading: jest.fn().mockReturnValue(false),
}));

jest.mock("@/services/HealthKitService", () => ({
  getHKStatus: jest.fn().mockResolvedValue("unavailable"),
  getHKPermissions: jest.fn().mockResolvedValue({
    heartRate: false,
    spo2: false,
    bloodPressure: false,
    temperature: false,
  }),
  readLatestVitals: jest.fn().mockResolvedValue({}),
  hasAnyReading: jest.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AppProvider } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

type AppStateHandler = (nextState: string) => void;

/** Renders AppProvider with a paired device (API key in storage). */
function renderWithPairedDevice() {
  mockAsyncStorage.getItem.mockImplementation((key: string) => {
    if (key === "pulserpm_api_key") return Promise.resolve("test-device-key");
    return Promise.resolve(null);
  });
  mockAsyncStorage.setItem.mockResolvedValue();

  return render(
    <AppProvider>
      <></>
    </AppProvider>
  );
}

/** Simulates a full background → active foreground-resume transition. */
async function simulateForegroundResume(handler: AppStateHandler) {
  await act(async () => {
    handler("background");
  });
  await act(async () => {
    handler("active");
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppContext — foreground wake re-registration", () => {
  let appStateListenerSpy: jest.SpyInstance;
  let capturedHandler: AppStateHandler | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHandler = null;
    mockRegister.mockResolvedValue(true);

    // Spy on AppState.addEventListener and capture the handler
    appStateListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event: string, handler: AppStateHandler) => {
        capturedHandler = handler;
        return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    appStateListenerSpy.mockRestore();
  });

  // ── 1. Re-registers when the OS killed the task ─────────────────────────
  it("calls registerBackgroundSync when isBackgroundSyncRegistered returns false", async () => {
    mockIsRegistered.mockResolvedValue(false);

    renderWithPairedDevice();

    // Wait for initial registration triggered by apiKey effect
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));

    mockRegister.mockClear();
    mockIsRegistered.mockClear();

    expect(capturedHandler).not.toBeNull();
    await simulateForegroundResume(capturedHandler!);

    await waitFor(() => expect(mockIsRegistered).toHaveBeenCalledTimes(1));
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(15);
  });

  // ── 2. Does NOT re-register when the task is still alive ────────────────
  it("does NOT call registerBackgroundSync when isBackgroundSyncRegistered returns true", async () => {
    mockIsRegistered.mockResolvedValue(true);

    renderWithPairedDevice();
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));

    mockRegister.mockClear();
    mockIsRegistered.mockClear();

    expect(capturedHandler).not.toBeNull();
    await simulateForegroundResume(capturedHandler!);

    await waitFor(() => expect(mockIsRegistered).toHaveBeenCalledTimes(1));
    expect(mockRegister).not.toHaveBeenCalled();
  });

  // ── 3. Foreground transition from "inactive" also re-registers ──────────
  it("re-registers when transitioning from inactive (not just background)", async () => {
    mockIsRegistered.mockResolvedValue(false);

    renderWithPairedDevice();
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));

    mockRegister.mockClear();
    mockIsRegistered.mockClear();

    expect(capturedHandler).not.toBeNull();
    await act(async () => { capturedHandler!("inactive"); });
    await act(async () => { capturedHandler!("active"); });

    await waitFor(() => expect(mockIsRegistered).toHaveBeenCalledTimes(1));
    expect(mockRegister).toHaveBeenCalledWith(15);
  });

  // ── 4. active → active does NOT trigger re-registration ─────────────────
  it("does NOT re-register when the app was already in active state", async () => {
    mockIsRegistered.mockResolvedValue(false);

    renderWithPairedDevice();
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));

    mockRegister.mockClear();
    mockIsRegistered.mockClear();

    // Fire active → active (no background/inactive in between)
    expect(capturedHandler).not.toBeNull();
    await act(async () => { capturedHandler!("active"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(mockIsRegistered).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  // ── 5. No action when no API key is present ─────────────────────────────
  it("does not attempt re-registration when no API key is stored", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);

    render(
      <AppProvider>
        <></>
      </AppProvider>
    );

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    mockRegister.mockClear();
    mockIsRegistered.mockClear();

    if (capturedHandler) {
      await act(async () => { capturedHandler!("background"); });
      await act(async () => { capturedHandler!("active"); });
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    }

    // Without an apiKey the useEffect that subscribes to AppState changes is a no-op
    expect(mockIsRegistered).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
