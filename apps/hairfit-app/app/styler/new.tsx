import type {
  BodyShape,
  ExposurePreference,
  FashionGenre,
  FashionRecommendation,
  FitPreference,
  GeneratedVariant,
  HairstyleGenerationGroup,
  StyleProfile,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  Panel,
  Screen,
  Stack,
  TextField,
} from "@hairfit/ui-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../../lib/api";

type WizardStep = 1 | 2 | 3;

const genres: Array<{ value: FashionGenre; label: string; description: string }> = [
  { value: "minimal", label: "Minimal", description: "Reduce color and detail so the hair and face read clearly." },
  { value: "street", label: "Street", description: "Use volume, oversizing, and functional details for a trend-led look." },
  { value: "casual", label: "Casual", description: "Build daily balance with pieces that are easy to repeat." },
  { value: "classic", label: "Classic", description: "Use jackets, shirts, and shoes with lasting structure." },
  { value: "office", label: "Office", description: "Keep a clean silhouette for work and meetings." },
  { value: "date", label: "Date", description: "Use soft colors and materials around the face." },
  { value: "formal", label: "Formal", description: "Keep the look restrained for events and dress codes." },
  { value: "athleisure", label: "Athleisure", description: "Keep mobility while sharpening the overall impression." },
];

const bodyShapes: BodyShape[] = ["straight", "hourglass", "triangle", "inverted_triangle", "round"];
const fits: FitPreference[] = ["regular", "slim", "relaxed", "oversized"];
const exposures: ExposurePreference[] = ["low", "balanced", "bold"];

function formatLength(value?: string | null) {
  if (value === "short") return "Short length";
  if (value === "medium") return "Medium length";
  if (value === "long") return "Long length";
  return "-";
}

function profileReady(profile: StyleProfile | null) {
  return Boolean(
    profile?.heightCm &&
      profile.bodyShape &&
      profile.topSize &&
      profile.bottomSize &&
      profile.fitPreference &&
      profile.exposurePreference &&
      profile.bodyPhotoPath,
  );
}

function FieldPill({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Kicker>{label}</Kicker>
      <BodyText style={styles.strongText}>{value || "-"}</BodyText>
    </Card>
  );
}

function HairSelectionModal({
  groups,
  open,
  selectedVariantId,
  isLoading,
  error,
  onClose,
  onSelect,
}: {
  groups: HairstyleGenerationGroup[];
  open: boolean;
  selectedVariantId: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (generationId: string, variant: GeneratedVariant) => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <Stack>
            <Kicker>Hair selection</Kicker>
            <Heading>Choose a recent hairstyle result</Heading>
            {isLoading ? <BodyText>Loading recent hair recommendation results.</BodyText> : null}
            {error ? <BodyText style={styles.errorText}>{error}</BodyText> : null}
            {!isLoading && groups.length === 0 ? (
              <Card>
                <Stack>
                  <Heading>No hairstyle result available</Heading>
                  <BodyText>Create a 3x3 hairstyle board first, then continue to fashion styling.</BodyText>
                </Stack>
              </Card>
            ) : null}
            <Stack>
              {groups.map((group) => (
                <Card key={group.id}>
                  <Stack>
                    <Kicker>{new Date(group.createdAt).toLocaleString("ko-KR")} result</Kicker>
                    <BodyText>Face shape: {group.analysis.faceShape || "-"} · Status: {group.status}</BodyText>
                    {group.variants.map((variant) => {
                      const selectable = Boolean(variant.outputUrl);
                      const selected = selectedVariantId === variant.id;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          disabled={!selectable}
                          key={variant.id}
                          onPress={() => onSelect(group.id, variant)}
                          style={[styles.hairOption, selected ? styles.hairOptionSelected : null, !selectable ? styles.disabled : null]}
                        >
                          {variant.outputUrl ? (
                            <Image source={{ uri: variant.outputUrl }} style={styles.hairThumb} />
                          ) : (
                            <View style={styles.hairThumbPlaceholder}>
                              <BodyText>{variant.status === "failed" ? "Failed" : "Pending"}</BodyText>
                            </View>
                          )}
                          <View style={styles.hairCopy}>
                            <BodyText style={styles.strongText}>{variant.label}</BodyText>
                            <BodyText>{variant.reason}</BodyText>
                            <Cluster>
                              <Chip>{formatLength(variant.lengthBucket)}</Chip>
                              {selected ? <Chip tone="success">Selected</Chip> : null}
                            </Cluster>
                          </View>
                        </Pressable>
                      );
                    })}
                  </Stack>
                </Card>
              ))}
            </Stack>
            <Button variant="secondary" onPress={onClose}>Close</Button>
          </Stack>
        </View>
      </View>
    </Modal>
  );
}

export default function NewStylerScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const params = useLocalSearchParams<{ generationId?: string; variant?: string }>();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [generationId, setGenerationId] = useState(typeof params.generationId === "string" ? params.generationId : "");
  const [selectedVariantId, setSelectedVariantId] = useState(typeof params.variant === "string" ? params.variant : "");
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [genre, setGenre] = useState<FashionGenre>("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [hairGroups, setHairGroups] = useState<HairstyleGenerationGroup[]>([]);
  const [hairModalOpen, setHairModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingVariant, setIsLoadingVariant] = useState(Boolean(generationId && selectedVariantId));
  const [isLoadingHairList, setIsLoadingHairList] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>("Loading body profile...");

  const [heightCm, setHeightCm] = useState("");
  const [bodyShape, setBodyShape] = useState<BodyShape>("straight");
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [fitPreference, setFitPreference] = useState<FitPreference>("regular");
  const [colorPreference, setColorPreference] = useState("");
  const [exposurePreference, setExposurePreference] = useState<ExposurePreference>("balanced");
  const [avoidItems, setAvoidItems] = useState("");

  const stepOneReady = Boolean(profileReady(profile) && selectedVariant && generationId && selectedVariantId);
  const stepThreeReady = Boolean(sessionId && recommendation);
  const visibleStep: WizardStep = !stepOneReady ? 1 : currentStep;
  const selectedGenre = useMemo(() => genres.find((item) => item.value === genre) || genres[0], [genre]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (cancelled) return;
        setProfile(result.profile);
        setHeightCm(result.profile.heightCm ? String(result.profile.heightCm) : "");
        setBodyShape(result.profile.bodyShape || "straight");
        setTopSize(result.profile.topSize || "");
        setBottomSize(result.profile.bottomSize || "");
        setFitPreference(result.profile.fitPreference || "regular");
        setColorPreference(result.profile.colorPreference || "");
        setExposurePreference(result.profile.exposurePreference || "balanced");
        setAvoidItems(result.profile.avoidItems.join(", "));
        setMessage(profileReady(result.profile) ? "Body profile is ready." : "Complete body profile and choose a hairstyle.");
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load body profile.");
        }
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function loadVariant() {
      if (!generationId || !selectedVariantId) {
        setIsLoadingVariant(false);
        return;
      }

      setIsLoadingVariant(true);
      try {
        const result = await api.getGeneration(generationId);
        const variant =
          result.recommendationSet?.variants.find((item) => item.id === selectedVariantId) ||
          (result.selectedVariant as GeneratedVariant | null) ||
          null;
        if (!cancelled) {
          setSelectedVariant(variant);
          if (!variant) setMessage("Selected hairstyle was not found. Choose another result.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load selected hairstyle.");
        }
      } finally {
        if (!cancelled) setIsLoadingVariant(false);
      }
    }

    void loadVariant();
    return () => {
      cancelled = true;
    };
  }, [api, generationId, selectedVariantId]);

  const clearRecommendation = () => {
    setSessionId(null);
    setRecommendation(null);
  };

  const saveProfile = async () => {
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    setMessage(null);
    try {
      const result = await api.updateStyleProfile({
        heightCm,
        bodyShape,
        topSize,
        bottomSize,
        fitPreference,
        colorPreference,
        exposurePreference,
        avoidItems,
      });
      setProfile(result.profile);
      setMessage(profileReady(result.profile) ? "Body profile saved." : "Body profile saved. Add a body photo to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save body profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadBodyPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [3, 4],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (result.canceled) {
      setMessage("Body photo selection was cancelled.");
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri) {
      setMessage("Could not read the selected body photo.");
      return;
    }

    setIsUploadingPhoto(true);
    setMessage(null);
    try {
      const uploaded = await api.uploadBodyPhoto({
        uri: asset.uri,
        name: asset.fileName || `body-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      setProfile(uploaded.profile);
      setMessage("Body photo saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload body photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const loadHairList = async () => {
    setIsLoadingHairList(true);
    setMessage(null);
    try {
      const result = await api.getStylingHairstyles();
      setHairGroups(result.generations);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load recent hairstyle results.");
    } finally {
      setIsLoadingHairList(false);
    }
  };

  const openHairModal = () => {
    setHairModalOpen(true);
    if (hairGroups.length === 0 && !isLoadingHairList) {
      void loadHairList();
    }
  };

  const handleHairSelect = (nextGenerationId: string, variant: GeneratedVariant) => {
    setGenerationId(nextGenerationId);
    setSelectedVariantId(variant.id);
    setSelectedVariant(variant);
    clearRecommendation();
    setHairModalOpen(false);
    setCurrentStep(1);
  };

  const handleRecommend = async () => {
    if (!stepOneReady || isRecommending) return;
    setIsRecommending(true);
    setMessage(null);
    try {
      const result = await api.recommendStyling({ generationId, selectedVariantId, genre });
      if (!result.sessionId) {
        throw new Error("Fashion recommendation session was not created.");
      }
      setSessionId(result.sessionId);
      setRecommendation(result.recommendation);
      setSelectedVariant(result.selectedVariant);
      setProfile(result.profile);
      setCurrentStep(3);
      setMessage("Fashion recommendation is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create fashion recommendation.");
    } finally {
      setIsRecommending(false);
    }
  };

  const handleGenerate = async () => {
    if (!sessionId || isGenerating) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const result = await api.generateStyling(sessionId);
      router.push(`/styler/${result.sessionId || sessionId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate lookbook image.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Fashion Styler</Kicker>
        <Heading>Build a full-body outfit for the selected hairstyle</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <Kicker>Selected hairstyle</Kicker>
          <Heading>{isLoadingVariant ? "Loading hairstyle..." : selectedVariant?.label || "No hairstyle selected"}</Heading>
          <BodyText>{selectedVariant?.reason || "Choose one finished card from your recent 3x3 hairstyle results."}</BodyText>
          {selectedVariant?.outputUrl ? (
            <Image source={{ uri: selectedVariant.outputUrl }} style={styles.hairPreview} />
          ) : null}
          <Cluster>
            <FieldPill label="Length" value={formatLength(selectedVariant?.lengthBucket)} />
            <FieldPill label="Correction" value={selectedVariant?.correctionFocus || "-"} />
          </Cluster>
          <Button variant="secondary" onPress={openHairModal}>Choose or change hairstyle</Button>
        </Stack>
      </Panel>

      <Cluster>
        <Chip tone={visibleStep === 1 ? "accent" : stepOneReady ? "success" : "neutral"}>1 Profile</Chip>
        <Chip tone={visibleStep === 2 ? "accent" : stepThreeReady ? "success" : "neutral"}>2 Genre</Chip>
        <Chip tone={visibleStep === 3 ? "accent" : "neutral"}>3 Lookbook</Chip>
      </Cluster>

      {visibleStep === 1 ? (
        <Panel>
          <Stack>
            <Kicker>Profile check</Kicker>
            <Heading>{isLoadingProfile ? "Checking profile..." : stepOneReady ? "Recommendation ready" : "Complete profile details"}</Heading>
            <BodyText>The web flow requires height, body shape, sizes, fit preference, exposure preference, body photo, and a selected hairstyle.</BodyText>

            <TextField keyboardType="numeric" label="Height cm" onChangeText={setHeightCm} value={heightCm} />
            <TextField label="Top size" onChangeText={setTopSize} placeholder="M, 95, etc." value={topSize} />
            <TextField label="Bottom size" onChangeText={setBottomSize} placeholder="M, 30, etc." value={bottomSize} />
            <TextField label="Preferred colors" onChangeText={setColorPreference} placeholder="black, beige, denim" value={colorPreference} />
            <TextField label="Avoid items" onChangeText={setAvoidItems} placeholder="skinny jeans, bright neon" value={avoidItems} />

            <Kicker>Body shape</Kicker>
            <Cluster>
              {bodyShapes.map((value) => (
                <Button key={value} variant={bodyShape === value ? "primary" : "secondary"} onPress={() => setBodyShape(value)}>
                  {value}
                </Button>
              ))}
            </Cluster>

            <Kicker>Fit preference</Kicker>
            <Cluster>
              {fits.map((value) => (
                <Button key={value} variant={fitPreference === value ? "primary" : "secondary"} onPress={() => setFitPreference(value)}>
                  {value}
                </Button>
              ))}
            </Cluster>

            <Kicker>Exposure preference</Kicker>
            <Cluster>
              {exposures.map((value) => (
                <Button key={value} variant={exposurePreference === value ? "primary" : "secondary"} onPress={() => setExposurePreference(value)}>
                  {value}
                </Button>
              ))}
            </Cluster>

            {profile?.bodyPhotoUrl ? (
              <Image source={{ uri: profile.bodyPhotoUrl }} style={styles.bodyPreview} />
            ) : (
              <Card>
                <BodyText>A full-body reference photo is required for lookbook generation.</BodyText>
              </Card>
            )}

            <Button disabled={isUploadingPhoto} variant="secondary" onPress={uploadBodyPhoto}>
              {isUploadingPhoto ? "Uploading body photo..." : profile?.bodyPhotoPath ? "Replace body photo" : "Upload body photo"}
            </Button>
            <Button disabled={isSavingProfile} onPress={saveProfile}>
              {isSavingProfile ? "Saving profile..." : "Save profile"}
            </Button>
            <Button disabled={!stepOneReady || isLoadingProfile || isLoadingVariant} onPress={() => setCurrentStep(2)}>
              Next: choose fashion genre
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {visibleStep === 2 ? (
        <Panel>
          <Stack>
            <Kicker>Step 2</Kicker>
            <Heading>Choose a fashion genre</Heading>
            <BodyText>The recommendation uses the weekly fashion catalog for the selected genre.</BodyText>
            {genres.map((option) => (
              <Card key={option.value} style={genre === option.value ? styles.selectedCard : undefined}>
                <Stack>
                  <Heading>{option.label}</Heading>
                  <BodyText>{option.description}</BodyText>
                  <Button variant={genre === option.value ? "primary" : "secondary"} onPress={() => {
                    setGenre(option.value);
                    clearRecommendation();
                  }}>
                    {genre === option.value ? "Selected" : "Select"}
                  </Button>
                </Stack>
              </Card>
            ))}
            <Card>
              <Kicker>Selected direction</Kicker>
              <BodyText>{selectedGenre.label}: {selectedGenre.description}</BodyText>
            </Card>
            <Button variant="secondary" onPress={() => setCurrentStep(1)}>Previous</Button>
            <Button disabled={isRecommending || isGenerating} onPress={handleRecommend}>
              {isRecommending ? "Creating recommendation..." : "Create fashion recommendation"}
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {visibleStep === 3 ? (
        <Panel>
          <Stack>
            <Kicker>Step 3</Kicker>
            <Heading>{recommendation?.headline || "Fashion recommendation preview"}</Heading>
            <BodyText>{recommendation?.summary || "Create a recommendation before generating a lookbook image."}</BodyText>
            {recommendation ? (
              <Stack>
                <Cluster>
                  <FieldPill label="Genre" value={selectedGenre.label} />
                  <FieldPill label="Silhouette" value={recommendation.silhouette} />
                  <FieldPill label="Palette" value={recommendation.palette.join(", ")} />
                </Cluster>
                {recommendation.items.map((item) => (
                  <Card key={item.slot}>
                    <Kicker>{item.slot}</Kicker>
                    <Heading>{item.name}</Heading>
                    <BodyText>{item.description}</BodyText>
                    <BodyText>{item.color} · {item.fit} · {item.material}</BodyText>
                  </Card>
                ))}
                <Card>
                  <Kicker>Styling notes</Kicker>
                  {recommendation.stylingNotes.map((note) => (
                    <BodyText key={note}>{note}</BodyText>
                  ))}
                </Card>
              </Stack>
            ) : null}
            <Button variant="secondary" onPress={() => setCurrentStep(2)}>Previous</Button>
            <Button disabled={!stepThreeReady || isGenerating} onPress={handleGenerate}>
              {isGenerating ? "Generating lookbook..." : "Generate lookbook image"}
            </Button>
          </Stack>
        </Panel>
      ) : null}

      <HairSelectionModal
        error={message?.includes("recent hairstyle") ? message : null}
        groups={hairGroups}
        isLoading={isLoadingHairList}
        onClose={() => setHairModalOpen(false)}
        onSelect={handleHairSelect}
        open={hairModalOpen}
        selectedVariantId={selectedVariantId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hairPreview: {
    aspectRatio: 4 / 5,
    borderRadius: 8,
    width: 120,
  },
  bodyPreview: {
    aspectRatio: 3 / 4,
    borderRadius: 8,
    width: "100%",
  },
  selectedCard: {
    borderColor: "#181411",
    borderWidth: 2,
  },
  strongText: {
    color: "#181411",
    fontWeight: "800",
  },
  errorText: {
    color: "#b42318",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalPanel: {
    backgroundColor: "#f7f4ef",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    maxHeight: "88%",
    padding: 16,
  },
  hairOption: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 10,
  },
  hairOptionSelected: {
    borderColor: "#181411",
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.55,
  },
  hairThumb: {
    aspectRatio: 4 / 5,
    borderRadius: 8,
    width: 86,
  },
  hairThumbPlaceholder: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    width: 86,
  },
  hairCopy: {
    flex: 1,
    gap: 8,
  },
});
