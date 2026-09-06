export async function fetchStoryInfo(storyUrl, cookie) {
  const response = await fetch(storyUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FanficKindle/1.0)",
      "Cookie": cookie
    }
  });

  if (!response.ok) {
    throw new Error(
      "Asianfanfics returned status " + response.status
    );
  }

  const html = await response.text();

  if (html.includes("Are you over 18?")) {
    throw new Error(
      "Asianfanfics login session is not active."
    );
  }

  const title =
    extractTitle(html);

  const chapters =
    extractChapters(
      html,
      storyUrl
    );

  return {
    title,
    chapter_count:
      chapters.length,
    chapters
  };
}


function extractTitle(html) {
  const match =
    html.match(
      /<title>([\s\S]*?)<\/title>/i
    );

  if (!match) {
    return "Untitled Story";
  }

  let title =
    decodeHtml(
      match[1]
    ).trim();

  title =
    title
      .replace(
        /\s*-\s*Asianfanfics\s*$/i,
        ""
      )
      .trim();

  return (
    title ||
    "Untitled Story"
  );
}


function extractChapters(
  html,
  storyUrl
) {
  const story =
    new URL(storyUrl);

  const pathParts =
    story.pathname
      .split("/")
      .filter(Boolean);

  const viewIndex =
    pathParts.indexOf("view");

  const storyId =
    pathParts[
      viewIndex + 1
    ];

  if (!storyId) {
    throw new Error(
      "Could not detect story ID."
    );
  }

  const pattern =
    new RegExp(
      'href=["\\\'](' +
      '\\/story\\/view\\/' +
      storyId +
      '\\/(\\d+)\\/[^"\\\']+' +
      ')["\\\']',
      "gi"
    );

  const matches =
    [
      ...html.matchAll(
        pattern
      )
    ];

  const chapters = [];
  const seen =
    new Set();

  for (
    const match
    of matches
  ) {
    const relativeUrl =
      match[1];

    const chapterNumber =
      Number(match[2]);

    if (
      seen.has(
        chapterNumber
      )
    ) {
      continue;
    }

    seen.add(
      chapterNumber
    );

    chapters.push({
      number:
        chapterNumber,

      title:
        "Chapter " +
        chapterNumber,

      url:
        new URL(
          relativeUrl,
          story.origin
        ).href
    });
  }

  chapters.sort(
    (a, b) =>
      a.number -
      b.number
  );

  return chapters;
}


function decodeHtml(value) {
  return value
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    );
}
