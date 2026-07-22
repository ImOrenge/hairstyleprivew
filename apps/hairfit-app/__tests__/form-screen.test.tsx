import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { TextInput } from "react-native";
import { Button, TextField } from "../../../packages/ui-native/src/index";
import { FormScreen } from "../components/app/FormScreen";

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("FormScreen", () => {
  test("keeps form content scrollable and the submit footer inside the keyboard frame", async () => {
    const onSubmit = jest.fn();
    await render(
      <FormScreen
        footer={<Button onPress={onSubmit}>로그인</Button>}
        testID="test-form-screen"
      >
        <TextField label="이메일" value="hello@hairfit.test" />
      </FormScreen>,
    );

    const keyboardFrame = screen.getByTestId("test-form-screen");
    const submitButton = screen.getByRole("button", { name: "로그인" });

    expect(keyboardFrame).toBeOnTheScreen();
    expect(screen.getByTestId("test-form-screen-content")).toBeOnTheScreen();
    expect(screen.getByTestId("test-form-screen-footer")).toBeOnTheScreen();
    expect(screen.getByLabelText("이메일")).toBeOnTheScreen();

    await fireEvent.press(submitButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("focuses the requested invalid field after validation", async () => {
    const inputRef = React.createRef<TextInput>();
    const renderForm = (errorFocusRequest: number) => (
      <FormScreen
        errorFocusRef={inputRef}
        errorFocusRequest={errorFocusRequest}
        footer={<Button>계속</Button>}
      >
        <TextField error="이메일을 입력해 주세요." label="이메일" ref={inputRef} value="" />
      </FormScreen>
    );
    const view = await render(renderForm(0));
    const focus = jest.spyOn(inputRef.current!, "focus");

    await view.rerender(renderForm(1));

    expect(focus).toHaveBeenCalledTimes(1);
  });
});
