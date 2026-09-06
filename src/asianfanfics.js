export function normalizeStoryUrl(inputUrl) {
  try {
    const url = new URL(inputUrl);

    const match =
      url.pathname.match(
        /^\/story\/view\/(\d+)(?:\/\d+)?(?:\/([^/?#]+))?/
      );

    if (!match) {
      return inputUrl;
    }

    const storyId = match[1];
    const slug = match[2];

    if (slug) {
      return (
        "https://www.asianfanfics.com/story/view/" +
        storyId +
        "/" +
        slug
      );
    }

    return (
      "https://www.asianfanfics.com/story/view/" +
      storyId
    );

  } catch {
    return inputUrl;
  }
}



export async function fetchStoryInfo(
  inputUrl,
  cookie
) {
  const storyUrl =
    normalizeStoryUrl(
      inputUrl
    );

  const response =
    await affFetch(
      storyUrl,
      cookie
    );

  const html =
    await response.text();

  checkLogin(
    html
  );

  const title =
    extractTitle(
      html
    );

  const storyId =
    extractStoryId(
      storyUrl
    );

  const chapters =
    extractChapterLinks(
      html,
      storyId
    );

  return {
    story_url:
      storyUrl,

    story_id:
      storyId,

    title,

    chapter_count:
      chapters.length,

    chapters
  };
}



export async function fetchChapterContent(
  chapterUrl,
  cookie
) {
  // -------------------------------------
  // First load normal chapter page
  // -------------------------------------

  const pageResponse =
    await affFetch(
      chapterUrl,
      cookie
    );

  const pageHtml =
    await pageResponse.text();

  checkLogin(
    pageHtml
  );


  // -------------------------------------
  // Get real chapter title
  // -------------------------------------

  const chapterTitle =
    extractChapterTitle(
      pageHtml
    );


  // -------------------------------------
  // Find HTMX chapter endpoint
  // -------------------------------------

  const hxGets =
    extractHxGets(
      pageHtml
    );


  const chapterEndpoint =
    hxGets.find(
      item =>
        item.startsWith(
          "/htmx/chapter/"
        )
    );


  if (!chapterEndpoint) {
    throw new Error(
      "Could not find chapter content."
    );
  }


  const fullEndpoint =
    new URL(
      chapterEndpoint,
      "https://www.asianfanfics.com"
    ).href;


  // -------------------------------------
  // Fetch actual chapter body
  // -------------------------------------

  const contentResponse =
    await fetch(
      fullEndpoint,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FanficKindle/1.0)",

          "Cookie":
            cookie,

          "Referer":
            chapterUrl,

          "HX-Request":
            "true",

          "HX-Current-URL":
            chapterUrl
        },

        redirect:
          "follow"
      }
    );


  if (!contentResponse.ok) {
    throw new Error(
      "Could not load chapter. Status " +
      contentResponse.status
    );
  }


  const contentHtml =
    await contentResponse.text();


  const userContent =
    extractUserContent(
      contentHtml
    );


  if (!userContent) {
    throw new Error(
      "Chapter body was empty."
    );
  }


  const cleanHtml =
    sanitizeChapterHtml(
      userContent
    );


  return {
    title:
      chapterTitle,

    html:
      cleanHtml,

    endpoint:
      chapterEndpoint
  };
}



// ==================================================
// Asianfanfics request
// ==================================================

async function affFetch(
  url,
  cookie
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FanficKindle/1.0)",

          "Cookie":
            cookie
        },

        redirect:
          "follow"
      }
    );


  if (!response.ok) {
    throw new Error(
      "Asianfanfics returned status " +
      response.status
    );
  }


  return response;
}



// ==================================================
// Login check
// ==================================================

function checkLogin(
  html
) {
  if (
    html.includes(
      "Are you over 18?"
    )
  ) {
    throw new Error(
      "Asianfanfics login expired. Please update AFF_COOKIE."
    );
  }
}



// ==================================================
// Story ID
// ==================================================

function extractStoryId(
  storyUrl
) {
  const url =
    new URL(
      storyUrl
    );


  const match =
    url.pathname.match(
      /\/story\/view\/(\d+)/
    );


  if (!match) {
    throw new Error(
      "Could not detect story ID."
    );
  }


  return match[1];
}



// ==================================================
// Title
// ==================================================

function extractTitle(
  html
) {
  const match =
    html.match(
      /<title>([\s\S]*?)<\/title>/i
    );


  if (!match) {
    return "Untitled Story";
  }


  let title =
    decodeHtml(
      stripTags(
        match[1]
      )
    )
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



// ==================================================
// Chapter list
// ==================================================

function extractChapterLinks(
  html,
  storyId
) {
  const hrefMatches =
    [
      ...html.matchAll(
        /href=["']([^"']+)["']/gi
      )
    ];


  const chapters =
    new Map();


  for (
    const match
    of hrefMatches
  ) {
    let href =
      decodeHtml(
        match[1]
      );


    let parsed;


    try {
      parsed =
        new URL(
          href,
          "https://www.asianfanfics.com"
        );
    } catch {
      continue;
    }


    const chapterMatch =
      parsed.pathname.match(
        new RegExp(
          "^/story/view/" +
          storyId +
          "/(\\\\d+)(?:/|$)"
        )
      );


    if (!chapterMatch) {
      continue;
    }


    const number =
      Number(
        chapterMatch[1]
      );


    if (!number) {
      continue;
    }


    if (
      !chapters.has(
        number
      )
    ) {
      chapters.set(
        number,
        {
          number,

          url:
            parsed.href
        }
      );
    }
  }


  return [
    ...chapters.values()
  ].sort(
    (a, b) =>
      a.number -
      b.number
  );
}



// ==================================================
// Chapter title
// ==================================================

function extractChapterTitle(
  html
) {
  const match =
    html.match(
      /data-chapter-title=["']([^"']*)["']/i
    );


  if (match) {
    const value =
      decodeHtml(
        match[1]
      ).trim();


    if (value) {
      return value;
    }
  }


  const titleMatch =
    html.match(
      /<title>([\s\S]*?)<\/title>/i
    );


  if (titleMatch) {
    return decodeHtml(
      stripTags(
        titleMatch[1]
      )
    )
      .replace(
        /\s*-\s*Asianfanfics.*$/i,
        ""
      )
      .trim();
  }


  return "";
}



// ==================================================
// HTMX URLs
// ==================================================

function extractHxGets(
  html
) {
  const matches =
    [
      ...html.matchAll(
        /\bhx-get\s*=\s*["']([^"']+)["']/gi
      )
    ];


  return [
    ...new Set(
      matches.map(
        match =>
          decodeHtml(
            match[1]
          )
      )
    )
  ];
}



// ==================================================
// Extract first .user-content block
// ==================================================

function extractUserContent(
  html
) {
  const startMatch =
    /<([a-z0-9]+)\b[^>]*class=["'][^"']*\buser-content\b[^"']*["'][^>]*>/i
      .exec(
        html
      );


  if (!startMatch) {
    return null;
  }


  const tag =
    startMatch[1]
      .toLowerCase();


  const contentStart =
    startMatch.index +
    startMatch[0].length;


  const tagPattern =
    new RegExp(
      "<\\\\/?" +
      tag +
      "\\\\b[^>]*>",
      "gi"
    );


  tagPattern.lastIndex =
    contentStart;


  let depth = 1;
  let match;


  while (
    (
      match =
        tagPattern.exec(
          html
        )
    )
  ) {
    const token =
      match[0];


    if (
      token.startsWith(
        "</"
      )
    ) {
      depth--;

      if (depth === 0) {
        return html.slice(
          contentStart,
          match.index
        );
      }

    } else if (
      !token.endsWith(
        "/>"
      )
    ) {
      depth++;
    }
  }


  return html.slice(
    contentStart
  );
}



// ==================================================
// Clean HTML for EPUB
// ==================================================

function sanitizeChapterHtml(
  html
) {
  let clean =
    String(
      html || ""
    );


  // Remove things that should not enter EPUB

  clean =
    clean
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ""
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(
        /<form[\s\S]*?<\/form>/gi,
        ""
      )
      .replace(
        /<button[\s\S]*?<\/button>/gi,
        ""
      )
      .replace(
        /<!--[\s\S]*?-->/g,
        ""
      );


  const allowed =
    new Set([
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "blockquote",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li"
    ]);


  clean =
    clean.replace(
      /<\/?([a-z0-9]+)\b[^>]*>/gi,
      (
        whole,
        rawTag
      ) => {
        const tag =
          rawTag
            .toLowerCase();


        if (
          !allowed.has(
            tag
          )
        ) {
          return "";
        }


        const closing =
          whole.startsWith(
            "</"
          );


        if (closing) {
          return (
            "</" +
            tag +
            ">"
          );
        }


        if (
          tag === "br" ||
          tag === "hr"
        ) {
          return (
            "<" +
            tag +
            "/>"
          );
        }


        return (
          "<" +
          tag +
          ">"
        );
      }
    );


  return clean.trim();
}



// ==================================================
// Helpers
// ==================================================

function stripTags(
  value
) {
  return String(
    value || ""
  ).replace(
    /<[^>]*>/g,
    ""
  );
}



function decodeHtml(
  value
) {
  return String(
    value || ""
  )
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
      /&#x27;/g,
      "'"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&nbsp;/g,
      " "
    );
}
