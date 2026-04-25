"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import type { StyleProfile } from "../../lib/fashion-types";

interface StyleProfileResponse {
  profile?: StyleProfile;
  error?: string;
}

const initialProfile: StyleProfile = {
  userId: "",
  heightCm: null,
  bodyShape: "straight",
  topSize: "",
  bottomSize: "",
  fitPreference: "regular",
  colorPreference: "",
  exposurePreference: "balanced",
  avoidItems: [],
  bodyPhotoPath: null,
  bodyPhotoUrl: null,
  bodyPhotoConsentAt: null,
  updatedAt: null,
};

const bodyShapeOptions = [
  ["straight", "Straight"],
  ["hourglass", "Hourglass"],
  ["triangle", "Triangle"],
  ["inverted_triangle", "Inverted triangle"],
  ["round", "Round"],
] as const;

const fitOptions = [
  ["regular", "Regular"],
  ["slim", "Slim"],
  ["relaxed", "Relaxed"],
  ["oversized", "Oversized"],
] as const;

const exposureOptions = [
  ["low", "Low"],
  ["balanced", "Balanced"],
  ["bold", "Bold"],
] as const;

export function StyleProfileForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<StyleProfile>(initialProfile);
  const [avoidText, setAvoidText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoading(true);
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
      if (!active) return;

      if (response.ok && data.profile) {
        setProfile({ ...initialProfile, ...data.profile });
        setAvoidText((data.profile.avoidItems || []).join(", "));
        setError(null);
      } else {
        setError(data.error || "Failed to load style profile.");
      }
      setIsLoading(false);
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const update = (patch: Partial<StyleProfile>) => {
    setProfile((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/style-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heightCm: profile.heightCm,
        bodyShape: profile.bodyShape,
        topSize: profile.topSize,
        bottomSize: profile.bottomSize,
        fitPreference: profile.fitPreference,
        colorPreference: profile.colorPreference,
        exposurePreference: profile.exposurePreference,
        avoidItems: avoidText,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setAvoidText((data.profile.avoidItems || []).join(", "));
      setMessage("Body profile saved.");
    } else {
      setError(data.error || "Failed to save body profile.");
    }
    setIsSaving(false);
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/style-profile/body-photo", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setAvoidText((data.profile.avoidItems || []).join(", "));
      setMessage("Full-body reference photo saved.");
    } else {
      setError(data.error || "Failed to upload body photo.");
    }
    setIsUploading(false);
  };

  const handleDeletePhoto = async () => {
    setIsUploading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/style-profile/body-photo", { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setMessage("Full-body reference photo removed.");
    } else {
      setError(data.error || "Failed to remove body photo.");
    }
    setIsUploading(false);
  };

  const ready =
    Boolean(profile.heightCm) &&
    Boolean(profile.bodyShape) &&
    Boolean(profile.topSize) &&
    Boolean(profile.bottomSize) &&
    Boolean(profile.fitPreference) &&
    Boolean(profile.exposurePreference) &&
    Boolean(profile.bodyPhotoPath);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Body Style Profile</h3>
          <p className="mt-1 text-sm text-gray-600">
            Saved body specs and a full-body reference photo are used for fashion lookbook generation.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {ready ? "Ready" : "Incomplete"}
        </span>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-500">Loading style profile...</div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-3">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
              {profile.bodyPhotoUrl ? (
                <img src={profile.bodyPhotoUrl} alt="Full body reference" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  Upload a full-body reference photo for outfit generation.
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? "Uploading..." : profile.bodyPhotoPath ? "Replace Photo" : "Upload Photo"}
              </Button>
              {profile.bodyPhotoPath ? (
                <Button type="button" variant="ghost" onClick={handleDeletePhoto} disabled={isUploading}>
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-stone-500">
              This reference is stored privately and used only through signed URLs for your styling sessions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Height (cm)
              <input
                type="number"
                min={120}
                max={230}
                value={profile.heightCm ?? ""}
                onChange={(event) => update({ heightCm: event.target.value ? Number(event.target.value) : null })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Body shape
              <select
                value={profile.bodyShape ?? "straight"}
                onChange={(event) => update({ bodyShape: event.target.value as StyleProfile["bodyShape"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {bodyShapeOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Top size
              <input
                value={profile.topSize ?? ""}
                onChange={(event) => update({ topSize: event.target.value })}
                placeholder="S, M, 95, 100..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Bottom size
              <input
                value={profile.bottomSize ?? ""}
                onChange={(event) => update({ bottomSize: event.target.value })}
                placeholder="26, 28, M..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Fit preference
              <select
                value={profile.fitPreference ?? "regular"}
                onChange={(event) => update({ fitPreference: event.target.value as StyleProfile["fitPreference"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {fitOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Exposure preference
              <select
                value={profile.exposurePreference ?? "balanced"}
                onChange={(event) => update({ exposurePreference: event.target.value as StyleProfile["exposurePreference"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {exposureOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700 sm:col-span-2">
              Preferred colors
              <input
                value={profile.colorPreference ?? ""}
                onChange={(event) => update({ colorPreference: event.target.value })}
                placeholder="black, ivory, cool grey..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700 sm:col-span-2">
              Avoid items
              <input
                value={avoidText}
                onChange={(event) => setAvoidText(event.target.value)}
                placeholder="hats, skinny jeans, short skirts..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Body Profile"}
              </Button>
              {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
