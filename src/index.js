export default {
  async fetch(request) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fanfic Kindle</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 30px 20px;
      background: #f7f7f7;
      color: #222;
    }

    h1 {
      margin-bottom: 6px;
    }

    .subtitle {
      color: #777;
      margin-bottom: 30px;
    }

    .card {
      background: white;
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }

    input {
      box-sizing: border-box;
      width: 100%;
      padding: 14px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 10px;
      margin-bottom: 12px;
    }

    button {
      width: 100%;
      padding: 14px;
      border: 0;
      border-radius: 10px;
      background: #111;
      color: white;
      font-size: 16px;
      cursor: pointer;
    }

    .library {
      margin-top: 35px;
    }

    .empty {
      color: #888;
      text-align: center;
      padding: 30px 0;
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
      type="url"
      placeholder="Paste Asianfanfics story URL"
    >

    <button>
      Add Story
    </button>

  </div>

  <div class="library">

    <h2>My Library</h2>

    <div class="card empty">
      No stories yet.
    </div>

  </div>

</body>
</html>`,
      {
        headers: {
          "content-type": "text/html;charset=UTF-8",
        },
      }
    );
  },
};
