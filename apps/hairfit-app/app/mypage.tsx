import { useAuth } from "@clerk/clerk-expo";
import type { MobileBootstrap, MobileDashboard, PersonalColorResult, StyleProfile } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Divider,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Screen,
  Stack,
} from "@hairfit/ui-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useHairfitApi } from "../lib/api";

type MyPageTabId = "usage" | "plan" | "aftercare" | "body-profile" | "account";

const tabIds: MyPageTabId[] = ["usage", "plan", "aftercare", "body-profile", "account"];

const tabs: Array<{ id: MyPageTabId; label: string }> = [
  { id: "usage", label: "Usage" },
  { id: "plan", label: "Plan" },
  { id: "aftercare", label: "Aftercare" },
  { id: "body-profile", label: "Profile" },
  { id: "account", label: "Account" },
];

function normalizeTab(value: unknown): MyPageTabId {
  const first = Array.isArray(value) ? value[0] : value;
  return tabIds.includes(first as MyPageTabId) ? (first as MyPageTabId) : "usage";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")} KRW`;
}

function formatPlanLabel(planKey: string | null | undefined) {
  if (!planKey) return "Free";
  if (planKey === "starter") return "Starter";
  if (planKey === "pro") return "Pro";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function statusLabel(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "Completed";
  if (status === "failed" || status === "error") return "Failed";
  if (status === "processing" || status === "running") return "Processing";
  if (status === "queued" || status === "pending") return "Queued";
  return value || "Unknown";
}

function displayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit user";
}

function formatPersonalColor(result: PersonalColorResult | null | undefined) {
  if (!result) return "No diagnosis";
  return `${result.tone} tone / ${result.contrast} contrast`;
}

function TabNavigation({ activeTab }: { activeTab: MyPageTabId }) {
  const router = useRouter();

  return (
    <Panel style={{ padding: 8 }}>
      <Cluster gap={8}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "primary" : "secondary"}
            onPress={() => router.push(`/mypage?tab=${tab.id}`)}
          >
            {tab.label}
          </Button>
        ))}
      </Cluster>
    </Panel>
  );
}

function UsagePanel({
  generations,
}: {
  generations: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentGenerations"];
}) {
  const router = useRouter();

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>Recent usage</Heading>
        <BodyText>Recent hairstyle generations and processing states.</BodyText>
        {generations.length === 0 ? (
          <Card style={{ borderStyle: "dashed", paddingVertical: 28 }}>
            <Stack gap={8}>
              <BodyText style={styles.centerStrong}>No generation history yet.</BodyText>
              <BodyText style={styles.centerText}>Create a board from the workspace to see it here.</BodyText>
            </Stack>
          </Card>
        ) : (
          generations.map((item) => (
            <Card key={item.id}>
              <Stack gap={10}>
                <Cluster>
                  <Chip tone={item.status === "completed" ? "success" : "neutral"}>{statusLabel(item.status)}</Chip>
                  <Chip>{formatDate(item.createdAt)}</Chip>
                </Cluster>
                <BodyText style={styles.strongText}>{item.promptUsed || "Untitled generation"}</BodyText>
                <BodyText>{item.id}</BodyText>
                <Button variant="secondary" onPress={() => router.push(`/result/${item.id}`)}>
                  Open
                </Button>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function PlanPanel({
  activePlan,
  payments,
}: {
  activePlan: string;
  payments: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentPayments"];
}) {
  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>Plan and payments</Heading>
        <BodyText>Current plan and recent payment history.</BodyText>
        <Card>
          <BodyText>Active plan</BodyText>
          <Heading>{activePlan}</Heading>
        </Card>
        {payments.length === 0 ? (
          <Card style={{ borderStyle: "dashed" }}>
            <BodyText>No payment history.</BodyText>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id}>
              <BodyText style={styles.strongText}>{formatKrw(payment.amountKrw)}</BodyText>
              <BodyText>
                {payment.status} / {payment.creditsToGrant.toLocaleString("ko-KR")} credits
              </BodyText>
              <BodyText>{formatDate(payment.paidAt ?? payment.createdAt)}</BodyText>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function AftercarePanel() {
  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>Aftercare</Heading>
        <BodyText>Recent confirmed hair service records.</BodyText>
        <Card style={{ borderStyle: "dashed" }}>
          <BodyText>No aftercare records yet.</BodyText>
        </Card>
      </Stack>
    </Panel>
  );
}

function ColorSwatchList({ colors }: { colors: PersonalColorResult["bestColors"] }) {
  if (!colors.length) {
    return <BodyText>No colors saved.</BodyText>;
  }

  return (
    <Cluster>
      {colors.slice(0, 6).map((color) => (
        <View key={`${color.nameEn}-${color.hex}`} style={styles.swatchChip}>
          <View style={[styles.swatchDot, { backgroundColor: color.hex }]} />
          <BodyText style={styles.swatchText}>{color.nameKo}</BodyText>
        </View>
      ))}
    </Cluster>
  );
}

function BodyProfilePanel() {
  const api = useHairfitApi();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isAnalyzingColor, setIsAnalyzingColor] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (!cancelled) {
          setProfile(result.profile);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load style profile.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const analyzePersonalColor = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 5],
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (result.canceled) {
      setMessage("Personal color photo selection was cancelled.");
      return;
    }

    const asset = result.assets[0];
    if (!asset?.base64) {
      setMessage("Could not read the selected photo.");
      return;
    }

    setIsAnalyzingColor(true);
    setMessage("Analyzing personal color...");
    try {
      const mimeType = asset.mimeType || "image/jpeg";
      const analyzed = await api.analyzePersonalColor(`data:${mimeType};base64,${asset.base64}`);
      setProfile((current) => (current ? { ...current, personalColor: analyzed.personalColor } : current));
      setMessage("Personal color result was saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to analyze personal color.");
    } finally {
      setIsAnalyzingColor(false);
    }
  };

  const personalColor = profile?.personalColor ?? null;

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>Body profile settings</Heading>
        <BodyText>Saved body profile and personal color guidance are used for fashion styling.</BodyText>
        {isLoadingProfile ? <BodyText>Loading style profile...</BodyText> : null}
        {message ? <BodyText>{message}</BodyText> : null}
        <Card>
          <Stack>
            <Kicker>Personal Color</Kicker>
            <Heading style={{ fontSize: 20, lineHeight: 26 }}>{formatPersonalColor(personalColor)}</Heading>
            <BodyText>
              {personalColor?.summary || "Upload a clear face photo to save personal color guidance for styling."}
            </BodyText>
            {personalColor ? (
              <Stack>
                <Kicker>Best colors</Kicker>
                <ColorSwatchList colors={personalColor.bestColors} />
                <Kicker>Avoid colors</Kicker>
                <ColorSwatchList colors={personalColor.avoidColors} />
              </Stack>
            ) : null}
            <Button disabled={isAnalyzingColor} onPress={analyzePersonalColor}>
              {isAnalyzingColor ? "Analyzing..." : personalColor ? "Re-diagnose personal color" : "Diagnose personal color"}
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Panel>
  );
}

function AccountPanel({ me }: { me: MobileBootstrap | null }) {
  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>Account</Heading>
        <BodyText>Basic customer account information.</BodyText>
        <Card>
          <BodyText style={styles.strongText}>{displayName(me)}</BodyText>
          <BodyText>{me?.email || "-"}</BodyText>
        </Card>
      </Stack>
    </Panel>
  );
}

export default function MyPageScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const activeTab = normalizeTab(searchParams.tab);
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" } > | null>(null);
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setError("Sign in to view usage, plan, aftercare, and profile settings.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [mobileMe, result] = await Promise.all([api.getMobileMe(), api.getMobileDashboard("customer")]);
        if (!cancelled && result.service === "customer") {
          setMe(mobileMe);
          setDashboard(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const customer = dashboard?.customer;
  const credits = customer?.credits ?? me?.credits ?? 0;
  const activePlan = formatPlanLabel(customer?.planKey ?? me?.planKey);
  const estimatedStyles = Math.floor(credits / 5);
  const usedCredits = 0;
  const viewerName = displayName(me);

  const activePanel = useMemo(() => {
    if (activeTab === "plan") {
      return <PlanPanel activePlan={activePlan} payments={customer?.recentPayments ?? []} />;
    }
    if (activeTab === "aftercare") return <AftercarePanel />;
    if (activeTab === "body-profile") return <BodyProfilePanel />;
    if (activeTab === "account") return <AccountPanel me={me} />;
    return <UsagePanel generations={customer?.recentGenerations ?? []} />;
  }, [activePlan, activeTab, customer?.recentGenerations, customer?.recentPayments, me]);

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>My Page</Kicker>
          <Heading>Account dashboard</Heading>
          <BodyText>{viewerName}'s usage, plan, aftercare, and body profile settings.</BodyText>
          <Button variant="secondary" onPress={() => router.push("/workspace")}>
            Open workspace
          </Button>
        </Stack>
      </Panel>

      {error && isSignedIn ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <BodyText>Loading...</BodyText>
        </Card>
      ) : null}

      <MetricGrid>
        <MetricTile label="Credits" value={credits.toLocaleString("ko-KR")} helper={`Hair generations about ${estimatedStyles}`} />
        <MetricTile label="Plan" value={activePlan} helper="Active subscription" />
        <MetricTile label="Used" value={usedCredits.toLocaleString("ko-KR")} helper="Recent credit use" />
        <MetricTile label="Profile" value={customer?.styleProfileReady ? "Ready" : "Needed"} helper="Fashion styling setup" />
      </MetricGrid>

      <TabNavigation activeTab={activeTab} />
      <Divider />
      {activePanel}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerStrong: {
    color: "#f4f1e8",
    fontWeight: "900",
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
  },
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  strongText: {
    color: "#f4f1e8",
    fontWeight: "800",
  },
  swatchChip: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swatchDot: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  swatchText: {
    color: "#181411",
    fontSize: 12,
    fontWeight: "800",
  },
});
