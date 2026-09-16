import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const cached = cache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 12);
  if (!data?.signedUrl) return null;
  cache.set(path, data.signedUrl);
  return data.signedUrl;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    signedUrl(path).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

/** Uploads a base64 image into the user's private media space, returns its path. */
export async function uploadBase64Image(
  userId: string,
  base64: string,
  folder: string,
): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, bytes, { contentType: "image/png" });
  if (error) throw error;
  return path;
}

export async function uploadFile(userId: string, file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { contentType: file.type || "image/png" });
  if (error) throw error;
  return path;
}
