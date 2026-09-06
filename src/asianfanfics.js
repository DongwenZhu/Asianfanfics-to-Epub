export function normalizeStoryUrl(inputUrl) {
  try {
    const url = new URL(inputUrl);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts[0] !== "story" ||
      parts[1] !== "view" ||
      !parts[2]
    ) {
      return inputUrl;
    }

    const storyId =
      parts[2];

    let slug = "";

    if (
      parts[3] &&
      !/^\d+$/.test(parts[3])
    ) {
      slug =
        parts[3];
    }

    if (
      parts[4] &&
      /^\d+$/.test(parts[3])
    ) {
      slug =
        parts[4];
    }

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

  checkLogin(html);


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


  // ----------------------------------
  // Load Description + Foreword
  // ----------------------------------

  let descriptionHtml = "";
  let forewordHtml = "";


  const hxGets =
    extractHxGets(
      html
    );


  const introPrefix =
    "/htmx/story/" +
    storyId +
    "/";


  const introEndpoint =
    hxGets.find(
      item => {
        if (
          !item.startsWith(
            introPrefix
          )
        ) {
          return false;
        }

        const rest =
          item.slice(
            introPrefix.length
          );

        return (
          rest &&
          !rest.includes("/") &&
          !rest.includes("?")
        );
      }
    );


  if (introEndpoint) {
    try {
      const fullUrl =
        new URL(
          introEndpoint,
          "https://www.asianfanfics.com"
        ).href;


      const introResponse =
        await fetch(
          fullUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; FanficKindle/1.0)",

              "Cookie":
                cookie,

              "Referer":
                storyUrl,

              "HX-Request":
                "true",

              "HX-Current-URL":
                storyUrl
            },

            redirect:
              "follow"
          }
        );


      if (
        introResponse.ok
      ) {
        const introHtml =
          await introResponse.text();


        const description =
          extractElementById(
            introHtml,
            "story-description"
          );


        const foreword =
          extractElementById(
            introHtml,
            "story-foreword"
          );


        if (description) {
          descriptionHtml =
            sanitizeChapterHtml(
              description
            );
        }


        if (foreword) {
          forewordHtml =
            sanitizeChapterHtml(
              foreword
            );
        }
      }

    } catch {
      // Description / Foreword are optional.
      // Do not stop the whole book if this request fails.
    }
  }


  return {
    story_url:
      storyUrl,

    story_id:
      storyId,

    title,

    chapter_count:
      chapters.length,

    chapters,

    description_html:
      descriptionHtml,

    foreword_html:
      forewordHtml
  };
}



export async function fetchChapterContent(
  chapterUrl,
  cookie
) {
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


  const chapterTitle =
    extractChapterTitle(
      pageHtml
    );


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
    extractFirstUserContent(
      contentHtml
    );


  if (!userContent) {
    throw new Error(
      "Chapter body was empty."
    );
  }


  return {
    title:
      chapterTitle,

    html:
      sanitizeChapterHtml(
        userContent
      )
  };
}



// ==================================================
// Request helper
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


  const parts =
    url.pathname
      .split("/")
      .filter(Boolean);


  if (
    parts[0] !== "story" ||
    parts[1] !== "view" ||
    !parts[2]
  ) {
    throw new Error(
      "Could not detect story ID."
    );
  }


  return parts[2];
}



// ==================================================
// Story title
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


  const title =
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
// Chapter links
// ==================================================

function extractChapterLinks(
  html,
  storyId
) {
  const matches =
    [
      ...html.matchAll(
        /href=["']([^"']+)["']/gi
      )
    ];


  const chapters =
    new Map();


  for (
    const match
    of matches
  ) {
    const href =
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


    const parts =
      parsed.pathname
        .split("/")
        .filter(Boolean);


    if (
      parts[0] !== "story" ||
      parts[1] !== "view" ||
      parts[2] !== String(storyId)
    ) {
      continue;
    }


    const chapterNumber =
      Number(
        parts[3]
      );


    if (
      !Number.isInteger(
        chapterNumber
      ) ||
      chapterNumber <= 0
    ) {
      continue;
    }


    if (
      !chapters.has(
        chapterNumber
      )
    ) {
      chapters.set(
        chapterNumber,
        {
          number:
            chapterNumber,

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
    const title =
      decodeHtml(
        match[1]
      ).trim();


    if (title) {
      return title;
    }
  }


  return "";
}



// ==================================================
// hx-get
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
// Extract element by ID
// ==================================================

function extractElementById(
  html,
  id
) {
  const pattern =
    new RegExp(
      '<([a-z0-9]+)\\b[^>]*\\bid=["\\\']' +
      escapeRegex(id) +
      '["\\\'][^>]*>',
      "i"
    );


  const start =
    pattern.exec(
      html
    );


  if (!start) {
    return "";
  }


  const tag =
    start[1]
      .toLowerCase();


  const contentStart =
    start.index +
    start[0].length;


  const tagPattern =
    new RegExp(
      "<\\/?" +
      tag +
      "\\b[^>]*>",
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
    if (
      match[0].startsWith(
        "</"
      )
    ) {
      depth--;


      if (
        depth === 0
      ) {
        return html.slice(
          contentStart,
          match.index
        );
      }

    } else if (
      !match[0].endsWith(
        "/>"
      )
    ) {
      depth++;
    }
  }


  return "";
}



// ==================================================
// First user-content block
// ==================================================

function extractFirstUserContent(
  html
) {
  const start =
    /<([a-z0-9]+)\b[^>]*class=["'][^"']*\buser-content\b[^"']*["'][^>]*>/i
      .exec(
        html
      );


  if (!start) {
    return "";
  }


  const tag =
    start[1]
      .toLowerCase();


  const contentStart =
    start.index +
    start[0].length;


  const tagPattern =
    new RegExp(
      "<\\/?" +
      tag +
      "\\b[^>]*>",
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
    if (
      match[0].startsWith(
        "</"
      )
    ) {
      depth--;


      if (
        depth === 0
      ) {
        return html.slice(
          contentStart,
          match.index
        );
      }

    } else if (
      !match[0].endsWith(
        "/>"
      )
    ) {
      depth++;
    }
  }


  return "";
}



// ==================================================
// Clean content for EPUB
// ==================================================

function sanitizeChapterHtml(
  html
) {
  let clean =
    String(
      html || ""
    );


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


        if (
          whole.startsWith(
            "</"
          )
        ) {
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



function escapeRegex(
  value
) {
  return String(
    value
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
