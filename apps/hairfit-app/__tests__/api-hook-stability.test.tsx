import { act, renderHook } from "@testing-library/react-native";
import { useHairfitApi } from "../lib/api";

let mockGetToken = jest.fn<Promise<string | null>, [unknown?]>();
const mockHairfitApiClient = jest.fn((options: unknown) => ({ options }));

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

jest.mock("@hairfit/api-client", () => ({
  HairfitApiClient: function HairfitApiClient(options: unknown) {
    return mockHairfitApiClient(options);
  },
}));

describe("useHairfitApi", () => {
  beforeEach(() => {
    mockGetToken = jest.fn<Promise<string | null>, [unknown?]>().mockResolvedValue("first-token");
    mockHairfitApiClient.mockClear();
  });

  test("keeps the client stable while using the latest Clerk token getter", async () => {
    const { result, rerender } = await renderHook(() => useHairfitApi());
    const firstClient = result.current;

    mockGetToken = jest.fn<Promise<string | null>, [unknown?]>().mockResolvedValue("second-token");
    await rerender(undefined);

    expect(result.current).toBe(firstClient);
    expect(mockHairfitApiClient).toHaveBeenCalledTimes(1);

    const getAuthToken = (result.current as unknown as {
      options: { getAuthToken(options?: unknown): Promise<string | null> };
    }).options.getAuthToken;

    await act(async () => {
      await expect(getAuthToken({ template: "supabase" })).resolves.toBe("second-token");
    });
    expect(mockGetToken).toHaveBeenCalledWith({ template: "supabase" });
  });
});
