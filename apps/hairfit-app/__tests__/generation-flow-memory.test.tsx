import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import {
  GenerationFlowProvider,
  useGenerationFlow,
} from "../lib/generation-flow";
import { getGenerationDraftReceiptStorageKey } from "../lib/generation-recovery";

const OWNER_ID = "user_account_a";
const DRAFT_ID = "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882";
const PRIVATE_IMAGE_DATA_URL = "data:image/jpeg;base64,PRIVATE_PORTRAIT_SENTINEL";
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: OWNER_ID }),
}));
jest.mock("expo-secure-store", () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

function FlowMemoryProbe() {
  const flow = useGenerationFlow();
  return (
    <View>
      <Text testID="hydration-state">
        {flow.draftReceiptHydrated ? "hydrated" : "loading"}
      </Text>
      <Text testID="portrait-memory">{flow.imageDataUrl ?? "empty"}</Text>
      <Text testID="draft-portrait-memory">{flow.draft?.imageDataUrl ?? "empty"}</Text>
      <Text testID="receipt-memory">{flow.draftReceipt?.draftId ?? "empty"}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          flow.setImageDataUrl(PRIVATE_IMAGE_DATA_URL);
          flow.setDraft({
            generationId: "client-preview-only",
            imageDataUrl: PRIVATE_IMAGE_DATA_URL,
            recommendations: [],
          });
          flow.setDraftReceipt({
            draftId: DRAFT_ID,
            clientRequestId: "5c7baf42-e536-4ba6-8d57-5cb9a3e8c8e2",
            uploadedAt: "2026-07-18T00:00:00.000Z",
            expiresAt: "2026-07-19T23:59:00.000Z",
          });
        }}
      >
        <Text>접수 전 민감 상태 준비</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={flow.clear}>
        <Text>접수 영수증 확인 후 제거</Text>
      </Pressable>
    </View>
  );
}

describe("generation portrait memory lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    mockDeleteItemAsync.mockResolvedValue(undefined);
  });

  test("clear removes portrait base64, recommendation draft, and the recovery receipt", async () => {
    await render(
      <GenerationFlowProvider>
        <FlowMemoryProbe />
      </GenerationFlowProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("hydration-state")).toHaveTextContent("hydrated"));

    await fireEvent.press(screen.getByRole("button", { name: "접수 전 민감 상태 준비" }));
    expect(screen.getByTestId("portrait-memory")).toHaveTextContent(PRIVATE_IMAGE_DATA_URL);
    expect(screen.getByTestId("draft-portrait-memory")).toHaveTextContent(PRIVATE_IMAGE_DATA_URL);
    expect(screen.getByTestId("receipt-memory")).toHaveTextContent(DRAFT_ID);

    await waitFor(() => expect(mockSetItemAsync).toHaveBeenCalledTimes(1));
    const persistedReceipt = String(mockSetItemAsync.mock.calls[0][1]);
    expect(persistedReceipt).not.toContain("base64");
    expect(persistedReceipt).not.toContain("PRIVATE_PORTRAIT_SENTINEL");

    await fireEvent.press(
      screen.getByRole("button", { name: "접수 영수증 확인 후 제거" }),
    );
    await waitFor(() => expect(screen.getByTestId("portrait-memory")).toHaveTextContent("empty"));
    expect(screen.getByTestId("draft-portrait-memory")).toHaveTextContent("empty");
    expect(screen.getByTestId("receipt-memory")).toHaveTextContent("empty");
    await waitFor(() => {
      expect(mockDeleteItemAsync).toHaveBeenCalledWith(
        getGenerationDraftReceiptStorageKey(OWNER_ID),
      );
    });
  });
});
