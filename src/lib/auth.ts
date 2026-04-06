import { NextAuthOptions } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { AUTH } from "@/lib/constants";

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db) as NextAuthOptions["adapter"],
  providers: [
    ...(AUTH.google.clientId
      ? [
          GoogleProvider({
            clientId: AUTH.google.clientId,
            clientSecret: AUTH.google.clientSecret,
          }),
        ]
      : []),
    ...(AUTH.github.clientId
      ? [
          GitHubProvider({
            clientId: AUTH.github.clientId,
            clientSecret: AUTH.github.clientSecret,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const existing = await db.query.users.findFirst({
          where: eq(users.email, credentials.email),
        });

        if (existing) {
          return { id: existing.id, email: existing.email, name: existing.name };
        }

        const [newUser] = await db
          .insert(users)
          .values({
            email: credentials.email,
            name: credentials.email.split("@")[0],
          })
          .returning();

        return { id: newUser.id, email: newUser.email, name: newUser.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
