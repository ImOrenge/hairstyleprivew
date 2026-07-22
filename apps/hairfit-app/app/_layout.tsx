import { ClerkProvider } from "@clerk/clerk-expo";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { RoleNavigationScaffold } from "../components/app/RoleNavigationScaffold";
import { PushNotificationProvider } from "../components/app/PushNotificationProvider";
import { NetworkRecoveryProvider } from "../components/app/NetworkRecoveryProvider";
import { GenerationFlowProvider } from "../lib/generation-flow";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AppProviders() {
  return (
    <PushNotificationProvider>
      <NetworkRecoveryProvider>
        <GenerationFlowProvider>
          <RoleNavigationScaffold>
            <Stack screenOptions={{ headerShown: false }} />
          </RoleNavigationScaffold>
        </GenerationFlowProvider>
      </NetworkRecoveryProvider>
    </PushNotificationProvider>
  );
}

export default function CustomerLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar hidden={false} style="light" />
      <AppProviders />
    </ClerkProvider>
  );
}
