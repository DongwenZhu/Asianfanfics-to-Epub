import {
  zipSync,
  strToU8
} from "fflate";


import {
  fetchStoryInfo,
  fetchChapterContent,
  normalizeStoryUrl
} from "./asianfanfics.js";


export default {
  async fetch(request, env) {
    const url =
      new URL(
        request.url
      );


    // ==================================================
    // GET library
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
    // DOWNLOAD EPUB
    // ==================================================

    const epubMatch =
      url.pathname.match(
        /^\/api\/stories\/(\d+)\/epub$/
      );


    if (
      epubMatch &&
      request.method ===
        "GET"
    ) {
      try {
        const id =
          epubMatch[1];


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


        // ----------------------------------
        // Refresh story information
        // ----------------------------------

        const info =
          await fetchStoryInfo(
            existing.story_url,
            env.AFF_COOKIE
          );


        if (
          !info.chapters.length
        ) {
          throw new Error(
            "No chapters found."
          );
        }


        // ----------------------------------
        // Download every chapter
        // ----------------------------------

        const chapters =
          [];
        
        
        // ----------------------------------
        // Description
        // ----------------------------------
        
        if (
          info.description_html
        ) {
          chapters.push({
            number:
              0,
        
            title:
              "Description",
        
            html:
              info.description_html
          });
        }
        
        
        // ----------------------------------
        // Foreword
        // ----------------------------------
        
        if (
          info.foreword_html
        ) {
          chapters.push({
            number:
              0,
        
            title:
              "Foreword",
        
            html:
              info.foreword_html
          });
        }

        for (
          const chapter
          of info.chapters
        ) {
          const content =
            await fetchChapterContent(
              chapter.url,
              env.AFF_COOKIE
            );


          chapters.push({
            number:
              chapter.number,

            title:
              content.title ||
              (
                "Chapter " +
                chapter.number
              ),

            html:
              content.html
          });
        }


        // ----------------------------------
        // Create EPUB
        // ----------------------------------

        const epub =
          createEpub(
            info.title,
            chapters
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
            info.chapter_count,
            now,
            now,
            id
          )
          .run();


        const fileName =
          safeFileName(
            info.title
          ) +
          ".epub";


        return new Response(
          epub,
          {
            headers: {
              "Content-Type":
                "application/epub+zip",

              "Content-Disposition":
                "attachment; filename=\"fanfic.epub\"; filename*=UTF-8''" +
                encodeURIComponent(
                  fileName
                ),

              "Cache-Control":
                "no-store"
            }
          }
        );


      } catch (error) {
        return new Response(
          errorPage(
            error.message
          ),
          {
            status:
              500,

            headers: {
              "content-type":
                "text/html;charset=UTF-8"
            }
          }
        );
      }
    }


    // ==================================================
    // ADD STORY
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


        const storyUrl =
          normalizeStoryUrl(
            inputUrl
          );


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


          if (
            count >= 10
          ) {
            return json(
              {
                error:
                  "Your library is full. Please delete one story first."
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
              story_id,
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
              ?,
              ?
            )

            ON CONFLICT(
              story_url
            )

            DO UPDATE SET

              story_id =
                excluded.story_id,

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
            info.story_url,
            info.story_id,
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
            info.chapter_count
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
    // CHECK UPDATE
    // ==================================================

    const updateMatch =
      url.pathname.match(
        /^\/api\/stories\/(\d+)\/update$/
      );


    if (
      updateMatch &&
      request.method ===
        "POST"
    ) {
      try {
        const id =
          updateMatch[1];


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
    // DELETE
    // ==================================================

    const deleteMatch =
      url.pathname.match(
        /^\/api\/stories\/(\d+)$/
      );


    if (
      deleteMatch &&
      request.method ===
        "DELETE"
    ) {
      try {
        await env.DB
          .prepare(`
            DELETE FROM stories
            WHERE id = ?
          `)
          .bind(
            deleteMatch[1]
          )
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
    // Main page
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
// CREATE EPUB
// ==================================================

function createEpub(
  bookTitle,
  chapters
) {
  const bookId =
    "urn:uuid:" +
    crypto.randomUUID();


  const modified =
    new Date()
      .toISOString()
      .replace(
        /\.\d{3}Z$/,
        "Z"
      );


  const files = {};


  // IMPORTANT:
  // EPUB requires this to be first
  // and uncompressed.

  files["mimetype"] = [
    strToU8(
      "application/epub+zip"
    ),
    {
      level:
        0
    }
  ];


  files[
    "META-INF/container.xml"
  ] =
    strToU8(
`<?xml version="1.0" encoding="UTF-8"?>
<container
  version="1.0"
  xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile
      full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );


  files[
    "OEBPS/style.css"
  ] =
    strToU8(
`body {
  font-family: serif;
  line-height: 1.65;
  margin: 5%;
}

h1 {
  font-size: 1.5em;
  margin-bottom: 1.5em;
}

p {
  margin-top: 0.7em;
  margin-bottom: 0.7em;
}

blockquote {
  margin-left: 1.5em;
  margin-right: 1.5em;
}`
    );


  // ----------------------------------
  // Chapter XHTML
  // ----------------------------------

  chapters.forEach(
    (
      chapter,
      index
    ) => {
      const number =
        index + 1;


      const file =
        "OEBPS/chapter-" +
        number +
        ".xhtml";


      files[file] =
        strToU8(
          chapterXhtml(
            chapter.title,
            chapter.html
          )
        );
    }
  );


  // ----------------------------------
  // Navigation
  // ----------------------------------

  files[
    "OEBPS/nav.xhtml"
  ] =
    strToU8(
      createNav(
        bookTitle,
        chapters
      )
    );


  files[
    "OEBPS/toc.ncx"
  ] =
    strToU8(
      createNcx(
        bookId,
        bookTitle,
        chapters
      )
    );


  files[
    "OEBPS/content.opf"
  ] =
    strToU8(
      createOpf(
        bookId,
        bookTitle,
        modified,
        chapters
      )
    );


  return zipSync(
    files,
    {
      level:
        6
    }
  );
}



// ==================================================
// XHTML chapter
// ==================================================

function chapterXhtml(
  title,
  bodyHtml
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="zh">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link
    rel="stylesheet"
    type="text/css"
    href="style.css"/>
</head>
<body>
  <h1>${escapeXml(title)}</h1>

  <div class="chapter">
    ${bodyHtml}
  </div>
</body>
</html>`;
}



// ==================================================
// EPUB navigation
// ==================================================

function createNav(
  bookTitle,
  chapters
) {
  const items =
    chapters
      .map(
        (
          chapter,
          index
        ) => {
          return `
      <li>
        <a href="chapter-${index + 1}.xhtml">${escapeXml(
          chapter.title
        )}</a>
      </li>`;
        }
      )
      .join("");


  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>Contents</title>
</head>
<body>

  <nav
    epub:type="toc"
    id="toc">

    <h1>${escapeXml(bookTitle)}</h1>

    <ol>
      ${items}
    </ol>

  </nav>

</body>
</html>`;
}



// ==================================================
// NCX compatibility TOC
// ==================================================

function createNcx(
  bookId,
  bookTitle,
  chapters
) {
  const points =
    chapters
      .map(
        (
          chapter,
          index
        ) => {
          const order =
            index + 1;


          return `
    <navPoint
      id="navPoint-${order}"
      playOrder="${order}">

      <navLabel>
        <text>${escapeXml(
          chapter.title
        )}</text>
      </navLabel>

      <content
        src="chapter-${order}.xhtml"/>

    </navPoint>`;
        }
      )
      .join("");


  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx
  xmlns="http://www.daisy.org/z3986/2005/ncx/"
  version="2005-1">

  <head>
    <meta
      name="dtb:uid"
      content="${escapeXml(bookId)}"/>
  </head>

  <docTitle>
    <text>${escapeXml(bookTitle)}</text>
  </docTitle>

  <navMap>
    ${points}
  </navMap>

</ncx>`;
}



// ==================================================
// OPF
// ==================================================

function createOpf(
  bookId,
  bookTitle,
  modified,
  chapters
) {
  const manifestChapters =
    chapters
      .map(
        (
          chapter,
          index
        ) => {
          const number =
            index + 1;


          return `
    <item
      id="chapter-${number}"
      href="chapter-${number}.xhtml"
      media-type="application/xhtml+xml"/>`;
        }
      )
      .join("");


  const spineChapters =
    chapters
      .map(
        (
          chapter,
          index
        ) => {
          return `
    <itemref
      idref="chapter-${index + 1}"/>`;
        }
      )
      .join("");


  return `<?xml version="1.0" encoding="UTF-8"?>
<package
  xmlns="http://www.idpf.org/2007/opf"
  version="3.0"
  unique-identifier="bookid">

  <metadata
    xmlns:dc="http://purl.org/dc/elements/1.1/">

    <dc:identifier
      id="bookid">${escapeXml(bookId)}</dc:identifier>

    <dc:title>${escapeXml(bookTitle)}</dc:title>

    <dc:language>zh</dc:language>

    <meta
      property="dcterms:modified">${modified}</meta>

  </metadata>


  <manifest>

    <item
      id="nav"
      href="nav.xhtml"
      media-type="application/xhtml+xml"
      properties="nav"/>

    <item
      id="ncx"
      href="toc.ncx"
      media-type="application/x-dtbncx+xml"/>

    <item
      id="css"
      href="style.css"
      media-type="text/css"/>

    ${manifestChapters}

  </manifest>


  <spine toc="ncx">

    ${spineChapters}

  </spine>

</package>`;
}



// ==================================================
// HELPERS
// ==================================================

function escapeXml(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );
}



function safeFileName(
  value
) {
  return String(
    value ||
    "fanfic"
  )
    .replace(
      /[\\/:*?"<>|]/g,
      "_"
    )
    .trim()
    .slice(
      0,
      120
    );
}



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
// Error page
// ==================================================

function errorPage(
  message
) {
  return `<!DOCTYPE html>

<html>
<head>
<meta charset="UTF-8">
<meta
  name="viewport"
  content="width=device-width, initial-scale=1">
<title>EPUB Error</title>
</head>

<body
  style="
    font-family:sans-serif;
    padding:30px;
    max-width:600px;
    margin:auto;
  ">

<h2>
  Could not create EPUB
</h2>

<p>
  ${escapeXml(message)}
</p>

<p>
  You can go back to Fanfic Kindle and try again.
</p>

</body>
</html>`;
}



// ==================================================
// WEB PAGE
// ==================================================

function page() {
  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0">

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

  max-width: 620px;

  margin: 0 auto;

  padding:
    28px 18px 60px;

  background: #f6f6f6;

  color: #202020;
}

h1 {
  font-size: 36px;
  margin: 0 0 6px;
}

h2 {
  margin-top: 38px;
}

.subtitle {
  color: #777;
  font-size: 18px;
  margin-bottom: 28px;
}

.card {
  background: white;
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 14px;

  box-shadow:
    0 3px 14px
    rgba(0,0,0,0.05);
}

input {
  width: 100%;
  padding: 15px;

  border:
    1px solid #ddd;

  border-radius: 11px;

  font-size: 16px;

  margin-bottom: 12px;
}

button,
.download {
  border: 0;
  border-radius: 10px;

  padding:
    13px 14px;

  font-size: 15px;

  cursor: pointer;

  text-decoration: none;

  text-align: center;
}

.primary {
  width: 100%;
  background: #111;
  color: white;
}

.story-title {
  font-size: 19px;
  font-weight: 650;
  margin-bottom: 6px;
}

.story-meta {
  color: #666;
  font-size: 14px;
  margin-bottom: 16px;
}

.download {
  display: block;
  width: 100%;

  background: #111;
  color: white;

  margin-bottom: 9px;
}

.buttons {
  display: flex;
  gap: 8px;
}

.update {
  flex: 1;

  background: #e9e9e9;
  color: #222;
}

.delete {
  background: #e9e9e9;
  color: #555;
}

.empty {
  color: #888;
  text-align: center;
  padding: 30px;
}

.message {
  margin-top: 12px;
  font-size: 14px;
}

.success {
  color: #18794e;
}

.error {
  color: #b42318;
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
    placeholder="Paste Asianfanfics story URL">

  <button
    class="primary"
    onclick="addStory()">

    Add Story

  </button>

  <div
    id="message"
    class="message">
  </div>

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
      throw new Error();
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
    )} chapters
  </div>


  <a
    class="download"
    href="/api/stories/\${story.id}/epub">

    Download EPUB

  </a>


  <div class="buttons">

    <button
      class="update"
      onclick="checkUpdate(
        \${story.id}
      )">

      Check Update

    </button>


    <button
      class="delete"
      onclick="deleteStory(
        \${story.id}
      )">

      Delete

    </button>

  </div>

</div>

\`
        )
        .join("");


  } catch {

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


  message.className =
    "message";


  message.textContent =
    "Reading story...";


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
                input.value.trim()
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


  } catch {

    message.className =
      "message error";

    message.textContent =
      "Something went wrong.";
  }
}



async function checkUpdate(
  id
) {

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

      alert(
        result.error ||
        "Update failed."
      );

      return;
    }


    if (
      result.added > 0
    ) {

      alert(
        result.added +
        " new chapter" +
        (
          result.added === 1
            ? ""
            : "s"
        ) +
        " found!\\n\\n" +
        result.old_count +
        " → " +
        result.new_count +
        " chapters"
      );

    } else {

      alert(
        "Already up to date — " +
        result.new_count +
        " chapters."
      );
    }


    await loadStories();


  } catch {

    alert(
      "Update failed."
    );
  }
}



async function deleteStory(
  id
) {

  if (
    !confirm(
      "Remove this story from your library?"
    )
  ) {
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
