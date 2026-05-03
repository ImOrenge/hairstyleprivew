import { useSSO, useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errors" in error) {
    const first = (error as { errors?: Array<{ message?: string }> }).errors?.[0]?.message;
    if (first) return first;
  }
  return "Sign in failed.";
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
        return;
      }

      setMessage("This sign-in method needs an additional step. Use the web login once, then return to mobile.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const signInWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    setMessage(null);

    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        router.replace("/");
        return;
      }

      setMessage("Google sign-in was cancelled before a session was created.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Login</Kicker>
        <Heading>Sign in to HairFit</Heading>
        <BodyText>Use the same Clerk account as the web app. Mobile API calls attach the Clerk session token.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <Button disabled={googlePending || pending} variant="secondary" onPress={signInWithGoogle}>
            {googlePending ? "Opening Google..." : "Continue with Google"}
          </Button>
          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <TextField
            label="Password"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            value={password}
          />
          {message ? <BodyText>{message}</BodyText> : null}
          <Button disabled={!email.trim() || !password || pending} onPress={submit}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
          <Button variant="secondary" onPress={() => router.push("/signup")}>
            Create account
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
