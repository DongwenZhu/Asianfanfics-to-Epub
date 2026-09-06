export async function fetchStoryInfo(storyUrl) {
  const response = await fetch(storyUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FanficKindle/1.0)"
    }
  });

  if (!response.ok) {
    throw new Error(
      "Asianfanfics returned status " + response.status
    );
  }

  const html = await response.text();

  const title = extractTitle(html);

  const chapters = extractChapters(
    html,
    storyUrl
  );

  return {
    title,
    chapter_count: chapters.length,
    chapters
  };
}

function extractTitle(html) {
  const match =
    html.match(/<title>([\s\S]*?)<\/title>/i);

  if (!match) {
    return "Untitled Story";
  }

  let title =
    decodeHtml(match[1]).trim();

  title =
    title
      .replace(/\s*-\s*Asianfanfics.*$/i, "")
      .trim();

  return title || "Untitled Story";
}

function extractChapters(html, storyUrl) {
  const base =
    new URL(storyUrl);

  const matches =
    [...html.matchAll(
      /href=["']([^"']*\/story\/view\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )];

  const found = [];

  const seen =
    new Set();

  for (const match of matches) {
    let href =
      decodeHtml(match[1]);

    const text =
      stripTags(
        decodeHtml(match[2])
      ).trim();

    if (!text) {
      continue;
    }

    const fullUrl =
      new URL(
        href,
        base.origin
      ).href;

    if (seen.has(fullUrl)) {
      continue;
    }

    seen.add(fullUrl);

    found.push({
      title: text,
      url: fullUrl
    });
  }

  return found;
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
