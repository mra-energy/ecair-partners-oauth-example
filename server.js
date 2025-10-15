import { config } from "dotenv";
import express from "express";
import session from "express-session";

config();

const app = express();
const PORT = 3000;

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

function generateRandomState() {
  return Math.random().toString(36).substring(2, 15);
}

app.get("/api/auth-status", (req, res) => {
  res.json({ isAuthenticated: !!req.session.accessToken });
});

app.get("/login", (req, res) => {
  const { authorize } = getClerkOAuthUrls();

  const state = generateRandomState();
  req.session.oauthState = state;

  const redirectUri = `${process.env.APP_BASE_URL}/callback`;
  const params = new URLSearchParams({
    client_id: process.env.CLERK_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "profile email",
    state: state,
  });

  const fullUrl = `${authorize}?${params}`;
  res.redirect(fullUrl);
});

app.get("/callback", async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    return res.redirect(
      `/error.html?type=auth&details=${encodeURIComponent(error)}`
    );
  }

  if (state !== req.session.oauthState) {
    return res.redirect("/error.html?type=csrf");
  }

  if (!code) {
    return res.redirect("/error.html?type=missing_code");
  }

  try {
    const tokenResponse = await fetch(getClerkOAuthUrls().token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLERK_OAUTH_CLIENT_ID,
        client_secret: process.env.CLERK_OAUTH_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.APP_BASE_URL}/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    req.session.accessToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token;

    res.redirect("/test-connection.html");
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.redirect(
      `/error.html?type=token_failed&details=${encodeURIComponent(
        error.message
      )}`
    );
  }
});

app.get("/api/test-connection", async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const apiResponse = await fetch(
      `${process.env.ECAIR_API_URL}/partner-api/v1/test-oauth`,
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
    res.status(500).json({ error: error.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
    }
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`\nEcair Partner OAuth Example`);
  console.log(`\nVisit http://localhost:${PORT} to get started\n`);
});
