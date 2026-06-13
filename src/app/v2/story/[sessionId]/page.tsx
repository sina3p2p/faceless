import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";
import { rowsToClientMessages } from "@/server/services/showrunner/messages";
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

  if (!session || session.userId !== userId) redirect("/v2/story");

  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId))
    .orderBy(asc(filmSessionMessages.createdAt));

  const initialMessages = rowsToClientMessages(rows);

  return <StoryChat sessionId={session.id} initialMessages={initialMessages} />;
}
