import { useSignUp } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errors" in error) {
    const first = (error as { errors?: Array<{ message?: string }> }).errors?.[0]?.message;
    if (first) return first;
  }
  return "Sign up failed.";
}

export default function SignupScreen() {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const completeSession = async (sessionId: string | null | undefined) => {
    if (!sessionId || !setActive) {
      setMessage("Signup is not complete yet.");
      return;
    }

    await setActive({ session: sessionId });
    router.replace("/onboarding");
  };

  const createAccount = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: name.trim() || undefined,
      });

      if (result.status === "complete") {
        await completeSession(result.createdSessionId);
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setNeedsCode(true);
      setMessage("Enter the verification code sent to your email.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await completeSession(result.createdSessionId);
        return;
      }

      setMessage("Verification is not complete yet.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Signup</Kicker>
        <Heading>Create a HairFit account</Heading>
        <BodyText>After Clerk signup, the mobile app sends you through the HairFit onboarding API.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <TextField label="Name" onChangeText={setName} placeholder="Your name" value={name} />
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
          {needsCode ? (
            <TextField
              autoCapitalize="none"
              keyboardType="number-pad"
              label="Email code"
              onChangeText={setCode}
              placeholder="123456"
              value={code}
            />
          ) : null}
          {message ? <BodyText>{message}</BodyText> : null}
          {needsCode ? (
            <Button disabled={!code.trim() || pending} onPress={verifyCode}>
              {pending ? "Verifying..." : "Verify email"}
            </Button>
          ) : (
            <Button disabled={!email.trim() || !password || pending} onPress={createAccount}>
              {pending ? "Creating..." : "Create account"}
            </Button>
          )}
          <Button variant="secondary" onPress={() => router.push("/login")}>
            Sign in instead
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
