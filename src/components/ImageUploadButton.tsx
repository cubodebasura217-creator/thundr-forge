import { Camera, Images } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/media";

export function ImageUploadButton({
  userId,
  folder,
  onUploaded,
  disabled,
  compact,
}: {
  userId: string;
  folder: string;
  onUploaded: (path: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handle(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      onUploaded(await uploadFile(userId, file, folder));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={libraryRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="secondary"
        size={compact ? "icon" : "sm"}
        disabled={disabled || uploading}
        onClick={() => libraryRef.current?.click()}
        aria-label="Choose photo"
      >
        <Images className="h-4 w-4" />
        {compact ? null : uploading ? "Uploading…" : "Choose photo"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size={compact ? "icon" : "sm"}
        disabled={disabled || uploading}
        onClick={() => cameraRef.current?.click()}
        aria-label="Take photo"
      >
        <Camera className="h-4 w-4" />
        {compact ? null : "Take photo"}
      </Button>
    </div>
  );
}