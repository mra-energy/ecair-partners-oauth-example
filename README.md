# Ecair Partner OAuth Example

A demonstration application showing how partners can integrate with the Ecair API using OAuth 2.0 authentication via Clerk.

Built with TypeScript, Express, and pnpm.

## 📋 Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- A user account on https://app.ecair.eco
- Access to the Ecair Partner API

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values

### 3. Run the Application

**Development mode** (with hot reload):

```bash
pnpm dev
```

The application will be available at **http://localhost:3000**

## 📝 OAuth Flow Overview

```
1. User clicks "Login"
2. App redirects to our OAuth2 authorization URL (powered by Clerk)
3. User authenticates and accepts consent
4. Clerk redirects to /callback?code=xxx&state=xxx
5. Your App exchanges authorization code for access token
6. Your App stores tokens in session
7. Your App calls Ecair Partner API with Bearer token
8. API returns user data
```

## 🔄 Token Refresh

This demo uses the `access_token` for API calls. In production, you should:

1. Store the `refresh_token` securely
2. Monitor `access_token` expiration (typically 1 hour)
3. Use the refresh token to obtain new access tokens

Example refresh token request:

```typescript
const response = await fetch(`https://${ECAIR_CLERK_DOMAIN}/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored_refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});
```

## OAuth2 Server Discovery Endpoint

The OAuth2 server discovery endpoint (used for OAuth2 configuration) is:
https://clerk.ecair.eco/.well-known/oauth-authorization-server
