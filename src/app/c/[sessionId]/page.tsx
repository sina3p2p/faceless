import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/server/db";
import { filmSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { loadMessagesPage } from "@/server/services/showrunner/messages";
import { StoryChat } from "./components/story-chat";

export default async function StorySessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const serverSession = await getServerSession(authOptions);
  if (!serverSession?.user) redirect("/auth/signin");

  const { sessionId } = await params;
  const userId = (serverSession.user as { id: string }).id;

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== userId) redirect("/");

  const { messages, hasMore, oldestCreatedAt } = await loadMessagesPage(sessionId);

  return (
    <StoryChat
      sessionId={session.id}
      initialMessages={messages}
      initialHasMore={hasMore}
      initialOldestCreatedAt={oldestCreatedAt}
    />
  );
}
