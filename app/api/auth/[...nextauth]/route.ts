import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { createClient } from "@/lib/supabase/server"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password required")
        }

        const supabase = await createClient()
        const { data: user, error } = await supabase
          .from("User")
          .select(`
            *,
            buyerProfile:BuyerProfile(*),
            dealer:Dealer(*),
            affiliate:Affiliate(*)
          `)
          .eq("email", credentials.email)
          .single()

        if (error || !user || !user.passwordHash) {
          console.error("[Auth] User not found or no password:", error)
          throw new Error("Invalid credentials")
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!isValid) {
          throw new Error("Invalid credentials")
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id as string
        ;(session.user as any).role = token.role as string
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)

export async function GET(...args: Parameters<typeof handler>) {
  try {
    return await handler(...args)
  } catch (error) {
    console.error("[NextAuth GET] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof handler>) {
  try {
    return await handler(...args)
  } catch (error) {
    console.error("[NextAuth POST] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
