"use client";

import { useGenerationStore } from "../../store/useGenerationStore";

const styleOptions = [
  { value: "straight", label: "Straight" },
  { value: "perm", label: "Perm" },
  { value: "bangs", label: "Bangs" },
  { value: "layered", label: "Layered" },
] as const;

const colorOptions = ["black", "brown", "ash", "blonde", "red"];

export function StyleSelector() {
  const { selectedOptions, setOptions } = useGenerationStore((state) => ({
    selectedOptions: state.selectedOptions,
    setOptions: state.setOptions,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">성별</p>
        <div className="flex gap-2">
          {(["female", "male", "unisex"] as const).map((gender) => (
            <button
              key={gender}
              onClick={() => setOptions({ gender })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                selectedOptions.gender === gender
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {gender}
            </button>
          ))}
        </div>
      </div>

      <label className="grid gap-2 text-sm">
        <span className="font-semibold">기장</span>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2"
          value={selectedOptions.length}
          onChange={(event) =>
            setOptions({
              length: event.target.value as "short" | "medium" | "long",
            })
          }
        >
          <option value="short">Short</option>
          <option value="medium">Medium</option>
          <option value="long">Long</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-semibold">스타일</span>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2"
          value={selectedOptions.style}
          onChange={(event) =>
            setOptions({
              style: event.target.value as "straight" | "perm" | "bangs" | "layered",
            })
          }
        >
          {styleOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-2 text-sm font-semibold">색상</p>
        <div className="flex flex-wrap gap-2">
          {colorOptions.map((color) => (
            <button
              key={color}
              onClick={() => setOptions({ color })}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                selectedOptions.color === color
                  ? "border-black bg-black text-white"
                  : "border-gray-300 bg-white"
              }`}
            >
              {color}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
