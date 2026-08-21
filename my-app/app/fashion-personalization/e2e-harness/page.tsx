import { notFound } from "next/navigation";
import { FashionPersonalizationForm } from "../../../components/onboarding/FashionPersonalizationForm";

export default function FashionPersonalizationHarnessPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  return <FashionPersonalizationForm
    returnTo="/consulting/e2e-harness?stage=fashion"
    readOnlyPreview
    initialState={{
      policy: {
        schemaVersion: "user-fashion-personalization-policy-v1",
        userId: "fixture-user",
        styleTarget: "neutral",
        sizeProfile: [{ category: "top", system: "KR", value: "100", source: "user-entered" }],
        fitPreferences: ["regular"],
        silhouettePreferences: [],
        baselineBudget: { minKrw: 80000, maxKrw: 250000 },
        avoidRules: ["constraints-confirmed"],
        materialPreferences: ["cotton"],
        materialSensitivities: [],
        accessibilityNeeds: [],
        preferredBrands: [],
        avoidedBrands: [],
        preferredSellers: [],
        avoidedSellers: [],
        ethicalPreferences: [],
        learningConsent: true,
        revision: 3,
        confirmedRevision: 3,
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      coverage: { complete: true, missing: [] },
      learningResetAt: null,
    }}
  />;
}
