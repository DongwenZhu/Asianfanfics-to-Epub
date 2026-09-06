import {
  zipSync,
  strToU8
} from "fflate";


export default {

  async fetch(request) {

    const url =
      new URL(
        request.url
      );


    // ==================================================
    // CREATE EPUB FROM IPHONE SHORTCUT
    // ==================================================

    if (
      url.pathname ===
        "/api/shortcut/epub" &&
      request.method ===
        "POST"
    ) {

      try {

        const body =
          await request.json();


        // ==================================================
        // BOOK TITLE
        // ==================================================

        const title =
          String(
            body.title ||
            "Fanfic"
          ).trim();


        // ==================================================
        // DESCRIPTION / FOREWORD
        // ==================================================

        const descriptionHtml =
          String(
            body.description_html ||
            ""
          );


        const forewordHtml =
          String(
            body.foreword_html ||
            ""
          );


        // ==================================================
        // CHAPTERS RECEIVED FROM SHORTCUT
        // ==================================================

        const receivedChapters =
          Array.isArray(
            body.chapters
          )
            ? body.chapters
            : [];


        if (
          receivedChapters.length === 0
        ) {

          return json(
            {
              error:
                "No chapters received."
            },
            400
          );
        }


        // Safety limit

        if (
          receivedChapters.length > 500
        ) {

          return json(
            {
              error:
                "Too many chapters."
            },
            400
          );
        }


        // ==================================================
        // NORMALIZE CHAPTER DATA
        // ==================================================

        const numberedChapters =
          [];


        for (
          let i = 0;
          i < receivedChapters.length;
          i++
        ) {

          const chapter =
            receivedChapters[i] ||
            {};


          const number =
            Number(
              chapter.number ||
              i + 1
            );


          const chapterTitle =
            String(
              chapter.title ||
              (
                "Chapter " +
                number
              )
            ).trim();


          const chapterHtml =
            String(
              chapter.html ||
              ""
            );


          if (
            !chapterHtml.trim()
          ) {

            return json(
              {
                error:
                  "Chapter " +
                  number +
                  " is empty."
              },
              400
            );
          }


          numberedChapters.push({
            number:
              number,

            title:
              chapterTitle,

            html:
              chapterHtml
          });
        }


        // Make absolutely sure chapters
        // are in the correct order.

        numberedChapters.sort(
          function (a, b) {

            return (
              a.number -
              b.number
            );
          }
        );


        // ==================================================
        // FINAL EPUB CHAPTER LIST
        // ==================================================

        const chapters =
          [];


        // Description

        if (
          descriptionHtml.trim()
        ) {

          chapters.push({
            title:
              "Description",

            html:
              descriptionHtml
          });
        }


        // Foreword

        if (
          forewordHtml.trim()
        ) {

          chapters.push({
            title:
              "Foreword",

            html:
              forewordHtml
          });
        }


        // Numbered chapters

        for (
          const chapter
          of numberedChapters
        ) {

          chapters.push({
            title:
              chapter.title,

            html:
              chapter.html
          });
        }


        // ==================================================
        // CREATE EPUB
        // ==================================================

        const epub =
          createEpub(
            title,
            chapters
          );


        const fileName =
          safeFileName(
            title
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

        return json(
          {
            error:
              error.message ||
              "Could not create EPUB."
          },
          500
        );
      }
    }


    // ==================================================
    // SIMPLE STATUS PAGE
    // ==================================================

    if (
      url.pathname === "/" &&
      request.method === "GET"
    ) {

      return new Response(
        "Fanfic Kindle EPUB service is running.",
        {
          headers: {
            "content-type":
              "text/plain;charset=UTF-8"
          }
        }
      );
    }


    // ==================================================
    // NOT FOUND
    // ==================================================

    return json(
      {
        error:
          "Not found."
      },
      404
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


  const files =
    {};


  // ==================================================
  // EPUB MIMETYPE
  //
  // Must be first and uncompressed.
  // ==================================================

  files["mimetype"] = [
    strToU8(
      "application/epub+zip"
    ),
    {
      level:
        0
    }
  ];


  // ==================================================
  // CONTAINER
  // ==================================================

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


  // ==================================================
  // CSS
  // ==================================================

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
}

img {
  max-width: 100%;
  height: auto;
}`
    );


  // ==================================================
  // CHAPTER XHTML FILES
  // ==================================================

  chapters.forEach(
    function (
      chapter,
      index
    ) {

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


  // ==================================================
  // NAVIGATION
  // ==================================================

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


  // ==================================================
  // ZIP EPUB
  // ==================================================

  return zipSync(
    files,
    {
      level:
        6
    }
  );
}



// ==================================================
// CLEAN HTML FOR XHTML
// ==================================================

function cleanXhtml(
  html
) {

  let value =
    String(
      html || ""
    );


  // ==================================================
  // COMMON HTML ENTITIES
  //
  // XHTML/XML does not support all HTML named entities.
  // Convert common ones to numeric entities.
  // ==================================================

  value =
    value
      .replace(
        /&nbsp;/gi,
        "&#160;"
      )
      .replace(
        /&copy;/gi,
        "&#169;"
      )
      .replace(
        /&reg;/gi,
        "&#174;"
      )
      .replace(
        /&hellip;/gi,
        "&#8230;"
      )
      .replace(
        /&mdash;/gi,
        "&#8212;"
      )
      .replace(
        /&ndash;/gi,
        "&#8211;"
      )
      .replace(
        /&ldquo;/gi,
        "&#8220;"
      )
      .replace(
        /&rdquo;/gi,
        "&#8221;"
      )
      .replace(
        /&lsquo;/gi,
        "&#8216;"
      )
      .replace(
        /&rsquo;/gi,
        "&#8217;"
      )
      .replace(
        /&middot;/gi,
        "&#183;"
      );


  // ==================================================
  // XHTML VOID ELEMENTS
  //
  // HTML:
  // <br>
  //
  // XHTML:
  // <br/>
  // ==================================================

  const voidTags =
    [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "source",
      "track",
      "wbr"
    ];


  for (
    const tag
    of voidTags
  ) {

    const regex =
      new RegExp(
        "<" +
        tag +
        "\\b([^>]*)>",
        "gi"
      );


    value =
      value.replace(
        regex,
        function (
          match,
          attributes
        ) {

          const cleanedAttributes =
            String(
              attributes ||
              ""
            )
              .replace(
                /\/\s*$/,
                ""
              );


          return (
            "<" +
            tag +
            cleanedAttributes +
            "/>"
          );
        }
      );
  }


  // ==================================================
  // UNKNOWN NAMED ENTITIES
  //
  // XML only knows:
  // &amp;
  // &lt;
  // &gt;
  // &quot;
  // &apos;
  //
  // Unknown HTML entities are escaped so the EPUB
  // remains valid XML.
  // ==================================================

  value =
    value.replace(
      /&([a-zA-Z][a-zA-Z0-9]+);/g,
      function (
        match,
        name
      ) {

        const allowed =
          {
            amp:
              true,

            lt:
              true,

            gt:
              true,

            quot:
              true,

            apos:
              true
          };


        if (
          allowed[name]
        ) {

          return match;
        }


        return (
          "&amp;" +
          name +
          ";"
        );
      }
    );


  return value;
}



// ==================================================
// XHTML CHAPTER
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

  <title>${escapeXml(
    title
  )}</title>

  <link
    rel="stylesheet"
    type="text/css"
    href="style.css"/>

</head>

<body>

  <h1>${escapeXml(
    title
  )}</h1>

  <div class="chapter">

    ${cleanXhtml(
      bodyHtml
    )}

  </div>

</body>
</html>`;
}



// ==================================================
// EPUB NAVIGATION
// ==================================================

function createNav(
  bookTitle,
  chapters
) {

  const items =
    chapters
      .map(
        function (
          chapter,
          index
        ) {

          return `
    <li>
      <a href="chapter-${index + 1}.xhtml">${escapeXml(
        chapter.title
      )}</a>
    </li>`;
        }
      )
      .join(
        ""
      );


  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>

<html
  xmlns="http://www.w3.org/1999/xhtml"
  xmlns:epub="http://www.idpf.org/2007/ops">

<head>

  <meta charset="UTF-8"/>

  <title>
    Contents
  </title>

</head>

<body>

  <nav
    epub:type="toc"
    id="toc">

    <h1>${escapeXml(
      bookTitle
    )}</h1>

    <ol>
      ${items}
    </ol>

  </nav>

</body>
</html>`;
}



// ==================================================
// NCX COMPATIBILITY TOC
// ==================================================

function createNcx(
  bookId,
  bookTitle,
  chapters
) {

  const points =
    chapters
      .map(
        function (
          chapter,
          index
        ) {

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
      .join(
        ""
      );


  return `<?xml version="1.0" encoding="UTF-8"?>

<ncx
  xmlns="http://www.daisy.org/z3986/2005/ncx/"
  version="2005-1">

  <head>

    <meta
      name="dtb:uid"
      content="${escapeXml(
        bookId
      )}"/>

  </head>

  <docTitle>

    <text>${escapeXml(
      bookTitle
    )}</text>

  </docTitle>

  <navMap>

    ${points}

  </navMap>

</ncx>`;
}



// ==================================================
// EPUB OPF
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
        function (
          chapter,
          index
        ) {

          const number =
            index + 1;


          return `
  <item
    id="chapter-${number}"
    href="chapter-${number}.xhtml"
    media-type="application/xhtml+xml"/>`;
        }
      )
      .join(
        ""
      );


  const spineChapters =
    chapters
      .map(
        function (
          chapter,
          index
        ) {

          return `
  <itemref
    idref="chapter-${index + 1}"/>`;
        }
      )
      .join(
        ""
      );


  return `<?xml version="1.0" encoding="UTF-8"?>

<package
  xmlns="http://www.idpf.org/2007/opf"
  version="3.0"
  unique-identifier="bookid">

  <metadata
    xmlns:dc="http://purl.org/dc/elements/1.1/">

    <dc:identifier
      id="bookid">${escapeXml(
        bookId
      )}</dc:identifier>

    <dc:title>${escapeXml(
      bookTitle
    )}</dc:title>

    <dc:language>
      zh
    </dc:language>

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
// XML ESCAPE
// ==================================================

function escapeXml(
  value
) {

  return String(
    value ||
    ""
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



// ==================================================
// SAFE FILE NAME
// ==================================================

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



// ==================================================
// JSON RESPONSE
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
      status:

        status,

      headers: {

        "content-type":
          "application/json;charset=UTF-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
