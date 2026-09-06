# Fanfic Kindle

将 [Asianfanfics](https://www.asianfanfics.com/) 上的文章通过 **iPhone 快捷指令（Shortcuts）** 一键导出为 EPUB 文件。

生成 EPUB 后，可以直接在 iPhone 上通过分享菜单发送至 **Kindle / Send to Kindle**，无需电脑参与。

## Features

- 📱 全程可在 iPhone 上完成
- 📖 自动读取 Asianfanfics 文章标题、Description、Foreword 和全部章节
- ⚡ 并行获取章节内容，生成速度较快
- 📚 自动生成标准 EPUB 文件
- 🧹 自动处理部分 HTML / XHTML 兼容问题
- 📤 生成后可直接使用 iPhone Share Sheet 发送至 Kindle
- 🔐 不需要手动复制或保存 Asianfanfics Cookie

## How It Works

整体流程如下：

1. Safari 使用当前已登录的 Asianfanfics 会话读取文章和章节列表
2. Safari 页面中的 JavaScript 并行获取各章节的 signed HTMX URL
3. JavaScript 并行读取全部章节正文
4. Shortcut 将整理后的文章数据发送至 Cloudflare Worker
5. Worker 负责 XHTML 清理和 EPUB 打包
6. iPhone 打开 Share Sheet，可直接发送至 Kindle

---

# iPhone Shortcut Setup

## 1. Enable JavaScript in Shortcuts

在 iPhone 中打开：

```text
Settings
→ Shortcuts
→ Advanced
→ Allow Running Scripts
```

确保：

**Allow Running Scripts**

已经开启。

---

## 2. Create a Shortcut

新建一个快捷指令，例如：

```text
Fan Kindle
```

设置该快捷指令可以从 Safari Share Sheet 接收网页。

最终快捷指令只需要三个动作：

```text
① Run JavaScript on Web Page

↓

② Get Contents of URL

↓

③ Share
```

---

# Step 1 — Run JavaScript on Web Page

添加：

```text
Run JavaScript on Web Page
```

其中 **Web Page** 选择：

```text
Shortcut Input
```

删除默认 JavaScript，然后完整粘贴下面代码：

```javascript
(function () {

  var parser =
    new DOMParser();


  // ==================================================
  // Helpers
  // ==================================================

  function fetchText(
    url,
    options
  ) {

    return fetch(
      url,
      options || {}
    )
    .then(function (response) {

      if (!response.ok) {

        throw new Error(
          "HTTP " +
          response.status
        );
      }

      return response.text();
    });
  }


  function findChapterEndpoint(
    html
  ) {

    var doc =
      parser.parseFromString(
        html,
        "text/html"
      );


    var nodes =
      doc.querySelectorAll(
        "[hx-get]"
      );


    for (
      var i = 0;
      i < nodes.length;
      i++
    ) {

      var hx =
        nodes[i].getAttribute(
          "hx-get"
        ) || "";


      if (
        hx.indexOf(
          "/htmx/chapter/"
        ) === 0
      ) {

        return hx;
      }
    }


    return "";
  }


  function extractChapterBody(
    html
  ) {

    var doc =
      parser.parseFromString(
        html,
        "text/html"
      );


    var bodies =
      doc.querySelectorAll(
        ".user-content"
      );


    if (
      !bodies.length
    ) {

      throw new Error(
        "Chapter body not found."
      );
    }


    var result =
      "";


    for (
      var i = 0;
      i < bodies.length;
      i++
    ) {

      result +=
        bodies[i].innerHTML;
    }


    if (
      !result.trim()
    ) {

      throw new Error(
        "Chapter body is empty."
      );
    }


    return result;
  }


  // ==================================================
  // Story ID
  // ==================================================

  var storyMatch =
    location.pathname.match(
      /^\/story\/view\/(\d+)/
    );


  if (!storyMatch) {

    completion(
      JSON.stringify({
        error:
          "This is not an Asianfanfics story page."
      })
    );

    return;
  }


  var storyId =
    storyMatch[1];


  // ==================================================
  // Load story page with Safari login
  // ==================================================

  fetchText(
    location.href,
    {
      credentials:
        "include"
    }
  )

  .then(function (storyHtml) {

    var doc =
      parser.parseFromString(
        storyHtml,
        "text/html"
      );


    // ==================================================
    // Title
    // ==================================================

    var title =
      (
        doc.title ||
        "Fanfic"
      )
      .replace(
        /\s*-\s*Asianfanfics\s*$/i,
        ""
      )
      .trim();


    // ==================================================
    // Chapter list
    // ==================================================

    var links =
      doc.querySelectorAll(
        "a[href]"
      );


    var chapterPattern =
      new RegExp(
        "^\\/story\\/view\\/" +
        storyId +
        "\\/(\\d+)\\/"
      );


    var seen =
      {};


    var chapters =
      [];


    for (
      var i = 0;
      i < links.length;
      i++
    ) {

      var href =
        links[i].getAttribute(
          "href"
        ) || "";


      var match =
        href.match(
          chapterPattern
        );


      if (!match) {
        continue;
      }


      var number =
        Number(
          match[1]
        );


      if (
        seen[number]
      ) {
        continue;
      }


      seen[number] =
        true;


      var chapterTitle =
        (
          links[i].textContent ||
          ""
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


      if (
        !chapterTitle ||
        chapterTitle ===
          "Refresh the page to try again."
      ) {

        chapterTitle =
          "Chapter " +
          number;
      }


      chapters.push({
        number:
          number,

        title:
          chapterTitle,

        pageUrl:
          new URL(
            href,
            location.origin
          ).href
      });
    }


    chapters.sort(
      function (a, b) {

        return (
          a.number -
          b.number
        );
      }
    );


    if (
      !chapters.length
    ) {

      throw new Error(
        "No chapters found."
      );
    }


    // ==================================================
    // Description / Foreword endpoint
    // ==================================================

    var storyEndpoint =
      "";


    var nodes =
      doc.querySelectorAll(
        "[hx-get]"
      );


    var prefix =
      "/htmx/story/" +
      storyId +
      "/";


    for (
      var j = 0;
      j < nodes.length;
      j++
    ) {

      var hx =
        nodes[j].getAttribute(
          "hx-get"
        ) || "";


      if (
        hx.indexOf(
          prefix
        ) !== 0
      ) {
        continue;
      }


      var rest =
        hx.substring(
          prefix.length
        );


      if (
        rest &&
        rest.indexOf("/") === -1 &&
        rest.indexOf("?") === -1
      ) {

        storyEndpoint =
          hx;

        break;
      }
    }


    // ==================================================
    // Fetch Description / Foreword
    // ==================================================

    var introPromise =
      Promise.resolve({
        description_html:
          "",

        foreword_html:
          ""
      });


    if (
      storyEndpoint
    ) {

      introPromise =
        fetchText(
          location.origin +
          storyEndpoint,
          {
            credentials:
              "include",

            headers: {
              "HX-Request":
                "true",

              "HX-Current-URL":
                location.href
            }
          }
        )

        .then(function (html) {

          var introDoc =
            parser.parseFromString(
              html,
              "text/html"
            );


          var description =
            introDoc.querySelector(
              "#story-description"
            );


          var foreword =
            introDoc.querySelector(
              "#story-foreword"
            );


          return {
            description_html:
              description
                ? description.innerHTML
                : "",

            foreword_html:
              foreword
                ? foreword.innerHTML
                : ""
          };
        })

        .catch(function () {

          return {
            description_html:
              "",

            foreword_html:
              ""
          };
        });
    }


    // ==================================================
    // Fetch all chapter pages in parallel
    // and obtain signed HTMX URLs
    // ==================================================

    var signedUrlPromises =
      chapters.map(
        function (chapter) {

          return fetchText(
            chapter.pageUrl,
            {
              credentials:
                "include"
            }
          )

          .then(function (html) {

            var endpoint =
              findChapterEndpoint(
                html
              );


            if (!endpoint) {

              throw new Error(
                "Signed URL not found for chapter " +
                chapter.number +
                "."
              );
            }


            return {
              number:
                chapter.number,

              title:
                chapter.title,

              pageUrl:
                chapter.pageUrl,

              signedUrl:
                location.origin +
                endpoint
            };
          });
        }
      );


    return Promise.all([
      introPromise,
      Promise.all(
        signedUrlPromises
      )
    ])

    .then(function (result) {

      return {
        title:
          title,

        intro:
          result[0],

        chapters:
          result[1]
      };
    });
  })


  // ==================================================
  // Fetch all chapter bodies in parallel
  // ==================================================

  .then(function (data) {

    var bodyPromises =
      data.chapters.map(
        function (chapter) {

          return fetchText(
            chapter.signedUrl,
            {
              credentials:
                "omit",

              headers: {
                "HX-Request":
                  "true",

                "HX-Current-URL":
                  chapter.pageUrl
              }
            }
          )

          .then(function (html) {

            return {
              number:
                chapter.number,

              title:
                chapter.title,

              html:
                extractChapterBody(
                  html
                )
            };
          });
        }
      );


    return Promise.all(
      bodyPromises
    )

    .then(function (chapters) {

      chapters.sort(
        function (a, b) {

          return (
            a.number -
            b.number
          );
        }
      );


      return {
        title:
          data.title,

        description_html:
          data.intro.description_html,

        foreword_html:
          data.intro.foreword_html,

        chapters:
          chapters
      };
    });
  })


  // ==================================================
  // Send book data back to Shortcut
  // ==================================================

  .then(function (book) {

    completion(
      JSON.stringify(
        book
      )
    );
  })


  .catch(function (error) {

    completion(
      JSON.stringify({
        error:
          error.message ||
          String(error)
      })
    );
  });

})();
```

---

# Step 2 — Get Contents of URL

在 JavaScript 动作下面添加：

```text
Get Contents of URL
```

URL：

```text
https://fanfic.rbdnxkwndn.workers.dev/api/shortcut/epub
```

设置：

```text
Method:
POST
```

添加 Header：

```text
Content-Type: application/json
```

Request Body 选择：

```text
File
```

File 选择第一步产生的：

```text
JavaScript Result
```

最终类似：

```text
Get Contents of URL

URL:
https://fanfic.rbdnxkwndn.workers.dev/api/shortcut/epub

Method:
POST

Headers:
Content-Type → application/json

Request Body:
File → JavaScript Result
```

---

# Step 3 — Share

最后添加：

```text
Share
```

输入选择：

```text
Contents of URL
```

最终完整 Shortcut：

```text
① Run JavaScript on Web Page
        ↓
② Get Contents of URL
        ↓
③ Share
```

---

# Usage

使用前请确保：

1. iPhone Safari 已登录 Asianfanfics
2. 在 Safari 中打开需要导出的文章页面
3. 点击 Safari 的 Share 按钮
4. 选择 `Fan Kindle`
5. 等待 EPUB 生成
6. 在出现的 Share Sheet 中选择 Kindle / Send to Kindle

即：

```text
Asianfanfics
→ Share
→ Fan Kindle
→ EPUB
→ Kindle
```

无需手动复制文章，也无需手动复制 Cookie。

---

# Cloudflare Worker

本项目使用 Cloudflare Worker 将 Shortcut 发送过来的文章内容转换为 EPUB。

核心接口：

```text
POST /api/shortcut/epub
```

完整地址：

```text
https://fanfic.rbdnxkwndn.workers.dev/api/shortcut/epub
```

Shortcut 会向该接口发送：

```json
{
  "title": "Story Title",
  "description_html": "...",
  "foreword_html": "...",
  "chapters": [
    {
      "number": 1,
      "title": "Chapter 1",
      "html": "..."
    }
  ]
}
```

Worker 负责：

```text
HTML
↓
XHTML cleanup
↓
EPUB structure
↓
ZIP
↓
.epub
```

---

# Project Structure

```text
Fanfic
├── src
│   └── index.js
│
├── package.json
├── wrangler.jsonc
└── README.md
```

---

# Notes

- Shortcut 依赖 Asianfanfics 当前的网页结构。如果网站未来修改页面结构、HTMX endpoint 或章节 DOM，脚本可能需要同步更新。
- 建议在运行 Shortcut 前确认 Safari 中已经正常登录 Asianfanfics。
- 章节较多的文章需要处理更多网络请求，生成时间可能相应增加。
- 本项目主要用于个人阅读、格式转换与技术学习。请遵守 Asianfanfics 的服务条款以及相关内容的版权和授权要求。
