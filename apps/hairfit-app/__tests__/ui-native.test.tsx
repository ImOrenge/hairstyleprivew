import { fireEvent, render, screen } from "@testing-library/react-native";
import React, { createRef } from "react";
import { type TextInput } from "react-native";
import {
  BodyText,
  Button,
  Heading,
  MetricTile,
  Row,
  shouldStackDenseNativeLayout,
  TextField,
} from "../../../packages/ui-native/src/index";

describe("native UI primitive contracts", () => {
  test("Button forwards accessibility props and blocks presses while loading", async () => {
    const onPress = jest.fn();

    await render(
      <Button
        accessibilityLabel="저장"
        loading
        loadingLabel="저장 중"
        onPress={onPress}
        testID="save-button"
      >
        저장
      </Button>,
    );

    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByText("저장 중")).toBeOnTheScreen();

    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("Button preserves a consumer-provided semantic role and selection state", async () => {
    await render(
      <Button accessibilityRole="tab" accessibilityState={{ selected: true }}>
        기록
      </Button>,
    );

    expect(screen.getByRole("tab", { name: "기록" })).toBeSelected();
  });

  test("TextField exposes its label, disabled state, helper, and error", async () => {
    const inputRef = createRef<TextInput>();
    const { rerender } = await render(
      <TextField
        editable={false}
        helper="이름을 입력해 주세요."
        label="이름"
        ref={inputRef}
        value=""
      />,
    );

    const disabledInput = screen.getByLabelText("이름");
    const helper = screen.getByText("이름을 입력해 주세요.");
    expect(disabledInput).toBeDisabled();
    expect(disabledInput.props.accessibilityHint).toBe("이름을 입력해 주세요.");
    expect(disabledInput.props["aria-describedby"]).toBe(helper.props.nativeID);
    expect(inputRef.current).not.toBeNull();

    await rerender(<TextField error="이름은 필수입니다." label="이름" ref={inputRef} value="" />);
    const invalidInput = screen.getByLabelText("이름");
    const error = screen.getByText("이름은 필수입니다.");
    expect(invalidInput.props["aria-errormessage"]).toBe(error.props.nativeID);
    expect(invalidInput.props["aria-invalid"]).toBe(true);
  });

  test("keeps core text scalable and stacks dense layouts at 200 percent font size", async () => {
    await render(
      <>
        <Heading>큰 제목</Heading>
        <BodyText>긴 설명</BodyText>
        <Button>두 줄이 되어도 보이는 버튼</Button>
        <TextField label="이메일" value="" />
        <MetricTile label="크레딧" value="100" />
        <Row>
          <BodyText>왼쪽 정보</BodyText>
          <BodyText>오른쪽 정보</BodyText>
        </Row>
      </>,
    );

    expect(screen.getByText("큰 제목").props.allowFontScaling).toBe(true);
    expect(screen.getByText("긴 설명").props.allowFontScaling).toBe(true);
    expect(screen.getByText("두 줄이 되어도 보이는 버튼").props.allowFontScaling).toBe(true);
    expect(screen.getByLabelText("이메일").props.allowFontScaling).toBe(true);
    expect(shouldStackDenseNativeLayout(2, 390)).toBe(true);
    expect(shouldStackDenseNativeLayout(1, 320)).toBe(true);
    expect(shouldStackDenseNativeLayout(1, 390)).toBe(false);
  });
});
