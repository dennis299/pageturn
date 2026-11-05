import type { Metadata } from "next";
import { PlayerScreen } from "@/components/player/player-screen";

export const metadata: Metadata = { title: "Listening" };

export default async function BookPage(props: PageProps<"/book/[id]">) {
  const { id } = await props.params;
  return <PlayerScreen bookId={id} />;
}
