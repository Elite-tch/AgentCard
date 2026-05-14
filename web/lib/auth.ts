import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { clientPromise } from "@/lib/backend/db";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT),
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

const mongoClient = await clientPromise;

export const auth = betterAuth({
  database: mongodbAdapter(mongoClient.db()),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await transporter.sendMail({
          to: email,
          from: process.env.EMAIL_FROM!,
          subject: "Login to AgentCard",
          text: `Click the link to login: ${url}`,
        });
      },
    }),
  ],
});
