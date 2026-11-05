import type { Metadata } from "next";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata: Metadata = { title: "Add a book" };

export default function ImportPage() {
  return <ImportWizard />;
}
