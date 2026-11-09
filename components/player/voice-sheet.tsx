"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VoicePicker, type VoiceChoice } from "@/components/voice/voice-picker";
import { usePlayer, usePlayerStore } from "./player-provider";

/** Change the voice from the next part of the book on. */
export function VoiceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const chunks = usePlayer((s) => s.chunks);
  const chapters = usePlayer((s) => s.chapters);
  const pos = usePlayer((s) => s.pos.chunkIdx);
  const [choice, setChoice] = useState<VoiceChoice | null>(null);
  const [saving, setSaving] = useState(false);
  if (!book || !store) return null;
  // Everything after the part you're on is (re)made in the new voice.
  const remaining = chunks.filter((c) => c.idx > pos || (c.idx === pos && c.status !== "ready")).reduce((s, c) => s + c.char_count, 0);
  const chapter = store.chapterOf(pos) ?? chapters[0];

  async function save() {
    if (!choice || !store) return;
    setSaving(true);
    try {
      await store.switchVoice(choice);
      toast.success(`Switched to ${choice.voiceName}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-safe mx-auto max-h-[92dvh] max-w-2xl rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl font-normal">Change voice</SheetTitle>
          <SheetDescription>
            Now reading with {book.voice_name}. The short part playing now (about a minute) finishes, then the rest of the book switches to the new voice.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          <VoicePicker value={choice} onChange={setChoice} bookChars={remaining} firstChapterChars={chapter?.charCount ?? 0} />
          <Button className="h-12 text-base" disabled={!choice || saving} onClick={save}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {choice ? `Use ${choice.voiceName}` : "Pick a voice"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
