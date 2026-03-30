// Platform posting handlers for DabCloud Agent

// ─── LINKEDIN ───────────────────────────────────────────────────────────────
export async function postToLinkedIn(text, config) {
  const { access_token, person_urn } = config;

  const body = {
    author: `urn:li:person:${person_urn}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn post failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return { platform: "linkedin", post_id: data.id, url: `https://www.linkedin.com/feed/` };
}

// ─── TWITTER / X ────────────────────────────────────────────────────────────
export async function postToTwitter(text, config) {
  // Twitter v2 API with OAuth 1.0a
  // Each tweet in a thread posted sequentially
  const { api_key, api_secret, access_token, access_token_secret } = config;

  // Split thread by blank lines or "1/4" pattern
  const tweets = text
    .split(/\n\n+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 280);

  const { default: OAuth } = await import("oauth-1.0a");
  const { createHmac } = await import("crypto");

  const oauth = new OAuth({
    consumer: { key: api_key, secret: api_secret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });

  const token = { key: access_token, secret: access_token_secret };
  const postedIds = [];
  let replyToId = null;

  for (const tweet of tweets) {
    const url = "https://api.twitter.com/2/tweets";
    const body = { text: tweet };
    if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

    const authHeader = oauth.toHeader(
      oauth.authorize({ url, method: "POST" }, token)
    );

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twitter post failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    replyToId = data.data.id;
    postedIds.push(replyToId);

    // Small delay between tweets in a thread
    await new Promise((r) => setTimeout(r, 500));
  }

  return {
    platform: "twitter",
    tweet_ids: postedIds,
    url: `https://twitter.com/i/web/status/${postedIds[0]}`,
  };
}

// ─── FACEBOOK ───────────────────────────────────────────────────────────────
export async function postToFacebook(text, config) {
  const { page_access_token, page_id } = config;

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${page_id}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        access_token: page_access_token,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook post failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return {
    platform: "facebook",
    post_id: data.id,
    url: `https://facebook.com/${page_id}/posts/${data.id.split("_")[1]}`,
  };
}

// ─── INSTAGRAM ──────────────────────────────────────────────────────────────
// Note: Instagram requires an image URL to post. Text-only not supported.
// This posts a caption with a placeholder image or your brand image.
export async function postToInstagram(caption, config, imageUrl = null) {
  const { access_token, ig_user_id } = config;

  if (!imageUrl) {
    throw new Error(
      "Instagram requires an image URL. Set imageUrl or add image generation to the pipeline."
    );
  }

  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v18.0/${ig_user_id}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token,
      }),
    }
  );

  if (!containerRes.ok) throw new Error(`Instagram container failed: ${containerRes.status}`);
  const { id: creation_id } = await containerRes.json();

  // Step 2: Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v18.0/${ig_user_id}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id, access_token }),
    }
  );

  if (!publishRes.ok) throw new Error(`Instagram publish failed: ${publishRes.status}`);
  const data = await publishRes.json();

  return { platform: "instagram", media_id: data.id };
}

// ─── ROUTER ─────────────────────────────────────────────────────────────────
export async function postToPlatform(platform, text, config, extras = {}) {
  switch (platform) {
    case "linkedin":  return postToLinkedIn(text, config);
    case "twitter":   return postToTwitter(text, config);
    case "facebook":  return postToFacebook(text, config);
    case "instagram": return postToInstagram(text, config, extras.imageUrl);
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}
