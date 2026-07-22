import type { RefObject } from "react";
import type { TextInput } from "react-native";
import {
  BodyText,
  Button,
  Heading,
  Panel,
  Stack,
  TextField,
} from "@hairfit/ui-native";
import {
  authSecondFactorInstruction,
  type AuthSecondFactorOption,
} from "../../lib/auth-second-factor";

export interface AuthSecondFactorPanelProps {
  code: string;
  codeInputRef?: RefObject<TextInput | null>;
  error?: string;
  option: AuthSecondFactorOption;
  options: AuthSecondFactorOption[];
  pending?: boolean;
  onCancel(): void;
  onChangeCode(value: string): void;
  onSelect(option: AuthSecondFactorOption): void;
}

export function AuthSecondFactorPanel({
  code,
  codeInputRef,
  error,
  onCancel,
  onChangeCode,
  onSelect,
  option,
  options,
  pending = false,
}: AuthSecondFactorPanelProps) {
  return (
    <Panel>
      <Stack>
        <Heading>추가 인증</Heading>
        <BodyText>{authSecondFactorInstruction(option)}</BodyText>
        {options.length > 1 ? (
          <Stack gap={8}>
            <BodyText>다른 인증 방법</BodyText>
            {options.map((candidate) => (
              <Button
                accessibilityState={{ selected: candidate.strategy === option.strategy }}
                disabled={pending}
                key={candidate.strategy}
                onPress={() => onSelect(candidate)}
                variant={candidate.strategy === option.strategy ? "primary" : "secondary"}
              >
                {candidate.label}
              </Button>
            ))}
          </Stack>
        ) : null}
        <TextField
          autoCapitalize="none"
          error={error}
          keyboardType={option.strategy === "backup_code" ? "default" : "number-pad"}
          label={option.label}
          onChangeText={onChangeCode}
          placeholder={option.strategy === "backup_code" ? "백업 코드" : "인증 코드"}
          ref={codeInputRef}
          value={code}
        />
        <Button disabled={pending} onPress={onCancel} variant="secondary">
          로그인부터 다시
        </Button>
      </Stack>
    </Panel>
  );
}
