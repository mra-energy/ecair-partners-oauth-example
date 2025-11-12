import { config } from "dotenv";
import express, { Request, Response } from "express";
import session from "express-session";
import { z } from "zod";

config();

const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

const OAuthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const app = express();
const PORT = 3000;

declare module "express-session" {
  interface SessionData {
    accessToken?: string;
    refreshToken?: string;
    oauthState?: string;
  }
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function getClerkOAuthUrls() {
  const clerkDomain = process.env.ECAIR_CLERK_DOMAIN;
  return {
    authorize: `https://${clerkDomain}/oauth/authorize`,
    token: `https://${clerkDomain}/oauth/token`,
    userinfo: `https://${clerkDomain}/oauth/userinfo`,
    token_info: `https://${clerkDomain}/oauth/token_info`,
  };
}

function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15);
}

app.get("/api/auth-status", (req: Request, res: Response) => {
  res.json({ isAuthenticated: !!req.session.accessToken });
});

app.get("/login", (req: Request, res: Response) => {
  const { authorize } = getClerkOAuthUrls();
  const state = generateRandomState();
  req.session.oauthState = state;

  const redirectUri = `${process.env.APP_BASE_URL}/callback`;
  const params = new URLSearchParams({
    client_id: process.env.CLERK_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "profile email",
    state: state,
  });

  const fullUrl = `${authorize}?${params}`;
  res.redirect(fullUrl);
});

app.get("/callback", async (req: Request, res: Response) => {
  const queryResult = OAuthCallbackQuerySchema.safeParse(req.query);

  if (!queryResult.success) {
    return res.redirect("/callback.html?type=missing_code");
  }

  const { code, error, state } = queryResult.data;

  if (error) {
    return res.redirect(
      `/callback.html?type=auth&details=${encodeURIComponent(error)}`
    );
  }

  if (state !== req.session.oauthState) {
    return res.redirect("/callback.html?type=csrf");
  }

  if (!code) {
    return res.redirect("/callback.html?type=missing_code");
  }

  try {
    const tokenResponse = await fetch(getClerkOAuthUrls().token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLERK_OAUTH_CLIENT_ID!,
        client_secret: process.env.CLERK_OAUTH_CLIENT_SECRET!,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.APP_BASE_URL}/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const rawTokenData = await tokenResponse.json();
    const tokenData = OAuthTokenResponseSchema.parse(rawTokenData);

    req.session.accessToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token;

    res.redirect("/");
  } catch (error) {
    console.error("OAuth callback error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.redirect(
      `/callback.html?type=token_failed&details=${encodeURIComponent(
        errorMessage
      )}`
    );
  }
});

app.get("/api/test-connection", async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const apiResponse = await fetch(
      `${process.env.ECAIR_API_URL}/v1/credit/oauth-test`,
      {
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
      }
    );

    if (!apiResponse.ok) {
      throw new Error(
        `API call failed: ${apiResponse.status} ${apiResponse.statusText}`
      );
    }

    const testData = await apiResponse.json();
    res.json(testData);
  } catch (error) {
    console.error("Connection test error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: errorMessage });
  }
});

app.get("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
    }
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Ecair Partner OAuth Example`);
  console.log(`📍 Server running at http://localhost:${PORT}`);
  console.log(`\n⚙️  Setup checklist:`);
  console.log(`   1. Copy .env.example to .env and configure your credentials`);
  console.log(`   2. Create an OAuth application in your Clerk Dashboard`);
  console.log(`   3. Add http://localhost:${PORT}/callback as a redirect URI`);
  console.log(`\n📖 Visit http://localhost:${PORT} to get started\n`);
});
