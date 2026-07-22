import { NextResponse } from "next/server";
import { POST as acceptGenerationDraft } from "../../generations/accept/route";
import { POST as uploadGenerationDraft } from "../../generations/drafts/route";

interface GenerateRecommendationsRequest {
  referenceImageDataUrl?: string;
  clientRequestId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * Compatibility adapter for clients released before the upload-draft API.
 *
 * New clients pre-upload the portrait and send a small `/accept` command. This
 * route still accepts the legacy data URL, but it now persists the portrait and
 * durable Workflow outbox before returning; AI analysis no longer runs in the
 * browser request lifetime.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GenerateRecommendationsRequest;
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim() || "";
  if (!referenceImageDataUrl) {
    return NextResponse.json({ error: "referenceImageDataUrl is required" }, { status: 400 });
  }

  const suppliedRequestId = body.clientRequestId?.trim() || "";
  if (suppliedRequestId && !UUID_PATTERN.test(suppliedRequestId)) {
    return NextResponse.json({ error: "clientRequestId must be a valid UUID" }, { status: 400 });
  }
  const clientRequestId = suppliedRequestId || crypto.randomUUID();

  const draftResponse = await uploadGenerationDraft(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientRequestId, referenceImageDataUrl }),
    }),
  );
  const draft = await readJson(draftResponse);
  if (!draftResponse.ok) {
    return NextResponse.json(draft, { status: draftResponse.status });
  }

  const draftId = typeof draft.draftId === "string" ? draft.draftId : "";
  if (!draftId) {
    return NextResponse.json({ error: "Draft upload response is incomplete" }, { status: 500 });
  }

  const acceptanceResponse = await acceptGenerationDraft(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId }),
    }),
  );
  const acceptance = await readJson(acceptanceResponse);
  if (!acceptanceResponse.ok) {
    return NextResponse.json(acceptance, { status: acceptanceResponse.status });
  }

  return NextResponse.json(
    {
      ...acceptance,
      clientRequestId,
      draftId,
      // Legacy fields remain present while preparation happens durably in the
      // Workflow. Consumers must treat these as pending/empty until detail or
      // status reports preparationStatus=ready.
      analysis: null,
      recommendations: [],
      catalogCycleId: null,
      model: null,
      promptVersion: null,
    },
    { status: 202 },
  );
}
