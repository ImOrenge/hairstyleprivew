import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import * as ImagePicker from "expo-image-picker";
import UploadScreen from "../app/upload";
import { MobileMyPageAccountPanel } from "../components/mypage/panels/MobileMyPageAccountPanel";
import type { MobileBootstrap } from "@hairfit/shared";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetMobileMe = jest.fn();
const mockGetStyleProfile = jest.fn();
const mockPrepareGenerationDraft = jest.fn();
const mockSaveAccountSetup = jest.fn();
const mockOnSaved = jest.fn();
const mockRouter = {
  back: jest.fn(),
  canGoBack: () => false,
  push: mockPush,
  replace: mockReplace,
};

const mockApi = {
  getMobileMe: mockGetMobileMe,
  getStyleProfile: mockGetStyleProfile,
  prepareGenerationDraft: mockPrepareGenerationDraft,
  saveAccountSetup: mockSaveAccountSetup,
};

const mockFlow = {
  draftReceipt: null,
  draftReceiptHydrated: true,
  imageDataUrl: null,
  setDraft: jest.fn(),
  setDraftReceipt: jest.fn(),
  setImageDataUrl: jest.fn(),
};

const incompleteMember: MobileBootstrap = {
  userId: "user_member",
  email: "member@hairfit.test",
  displayName: "테스터",
  accountType: "member",
  styleTarget: null,
  preferredStyleTone: "natural",
  accountSetupComplete: false,
  credits: 20,
  planKey: null,
  services: ["customer"],
};

const completeMember: MobileBootstrap = {
  ...incompleteMember,
  styleTarget: "male",
  accountSetupComplete: true,
};

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
    userId: "user_member",
  }),
  useUser: () => ({
    user: {
      emailAddresses: [{ emailAddress: "member@hairfit.test" }],
      firstName: "테스터",
      primaryEmailAddress: { emailAddress: "member@hairfit.test" },
    },
  }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" }));
jest.mock("../lib/api", () => ({ useHairfitApi: () => mockApi }));
jest.mock("../lib/generation-flow", () => ({ useGenerationFlow: () => mockFlow }));
jest.mock("../hooks/useSafeBackNavigation", () => ({ useSafeBackNavigation: () => jest.fn() }));
jest.mock("../hooks/usePhotoLibraryPermissionRecovery", () => ({
  usePhotoLibraryPermissionRecovery: () => ({
    openPermissionSettings: jest.fn(),
    photoPermissionRequiresSettings: false,
    resolvePhotoLibraryPermission: () => "granted",
  }),
}));
jest.mock("../components/app/PhotoLibraryPermissionRecovery", () => ({
  PhotoLibraryPermissionRecovery: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("generation account setup entry", () => {
  const launchImageLibraryAsyncMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
  const requestMediaLibraryPermissionsAsyncMock =
    ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlow.draftReceipt = null;
    mockFlow.imageDataUrl = null;
    mockGetStyleProfile.mockResolvedValue({ profile: { personalColor: null } });
    requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: true });
  });

  test("redirects an incomplete member before exposing photo selection", async () => {
    mockGetMobileMe.mockResolvedValueOnce(incompleteMember);

    await render(<UploadScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/mypage?tab=account&setup=1&continue=generation-upload",
      );
    });
    expect(screen.queryByRole("button", { name: "사진 선택" })).not.toBeOnTheScreen();
    expect(mockGetStyleProfile).not.toHaveBeenCalled();
  });

  test("returns to native upload after the required account fields are saved", async () => {
    mockSaveAccountSetup.mockResolvedValueOnce({
      profile: {
        displayName: "테스터",
        preferredStyleTone: "natural",
        styleTarget: "male",
      },
    });
    mockGetMobileMe.mockResolvedValueOnce(completeMember);

    await render(
      <MobileMyPageAccountPanel
        continuation="generation-upload"
        me={incompleteMember}
        onSaved={mockOnSaved}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "남성" }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 설정 저장" }));

    await waitFor(() => {
      expect(mockOnSaved).toHaveBeenCalledWith(completeMember);
      expect(mockReplace).toHaveBeenCalledWith("/upload");
    });
  });

  test("announces an invalid mobile image before any upload request", async () => {
    mockGetMobileMe.mockResolvedValueOnce(completeMember);
    launchImageLibraryAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: "file:///small.jpg",
        base64: "YQ==",
        type: "image",
        mimeType: "image/jpeg",
        width: 511,
        height: 512,
      }],
    });

    await render(<UploadScreen />);
    const selectButton = await screen.findByRole("button", { name: "사진 선택" });
    await fireEvent.press(selectButton);

    expect(
      await screen.findByLabelText("사진의 가로와 세로는 각각 512px 이상이어야 합니다."),
    ).toHaveProp("accessibilityRole", "alert");
    expect(mockPrepareGenerationDraft).not.toHaveBeenCalled();
    expect(mockFlow.setImageDataUrl).not.toHaveBeenCalled();
  });

  test("labels ImagePicker base64 as JPEG even when the source asset is HEIC", async () => {
    mockGetMobileMe.mockResolvedValueOnce(completeMember);
    launchImageLibraryAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: "file:///portrait.heic",
        base64: "YQ==",
        type: "image",
        mimeType: "image/heic",
        width: 512,
        height: 640,
      }],
    });
    mockPrepareGenerationDraft.mockResolvedValueOnce({
      draftId: "draft-1",
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      uploadedAt: "2026-07-18T00:00:00.000Z",
      expiresAt: "2026-07-19T00:00:00.000Z",
    });

    await render(<UploadScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "사진 선택" }));

    await waitFor(() => expect(mockPrepareGenerationDraft).toHaveBeenCalledTimes(1));
    expect(mockPrepareGenerationDraft.mock.calls[0][0].referenceImageDataUrl).toBe(
      "data:image/jpeg;base64,YQ==",
    );
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true }),
    );
  });
});
