import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useGenerationFlow } from "../lib/generation-flow";

export default function UploadScreen() {
  const router = useRouter();
  const flow = useGenerationFlow();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [message, setMessage] = useState("Choose a clear front-facing portrait.");

  const pickImage = async () => {
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
      setMessage("Image selection was cancelled.");
      return;
    }

    const asset = result.assets[0];
    const base64 = asset?.base64;
    if (!asset?.uri || !base64) {
      setMessage("Could not read the selected image.");
      return;
    }

    const mimeType = asset.mimeType || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;
    flow.setImageDataUrl(dataUrl);
    flow.setDraft(null);
    setImageUri(asset.uri);
    setMessage("Portrait is ready. Continue to create the 3x3 recommendation board.");
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Upload</Kicker>
        <Heading>Select a portrait</Heading>
        <BodyText>The mobile picker stores an in-memory data URL and sends it to the existing recommendation API.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <BodyText>No preview yet</BodyText>}
          </View>
          <Card>
            <BodyText>{message}</BodyText>
          </Card>
          <Button onPress={pickImage}>Choose photo</Button>
          <Button disabled={!flow.imageDataUrl} onPress={() => router.push("/generate")}>
            Continue to generation
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>Back</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
