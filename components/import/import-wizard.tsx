"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, FileUp, Loader2, Minus, Plus, ScanText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { VoicePicker, type VoiceChoice } from "@/components/voice/voice-picker";
import { api } from "@/lib/api";
import { detectChapters, ensureStart, fallbackChapters } from "@/lib/book/chapters";
import { buildChunks } from "@/lib/book/chunk";
import { pagesInRange } from "@/lib/book/prepare";
import { formatDuration, CHARS_PER_SECOND } from "@/lib/book/progress-math";
import { suggestStartPage } from "@/lib/book/start";
import type { ChapterDraft } from "@/lib/book/types";
import { BUCKET } from "@/lib/env";
import { cleanPages } from "@/lib/pdf/clean";
import { extractPdf } from "@/lib/pdf/extract";
import { renderPageForOcr } from "@/lib/pdf/render";
import type { CleanPage, ExtractedPdf } from "@/lib/pdf/types";
import { createClient } from "@/lib/supabase/client";
import { loadVoicePrefs } from "@/lib/voice-prefs";
import { cn } from "@/lib/utils";
import { PageThumb } from "./page-thumb";

type Step = "file" | "pages" | "chapters" | "voice";
const STEPS: { id: Step; label: string }[] = [
  { id: "file", label: "PDF" },
  { id: "pages", label: "Pages" },
  { id: "chapters", label: "Chapters" },
  { id: "voice", label: "Voice" },
];

type Loaded = {
  bookId: string;
  pdf: PDFDocumentProxy;
  extracted: ExtractedPdf;
  clean: CleanPage[];
  bodyFontSize: number;
  needsOcr: number[];
};

/** Saves the original PDF to storage (skipped above 50 MB); returns its path, or undefined. */
async function uploadSource(bookId: string, file: File | null): Promise<string | undefined> {
  if (!file || file.size > 50 * 1024 * 1024) return undefined;
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return undefined;
  const path = `${u.user.id}/${bookId}/source.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: true });
  return error ? undefined : path;
}

const titleFromFile = (name: string) =>
  name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("file");
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 1, end: 1 });
  const [ocr, setOcr] = useState<Map<number, string>>(new Map());
  const [chapters, setChapters] = useState<ChapterDraft[]>([]);
  const [voice, setVoice] = useState<VoiceChoice | null>(null);
  const sourceFile = useRef<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Start on your default voice (Settings → Voices), if you set one.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const prefs = await loadVoicePrefs(supabase, data.user.id);
      const d = prefs.defaultVoice;
      if (d) setVoice((v) => v ?? { provider: d.provider, voiceId: d.voiceId, voiceName: d.voiceName, model: d.model });
    });
  }, []);

  async function openFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That isn't a PDF. Choose a .pdf file.");
      return;
    }
    const bookId = crypto.randomUUID();
    setBusy({ label: "Reading pages", done: 0, total: 1 });
    try {
      const data = await file.arrayBuffer();
      const { pdf, extracted } = await extractPdf(data.slice(0), (done, total) => setBusy({ label: "Reading pages", done, total }));
      const { pages, bodyFontSize, needsOcr } = cleanPages(extracted.pages);
      sourceFile.current = file;
      setDoc({ bookId, pdf, extracted, clean: pages, bodyFontSize, needsOcr });
      setTitle(extracted.meta.title && extracted.meta.title.length > 2 ? extracted.meta.title : titleFromFile(file.name));
      setAuthor(extracted.meta.author ?? "");
      setRange({ start: suggestStartPage(pages), end: extracted.pageCount });
      setOcr(new Map());
      setStep("pages");
    } catch (e) {
      console.error(e);
      toast.error("We couldn't read that PDF. It may be password-protected or damaged.");
    } finally {
      setBusy(null);
    }
  }

  const scansInRange = doc ? doc.needsOcr.filter((p) => p >= range.start && p <= range.end) : [];

  async function toChapters() {
    if (!doc) return;
    if (range.end < range.start) return toast.error("The last page comes before the first page.");
    const ocrMap = new Map(ocr);
    const todo = scansInRange.filter((p) => !ocrMap.has(p));
    const unreadable: number[] = [];
    try {
      for (let i = 0; i < todo.length; i++) {
        setBusy({ label: "Reading scanned pages with AI", done: i, total: todo.length });
        const { dataUrl, blank } = await renderPageForOcr(doc.pdf, todo[i]);
        if (blank) {
          ocrMap.set(todo[i], "");
          continue;
        }
        try {
          const { text } = await api<{ text: string }>("/api/ai/ocr", { method: "POST", json: { imageBase64: dataUrl } });
          ocrMap.set(todo[i], text);
        } catch {
          unreadable.push(todo[i]);
        }
      }
      setOcr(ocrMap);
      if (unreadable.length) {
        toast.warning(
          `${unreadable.length === 1 ? "Page" : "Pages"} ${unreadable.join(", ")} couldn't be read right now, so ${unreadable.length === 1 ? "it's" : "they're"} skipped.`,
          { description: "The free AI models are busy. Go back and press Find chapters again later to retry." },
        );
      }

      setBusy({ label: "Finding chapters", done: 0, total: 1 });
      const candidates = doc.clean.flatMap((p) => p.headings);
      let found = detectChapters({
        outline: doc.extracted.outline,
        candidates,
        bodyFontSize: doc.bodyFontSize,
        startPage: range.start,
        endPage: range.end,
      });
      if (!found && candidates.length) {
        try {
          const r = await api<{ chapters: ChapterDraft[] }>("/api/ai/chapters", {
            method: "POST",
            json: { startPage: range.start, endPage: range.end, candidates: candidates.slice(0, 800) },
          });
          if (r.chapters.length >= 2) found = r.chapters;
        } catch (e) {
          toast.message("Couldn't find chapters with AI, so the book is split into parts.", { description: (e as Error).message });
        }
      }
      setChapters(ensureStart(found ?? fallbackChapters(range.start, range.end), range.start));
      setStep("chapters");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const built = useMemo(() => {
    if (!doc || !chapters.length) return null;
    return buildChunks(pagesInRange(doc.clean, range.start, range.end, ocr), chapters);
  }, [doc, chapters, range, ocr]);
  const totalChars = built?.chunks.reduce((s, c) => s + c.text.length, 0) ?? 0;

  async function create() {
    if (!doc || !built || !voice) return;
    if (!built.chunks.length) return toast.error("There's no text to read in those pages.");
    setBusy({ label: "Saving your book", done: 0, total: 1 });
    try {
      // Keep a copy of the PDF (only now, so abandoned imports leave nothing behind).
      const path = await uploadSource(doc.bookId, sourceFile.current);
      const { id } = await api<{ id: string }>("/api/books", {
        method: "POST",
        json: {
          id: doc.bookId,
          title: title.trim() || "Untitled",
          author: author.trim() || undefined,
          pageCount: doc.extracted.pageCount,
          startPage: range.start,
          endPage: range.end,
          sourcePath: path,
          voice: { provider: voice.provider, voiceId: voice.voiceId, voiceName: voice.voiceName, model: voice.model },
          chapters: built.chapters,
          chunks: built.chunks,
        },
      });
      router.push(`/book/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const back = () => setStep(STEPS[Math.max(0, stepIdx - 1)].id);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 md:py-10">
      <header className="flex items-center gap-3">
        {stepIdx > 0 && (
          <Button variant="ghost" size="icon-lg" onClick={back} aria-label="Back" disabled={Boolean(busy)}>
            <ArrowLeft />
          </Button>
        )}
        <h1 className="font-serif text-3xl sm:text-4xl">Add a book</h1>
      </header>

      <ol className="mt-6 flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex-1" aria-current={s.id === step ? "step" : undefined}>
            <div className={cn("h-1 rounded-full", i <= stepIdx ? "bg-foil" : "bg-muted")} />
            <span className={cn("mt-2 block text-xs", i === stepIdx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {busy && (
        <div className="mt-8 rounded-xl border border-border bg-card p-5" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {busy.label}
            {busy.total > 1 && (
              <span className="tabular ml-auto font-mono text-xs text-muted-foreground">
                {busy.done} / {busy.total}
              </span>
            )}
          </p>
          {busy.total > 1 && <Progress value={(busy.done / busy.total) * 100} className="mt-3" />}
        </div>
      )}

      {!busy && step === "file" && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) openFile(f);
            }}
            className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/60 p-8 text-center transition-colors hover:border-foil hover:bg-card"
          >
            <FileUp className="size-8 text-foil" aria-hidden />
            <span className="font-serif text-2xl">Choose a PDF</span>
            <span className="max-w-xs text-sm text-muted-foreground">or drop it here. It&apos;s read on your device first, so nothing is sent until you choose a voice.</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = "";
            }}
          />
        </section>
      )}

      {!busy && step === "pages" && doc && (
        <section className="mt-8 flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="author">Author</Label>
              <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" className="h-12 text-base" />
            </div>
          </div>

          <div>
            <h2 className="font-medium">Which pages should be read?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We skipped the cover and contents. Change it if the book starts somewhere else.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(["start", "end"] as const).map((which) => {
              const n = range[which];
              const set = (v: number) =>
                setRange((r) => ({ ...r, [which]: Math.min(doc.extracted.pageCount, Math.max(1, Math.round(v) || 1)) }));
              const snippet = doc.clean.find((p) => p.page === n)?.paragraphs.join(" ").slice(0, 90);
              return (
                <div key={which} className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{which === "start" ? "Start at" : "Stop after"}</span>
                  <PageThumb pdf={doc.pdf} page={n} docKey={doc.bookId} />
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-lg" className="size-11" onClick={() => set(n - 1)} aria-label={`Previous ${which} page`}>
                      <Minus />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={n}
                      min={1}
                      max={doc.extracted.pageCount}
                      onChange={(e) => set(Number(e.target.value))}
                      className="tabular h-11 text-center font-mono text-base"
                      aria-label={which === "start" ? "Start page" : "End page"}
                    />
                    <Button variant="outline" size="icon-lg" className="size-11" onClick={() => set(n + 1)} aria-label={`Next ${which} page`}>
                      <Plus />
                    </Button>
                  </div>
                  <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{snippet || "No text on this page"}</p>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            {range.end - range.start + 1} of {doc.extracted.pageCount} pages.
            {scansInRange.length > 0 && (
              <span className="mt-2 flex items-start gap-2 text-foreground">
                <ScanText className="mt-0.5 size-4 shrink-0 text-foil" aria-hidden />
                {scansInRange.length} {scansInRange.length === 1 ? "page is a scan" : "pages are scans"} and will be read with AI first.
              </span>
            )}
          </p>
          <Button className="h-12 text-base" onClick={toChapters}>
            Find chapters
          </Button>
        </section>
      )}

      {!busy && step === "chapters" && built && (
        <section className="mt-8 flex flex-col gap-5">
          <div>
            <h2 className="font-medium">
              {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} · about {formatDuration(totalChars / CHARS_PER_SECOND)} of listening
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Rename them, or remove one to merge it into the chapter before.</p>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {chapters.map((c, i) => (
              <li key={`${c.page}-${i}`} className="flex items-center gap-3 px-3 py-2">
                <span className="tabular w-12 shrink-0 font-mono text-xs text-muted-foreground">p. {c.page}</span>
                <Input
                  value={c.title}
                  onChange={(e) => setChapters((cs) => cs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="h-11 border-transparent bg-transparent text-base shadow-none focus-visible:border-input"
                  aria-label={`Chapter ${i + 1} title`}
                />
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11 shrink-0"
                  disabled={chapters.length === 1}
                  onClick={() => setChapters((cs) => ensureStart(cs.filter((_, j) => j !== i), range.start))}
                  aria-label={`Remove chapter ${c.title}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button className="h-12 text-base" onClick={() => setStep("voice")}>
            Choose a voice
          </Button>
        </section>
      )}

      {!busy && step === "voice" && built && (
        <section className="mt-8 flex flex-col gap-6">
          <VoicePicker
            value={voice}
            onChange={setVoice}
            bookChars={totalChars}
            firstChapterChars={built.chapters[0]?.charCount ?? 0}
          />
          <Button className="h-12 text-base" disabled={!voice} onClick={create}>
            {voice ? `Make my audiobook with ${voice.voiceName}` : "Pick a voice to continue"}
          </Button>
        </section>
      )}
    </div>
  );
}
