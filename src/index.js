import {
  fetchStoryInfo
} from "./asianfanfics.js";


export default {
  async fetch(request, env) {
    const url = new URL(request.url);


    // ==================================================
    // DEBUG: Find and fetch Asianfanfics HTMX content
    // ==================================================

    if (url.pathname === "/api/debug-content") {
      const chapterUrl =
        "https://www.asianfanfics.com/story/view/1733952/1/shanti-shanti-shanti";

      try {
        // 1. Load Chapter 1 page while logged in
        const pageResponse =
          await fetch(chapterUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; FanficKindle/1.0)",

              "Cookie":
                env.AFF_COOKIE
            }
          });


        const pageHtml =
          await pageResponse.text();


        // 2. Find every hx-get on the page
        const hxGets =
          extractHxGets(
            pageHtml
          );


        const storyHxGets =
          hxGets.filter(
            item =>
              item.includes(
                "/htmx/story/"
              )
          );


        // 3. Fetch each HTMX endpoint
        const results = [];


        for (
          const endpoint
          of storyHxGets
        ) {
          try {
            const fullUrl =
              new URL(
                endpoint,
                "https://www.asianfanfics.com"
              ).href;


            const htmxResponse =
              await fetch(
                fullUrl,
                {
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (compatible; FanficKindle/1.0)",

                    "Cookie":
                      env.AFF_COOKIE,

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


            const html =
              await htmxResponse.text();


            const text =
              htmlToText(
                html
              );


            results.push({
              endpoint,

              status:
                htmxResponse.status,

              final_url:
                htmxResponse.url,

              html_length:
                html.length,

              text_length:
                text.length,

              has_description:
                /description/i.test(
                  html
                ),

              has_foreword:
                /foreword/i.test(
                  html
                ),

              has_story_description:
                html.includes(
                  'id="story-description"'
                ),

              has_story_foreword:
                html.includes(
                  'id="story-foreword"'
                ),

              has_user_content:
                html.includes(
                  "user-content"
                ),

              first_text:
                text.slice(
                  0,
                  1200
                ),

              html_preview:
                html.slice(
                  0,
                  1800
                )
            });

          } catch (error) {
            results.push({
              endpoint,
              error:
                error.message
            });
          }
        }


        return json({
          success:
            pageResponse.ok,

          page_status:
            pageResponse.status,

          page_html_length:
            pageHtml.length,

          still_age_gate:
            pageHtml.includes(
              "Are you over 18?"
            ),

          hx_get_count:
            hxGets.length,

          all_hx_gets:
            hxGets,

          story_hx_get_count:
            storyHxGets.length,

          story_hx_gets:
            storyHxGets,

          results
        });


      } catch (error) {
        return json(
          {
            success: false,
            error:
              error.message
          },
          500
        );
      }
    }



    // ==================================================
    // GET: recent stories
    // ==================================================

    if (
      url.pathname ===
        "/api/stories" &&
      request.method ===
        "GET"
    ) {
      try {
        const { results } =
          await env.DB
            .prepare(`
              SELECT *
              FROM stories
              ORDER BY
                datetime(accessed_at) DESC
              LIMIT 10
            `)
            .all();


        return json(
          results
        );

      } catch (error) {
        return json(
          {
            error:
              error.message
          },
          500
        );
      }
    }



    // ==================================================
    // POST: Add story
    // ==================================================

    if (
      url.pathname ===
        "/api/stories" &&
      request.method ===
        "POST"
    ) {
      try {
        const body =
          await request.json();


        const inputUrl =
          (
            body.story_url ||
            ""
          ).trim();


        if (!inputUrl) {
          return json(
            {
              error:
                "Please enter a URL."
            },
            400
          );
        }


        if (
          !inputUrl.includes(
            "asianfanfics.com"
          )
        ) {
          return json(
            {
              error:
                "Please enter an Asianfanfics URL."
            },
            400
          );
        }


        // Convert chapter URL to main story URL
        const storyUrl =
          normalizeStoryUrl(
            inputUrl
          );


        // Existing story?
        const existing =
          await env.DB
            .prepare(`
              SELECT *
              FROM stories
              WHERE story_url = ?
            `)
            .bind(
              storyUrl
            )
            .first();


        // Shelf maximum = 10.
        // Do not automatically delete old books.
        if (!existing) {
          const countResult =
            await env.DB
              .prepare(`
                SELECT COUNT(*) AS count
                FROM stories
              `)
              .first();


          const count =
            Number(
              countResult?.count ||
              0
            );


          if (count >= 10) {
            return json(
              {
                error:
                  "Your library is full. Please delete one story before adding another."
              },
              409
            );
          }
        }


        const info =
          await fetchStoryInfo(
            storyUrl,
            env.AFF_COOKIE
          );


        const now =
          new Date()
            .toISOString();


        await env.DB
          .prepare(`
            INSERT INTO stories (
              story_url,
              title,
              chapter_count,
              accessed_at,
              last_updated
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?
            )

            ON CONFLICT(
              story_url
            )

            DO UPDATE SET

              title =
                excluded.title,

              chapter_count =
                excluded.chapter_count,

              accessed_at =
                excluded.accessed_at,

              last_updated =
                excluded.last_updated
          `)

          .bind(
            storyUrl,
            info.title,
            info.chapter_count,
            now,
            now
          )

          .run();


        return json({
          success: true,

          title:
            info.title,

          chapter_count:
            info.chapter_count,

          story_url:
            storyUrl
        });


      } catch (error) {
        return json(
          {
            error:
              error.message
          },
          500
        );
      }
    }



    // ==================================================
    // POST: Update story
    // ==================================================

    if (
      url.pathname.match(
        /^\/api\/stories\/\d+\/update$/
      ) &&
      request.method ===
        "POST"
    ) {
      try {
        const parts =
          url.pathname
            .split("/");


        const id =
          parts[3];


        const existing =
          await env.DB
            .prepare(`
              SELECT *
              FROM stories
              WHERE id = ?
            `)
            .bind(id)
            .first();


        if (!existing) {
          return json(
            {
              error:
                "Story not found."
            },
            404
          );
        }


        const info =
          await fetchStoryInfo(
            existing.story_url,
            env.AFF_COOKIE
          );


        const oldCount =
          Number(
            existing.chapter_count ||
            0
          );


        const newCount =
          Number(
            info.chapter_count ||
            0
          );


        const added =
          Math.max(
            0,
            newCount -
            oldCount
          );


        const now =
          new Date()
            .toISOString();


        await env.DB
          .prepare(`
            UPDATE stories

            SET
              title = ?,
              chapter_count = ?,
              accessed_at = ?,
              last_updated = ?

            WHERE id = ?
          `)

          .bind(
            info.title,
            newCount,
            now,
            now,
            id
          )

          .run();


        return json({
          success: true,

          title:
            info.title,

          old_count:
            oldCount,

          new_count:
            newCount,

          added
        });


      } catch (error) {
        return json(
          {
            error:
              error.message
          },
          500
        );
      }
    }



    // ==================================================
    // DELETE story
    // ==================================================

    if (
      url.pathname.match(
        /^\/api\/stories\/\d+$/
      ) &&
      request.method ===
        "DELETE"
    ) {
      try {
        const id =
          url.pathname
            .split("/")
            .pop();


        await env.DB
          .prepare(`
            DELETE FROM stories
            WHERE id = ?
          `)
          .bind(id)
          .run();


        return json({
          success: true
        });


      } catch (error) {
        return json(
          {
            error:
              error.message
          },
          500
        );
      }
    }



    // ==================================================
    // Main webpage
    // ==================================================

    return new Response(
      page(),
      {
        headers: {
          "content-type":
            "text/html;charset=UTF-8"
        }
      }
    );
  }
};



// ==================================================
// Normalize Asianfanfics URL
// ==================================================

function normalizeStoryUrl(
  inputUrl
) {
  try {
    const url =
      new URL(
        inputUrl
      );


    const match =
      url.pathname.match(
        /^\/story\/view\/(\d+)(?:\/\d+)?(?:\/([^/?#]+))?/
      );


    if (!match) {
      return inputUrl;
    }


    const storyId =
      match[1];


    const slug =
      match[2];


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



// ==================================================
// Find all hx-get attributes
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
// Convert returned HTML to readable text
// ==================================================

function htmlToText(
  html
) {
  return decodeHtml(
    html
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<\/p>/gi,
        "\n"
      )
      .replace(
        /<\/div>/gi,
        "\n"
      )
      .replace(
        /<\/h[1-6]>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n\s+/g,
      "\n"
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}



// ==================================================
// Decode basic HTML entities
// ==================================================

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



// ==================================================
// JSON response
// ==================================================

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "content-type":
          "application/json;charset=UTF-8"
      }
    }
  );
}



// ==================================================
// Main webpage
// ==================================================

function page() {
  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  Fanfic Kindle
</title>


<style>

* {
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  max-width:
    620px;

  margin:
    0 auto;

  padding:
    28px 18px 60px;

  background:
    #f6f6f6;

  color:
    #202020;
}

h1 {
  font-size:
    36px;

  margin:
    0 0 6px;
}

h2 {
  margin-top:
    38px;
}

.subtitle {
  color:
    #777;

  font-size:
    18px;

  margin-bottom:
    28px;
}

.card {
  background:
    white;

  border-radius:
    16px;

  padding:
    18px;

  margin-bottom:
    14px;

  box-shadow:
    0 3px 14px
    rgba(
      0,
      0,
      0,
      0.05
    );
}

input {
  width:
    100%;

  padding:
    15px;

  border:
    1px solid #ddd;

  border-radius:
    11px;

  font-size:
    16px;

  margin-bottom:
    12px;
}

button {
  border:
    0;

  border-radius:
    10px;

  padding:
    13px 16px;

  font-size:
    16px;

  cursor:
    pointer;
}

.primary {
  width:
    100%;

  background:
    #111;

  color:
    white;
}

.story-title {
  font-size:
    19px;

  font-weight:
    650;

  margin-bottom:
    6px;
}

.story-meta {
  color:
    #666;

  font-size:
    14px;

  margin-bottom:
    14px;
}

.story-url {
  font-size:
    12px;

  color:
    #999;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;

  margin-bottom:
    14px;
}

.buttons {
  display:
    flex;

  gap:
    8px;
}

.update {
  flex:
    1;

  background:
    #111;

  color:
    white;
}

.delete {
  background:
    #ececec;

  color:
    #333;
}

.empty {
  color:
    #888;

  text-align:
    center;

  padding:
    30px;
}

.message {
  margin-top:
    12px;

  font-size:
    14px;
}

.error {
  color:
    #b42318;
}

.success {
  color:
    #18794e;
}

.update-result {
  margin-top:
    12px;

  padding:
    12px;

  border-radius:
    9px;

  background:
    #f3f3f3;

  font-size:
    14px;
}

</style>

</head>


<body>


<h1>
  📚 Fanfic Kindle
</h1>


<div class="subtitle">
  Asianfanfics → Kindle
</div>


<div class="card">

  <input
    id="storyUrl"
    type="url"
    placeholder="Paste Asianfanfics story URL"
  >

  <button
    class="primary"
    onclick="addStory()"
  >
    Add Story
  </button>

  <div
    id="message"
    class="message"
  ></div>

</div>


<h2>
  My Library
</h2>


<div id="library">

  <div class="card empty">
    Loading...
  </div>

</div>


<script>


async function loadStories() {

  const library =
    document.getElementById(
      "library"
    );


  try {

    const response =
      await fetch(
        "/api/stories"
      );


    const stories =
      await response.json();


    if (!response.ok) {

      library.innerHTML =
        '<div class="card empty">' +
        'Failed to load library.' +
        '</div>';

      return;
    }


    if (!stories.length) {

      library.innerHTML =
        '<div class="card empty">' +
        'No stories yet.' +
        '</div>';

      return;
    }


    library.innerHTML =
      stories
        .map(
          story => \`

<div class="card">

  <div class="story-title">

    \${escapeHtml(
      story.title ||
      "Untitled Story"
    )}

  </div>


  <div class="story-meta">

    \${Number(
      story.chapter_count ||
      0
    )}
    chapters

  </div>


  <div class="story-url">

    \${escapeHtml(
      story.story_url
    )}

  </div>


  <div class="buttons">

    <button
      class="update"
      onclick="
        updateStory(
          \${story.id}
        )
      "
    >
      Update
    </button>


    <button
      class="delete"
      onclick="
        deleteStory(
          \${story.id}
        )
      "
    >
      Delete
    </button>

  </div>


  <div
    id="result-\${story.id}"
  ></div>

</div>

\`
        )
        .join("");


  } catch (error) {

    library.innerHTML =
      '<div class="card empty">' +
      'Failed to load library.' +
      '</div>';

  }

}



async function addStory() {

  const input =
    document.getElementById(
      "storyUrl"
    );


  const message =
    document.getElementById(
      "message"
    );


  const storyUrl =
    input.value.trim();


  message.textContent =
    "Reading story...";


  message.className =
    "message";


  try {

    const response =
      await fetch(
        "/api/stories",
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify({
              story_url:
                storyUrl
            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      message.className =
        "message error";


      message.textContent =
        result.error ||
        "Something went wrong.";

      return;
    }


    message.className =
      "message success";


    message.textContent =
      result.title +
      " saved — " +
      result.chapter_count +
      " chapters.";


    input.value =
      "";


    await loadStories();


  } catch (error) {

    message.className =
      "message error";


    message.textContent =
      "Something went wrong.";

  }

}



async function updateStory(
  id
) {

  const resultBox =
    document.getElementById(
      "result-" + id
    );


  resultBox.innerHTML =
    '<div class="update-result">' +
    'Checking Asianfanfics...' +
    '</div>';


  try {

    const response =
      await fetch(
        "/api/stories/" +
        id +
        "/update",
        {
          method:
            "POST"
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      resultBox.innerHTML =
        '<div class="update-result">' +
        escapeHtml(
          result.error ||
          "Update failed."
        ) +
        '</div>';

      return;
    }


    if (
      result.added > 0
    ) {

      resultBox.innerHTML =
        '<div class="update-result">' +
        '✓ ' +
        result.added +
        ' new chapter' +
        (
          result.added === 1
            ? ''
            : 's'
        ) +
        ' found.<br>' +
        result.old_count +
        ' → ' +
        result.new_count +
        ' chapters' +
        '</div>';

    } else {

      resultBox.innerHTML =
        '<div class="update-result">' +
        '✓ Already up to date — ' +
        result.new_count +
        ' chapters.' +
        '</div>';

    }


    await loadStories();


  } catch (error) {

    resultBox.innerHTML =
      '<div class="update-result">' +
      'Update failed.' +
      '</div>';

  }

}



async function deleteStory(
  id
) {

  const confirmed =
    confirm(
      "Remove this story " +
      "from your library?"
    );


  if (!confirmed) {
    return;
  }


  await fetch(
    "/api/stories/" +
    id,
    {
      method:
        "DELETE"
    }
  );


  await loadStories();

}



function escapeHtml(
  value
) {

  const div =
    document.createElement(
      "div"
    );


  div.textContent =
    value || "";


  return div.innerHTML;

}



loadStories();


</script>


</body>

</html>`;
}
