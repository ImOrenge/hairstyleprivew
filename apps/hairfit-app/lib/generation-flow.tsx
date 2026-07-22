import { useAuth } from "@clerk/clerk-expo";
import type { GeneratedVariant } from "@hairfit/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  canWriteGenerationFlowOwner,
  createEmptyGenerationFlowState,
  generationRecoveryStore,
  type MobileGenerationDraftReceipt,
} from "./generation-recovery";

export type { MobileGenerationDraftReceipt } from "./generation-recovery";

export interface MobileRecommendationDraft {
  generationId: string;
  imageDataUrl: string;
  recommendations: GeneratedVariant[];
}

interface GenerationFlowContextValue {
  imageDataUrl: string | null;
  draft: MobileRecommendationDraft | null;
  draftReceipt: MobileGenerationDraftReceipt | null;
  draftReceiptHydrated: boolean;
  setImageDataUrl: (value: string | null) => void;
  setDraft: (value: MobileRecommendationDraft | null) => void;
  setDraftReceipt: (value: MobileGenerationDraftReceipt | null) => void;
  clear: () => void;
}

const GenerationFlowContext = createContext<GenerationFlowContextValue | null>(null);

export function GenerationFlowProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [imageDataUrl, setImageDataUrlState] = useState<string | null>(null);
  const [draft, setDraftState] = useState<MobileRecommendationDraft | null>(null);
  const [draftReceipt, setDraftReceiptState] = useState<MobileGenerationDraftReceipt | null>(null);
  const [draftReceiptHydrated, setDraftReceiptHydrated] = useState(false);
  const [boundOwnerId, setBoundOwnerId] = useState<string | null | undefined>(undefined);
  const activeOwnerId = !isLoaded ? undefined : userId ?? null;
  const ownerReady = activeOwnerId !== undefined && boundOwnerId === activeOwnerId;
  const writableOwnerId = ownerReady && activeOwnerId ? activeOwnerId : null;
  const currentWritableOwnerRef = useRef<string | null>(writableOwnerId);
  currentWritableOwnerRef.current = writableOwnerId;

  useEffect(() => {
    let cancelled = false;
    if (activeOwnerId === undefined) return;

    const empty = createEmptyGenerationFlowState(activeOwnerId);
    setImageDataUrlState(empty.imageDataUrl);
    setDraftState(empty.draft);
    setDraftReceiptState(empty.draftReceipt);
    setDraftReceiptHydrated(false);
    setBoundOwnerId(undefined);

    if (activeOwnerId === null) {
      setBoundOwnerId(null);
      setDraftReceiptHydrated(true);
      return;
    }

    void generationRecoveryStore.read(activeOwnerId)
      .then((storedReceipt) => {
        if (!cancelled) setDraftReceiptState(storedReceipt);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setBoundOwnerId(activeOwnerId);
          setDraftReceiptHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeOwnerId]);

  const setImageDataUrl = useCallback((value: string | null) => {
    if (canWriteGenerationFlowOwner(currentWritableOwnerRef.current, writableOwnerId)) {
      setImageDataUrlState(value);
    }
  }, [writableOwnerId]);

  const setDraft = useCallback((value: MobileRecommendationDraft | null) => {
    if (canWriteGenerationFlowOwner(currentWritableOwnerRef.current, writableOwnerId)) {
      setDraftState(value);
    }
  }, [writableOwnerId]);

  const setDraftReceipt = useCallback((value: MobileGenerationDraftReceipt | null) => {
    if (!canWriteGenerationFlowOwner(currentWritableOwnerRef.current, writableOwnerId) || !writableOwnerId) {
      return;
    }
    setDraftReceiptState(value);
    const persistence = value
      ? generationRecoveryStore.save(writableOwnerId, value)
      : generationRecoveryStore.clear(writableOwnerId);
    void persistence.catch(() => undefined);
  }, [writableOwnerId]);

  const clear = useCallback(() => {
    if (!canWriteGenerationFlowOwner(currentWritableOwnerRef.current, writableOwnerId) || !writableOwnerId) {
      return;
    }
    setImageDataUrlState(null);
    setDraftState(null);
    setDraftReceiptState(null);
    void generationRecoveryStore.clear(writableOwnerId).catch(() => undefined);
  }, [writableOwnerId]);

  const exposedImageDataUrl = ownerReady ? imageDataUrl : null;
  const exposedDraft = ownerReady ? draft : null;
  const exposedDraftReceipt = ownerReady ? draftReceipt : null;
  const providerKey = ownerReady
    ? activeOwnerId ?? "signed-out"
    : "generation-owner-binding";

  const value = useMemo(
    () => ({
      imageDataUrl: exposedImageDataUrl,
      draft: exposedDraft,
      draftReceipt: exposedDraftReceipt,
      draftReceiptHydrated: ownerReady && draftReceiptHydrated,
      setImageDataUrl,
      setDraft,
      setDraftReceipt,
      clear,
    }),
    [
      clear,
      draftReceiptHydrated,
      exposedDraft,
      exposedDraftReceipt,
      exposedImageDataUrl,
      ownerReady,
      setDraft,
      setDraftReceipt,
      setImageDataUrl,
    ],
  );

  return (
    <GenerationFlowContext.Provider key={providerKey} value={value}>
      {children}
    </GenerationFlowContext.Provider>
  );
}

export function useGenerationFlow() {
  const context = useContext(GenerationFlowContext);
  if (!context) {
    throw new Error("useGenerationFlow must be used inside GenerationFlowProvider");
  }

  return context;
}
