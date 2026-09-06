export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stories" && request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT *
        FROM stories
        ORDER BY datetime(accessed_at) DESC
        LIMIT 10
      `).all();

      return json(results);
    }

    if (url.pathname === "/api/stories" && request.method === "POST") {
      const body = await request.json();
      const storyUrl = (body.story_url || "").trim();

      if (!storyUrl) {
        return json({ error: "Please enter a URL." }, 400);
      }

      if (!storyUrl.includes("asianfanfics.com")) {
        return json({ error: "Please enter an Asianfanfics URL." }, 400);
      }

      const now = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO stories (
          story_url,
          title,
          accessed_at,
          last_updated
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(story_url)
        DO UPDATE SET
          accessed_at = excluded.accessed_at,
          last_updated = excluded.last_updated
      `)
        .bind(
          storyUrl,
          temporaryTitle(storyUrl),
          now,
          now
        )
        .run();

      return json({ success: true });
    }

    if (
      url.pathname.startsWith("/api/stories/") &&
      request.method === "DELETE"
    ) {
      const id = url.pathname.split("/").pop();

      await env.DB.prepare(
        "DELETE FROM stories WHERE id = ?"
      )
        .bind(id)
        .run();

      return json({ success: true });
    }

    return new Response(page(), {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  });
}

function temporaryTitle(storyUrl) {
  try {
    const u = new URL(storyUrl);
    const parts = u.pathname.split("/").filter(Boolean);

    const storyIndex = parts.indexOf("view");

    if (storyIndex !== -1 && parts[storyIndex + 1]) {
      return "Asianfanfics Story #" + parts[storyIndex + 1];
    }

    return "Asianfanfics Story";
  } catch {
    return "Asianfanfics Story";
  }
}

function page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Fanfic Kindle</title>

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
      padding: 28px 18px 60px;

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
        0 3px 14px rgba(0,0,0,0.05);
    }

    input {
      width: 100%;
      padding: 15px;

      border: 1px solid #ddd;
      border-radius: 11px;

      font-size: 16px;
      margin-bottom: 12px;
    }

    button {
      border: 0;
      border-radius: 10px;
      padding: 13px 16px;

      font-size: 16px;
      cursor: pointer;
    }

    .primary {
      width: 100%;
      background: #111;
      color: white;
    }

    .story-title {
      font-size: 18px;
      font-weight: 650;
      margin-bottom: 7px;
    }

    .story-url {
      font-size: 13px;
      color: #777;

      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      margin-bottom: 14px;
    }

    .buttons {
      display: flex;
      gap: 8px;
    }

    .update {
      flex: 1;
      background: #111;
      color: white;
    }

    .delete {
      background: #ececec;
      color: #333;
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

    .error {
      color: #b42318;
    }

    .success {
      color: #18794e;
    }
  </style>
</head>

<body>

  <h1>📚 Fanfic Kindle</h1>

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

  <h2>My Library</h2>

  <div id="library">
    <div class="card empty">
      Loading...
    </div>
  </div>

<script>
  async function loadStories() {
    const response =
      await fetch("/api/stories");

    const stories =
      await response.json();

    const library =
      document.getElementById("library");

    if (!stories.length) {
      library.innerHTML =
        '<div class="card empty">No stories yet.</div>';

      return;
    }

    library.innerHTML =
      stories.map(story => \`
        <div class="card">

          <div class="story-title">
            \${escapeHtml(story.title || "Untitled Story")}
          </div>

          <div class="story-url">
            \${escapeHtml(story.story_url)}
          </div>

          <div class="buttons">

            <button
              class="update"
              onclick="touchStory(\${story.id})"
            >
              Update
            </button>

            <button
              class="delete"
              onclick="deleteStory(\${story.id})"
            >
              Delete
            </button>

          </div>

        </div>
      \`).join("");
  }

  async function addStory() {
    const input =
      document.getElementById("storyUrl");

    const message =
      document.getElementById("message");

    const storyUrl =
      input.value.trim();

    message.textContent = "";

    const response =
      await fetch("/api/stories", {
        method: "POST",

        headers: {
          "content-type": "application/json"
        },

        body: JSON.stringify({
          story_url: storyUrl
        })
      });

    const result =
      await response.json();

    if (!response.ok) {
      message.className =
        "message error";

      message.textContent =
        result.error || "Something went wrong.";

      return;
    }

    message.className =
      "message success";

    message.textContent =
      "Story saved.";

    input.value = "";

    await loadStories();
  }

  async function touchStory(id) {
    alert(
      "Update is connected. " +
      "In the next step we will make this " +
      "check Asianfanfics chapters."
    );
  }

  async function deleteStory(id) {
    const confirmed =
      confirm(
        "Remove this story from your library?"
      );

    if (!confirmed) {
      return;
    }

    await fetch(
      "/api/stories/" + id,
      {
        method: "DELETE"
      }
    );

    await loadStories();
  }

  function escapeHtml(value) {
    const div =
      document.createElement("div");

    div.textContent =
      value || "";

    return div.innerHTML;
  }

  loadStories();
</script>

</body>
</html>`;
}
