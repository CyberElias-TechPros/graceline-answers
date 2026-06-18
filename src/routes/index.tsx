import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GraceLine Answers — Source for cPanel deployment" },
      { name: "description", content: "Single Node.js app for cPanel/DirectAdmin shared hosting." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f5f0", color: "#1f2a37", fontFamily: "ui-serif, Georgia, serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 36, margin: 0 }}>GraceLine Answers</h1>
        <p style={{ color: "#475569", fontSize: 17 }}>
          Evangelical counseling & Bible Q&A — a single Node.js app you deploy
          to your cPanel / DirectAdmin shared hosting.
        </p>

        <h2 style={{ marginTop: 32 }}>Where the code lives</h2>
        <p>
          The deployable app is in the <code>cpanel-app/</code> folder of this
          project. That folder is what you upload to your hosting account. It
          contains Express (server) + React/Vite (frontend) + SQLite (data),
          all bundled to run from a single <code>app.js</code> entry that
          Passenger can start.
        </p>

        <h2>To deploy</h2>
        <ol style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>
          <li>Download / zip the <code>cpanel-app/</code> folder.</li>
          <li>Upload it to your hosting (File Manager or Git).</li>
          <li>cPanel → <strong>Setup Node.js App</strong> → startup file <code>app.js</code>.</li>
          <li>Set env vars from <code>.env.example</code> (JWT secret, admin email/password, SMTP, public URL).</li>
          <li>Run NPM Install → <code>npm run build</code> → Restart.</li>
        </ol>
        <p>Full step-by-step in <code>cpanel-app/DEPLOY.md</code>.</p>

        <h2>What's included in the MVP</h2>
        <ul style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>
          <li>Anonymous question submission (IP never logged) with crisis-keyword detection.</li>
          <li>Private threaded chat via tracking link, polled every 3s.</li>
          <li>Counselor admin: inbox, reply, internal notes, sanitize-and-publish.</li>
          <li>Public searchable archive (SQLite FTS5).</li>
          <li>Prayer wall with "I prayed" counter.</li>
          <li>Email notifications via your cPanel SMTP account.</li>
        </ul>

        <p style={{ marginTop: 32, color: "#475569", fontSize: 14 }}>
          This Lovable preview pane is informational only — the actual app runs
          on your hosting, not here.
        </p>
      </div>
    </div>
  );
}
